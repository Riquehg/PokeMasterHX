// --- src/systems/socket.js ---
// Gestão de Conexão Socket.io, Autenticação Remota e Sincronização Online

import { gameState, ensureValidGameState, currentAuthenticatedAccount, getCurrentOrMyPlayer } from '../core/state.js';
import { applyOnlineRoomState, showOnlineGameLayout, currentJoinedOnlineRoomId } from '../systems/lobby.js';
import { renderTeamCardSlots, renderBottomPanel } from '../systems/pcbox.js';
import { renderBoardMap } from '../systems/map.js';

export let socket = null;
export { currentAuthenticatedAccount };

export function initializeSocketConnection() {
    try {
        if (typeof io !== 'undefined') {
            if (socket && socket.connected) {
                return socket;
            }

            socket = io('https://pokemasterhx.onrender.com', {
                transports: ['websocket', 'polling']
            });

            window.socket = socket;

            socket.on('connect', () => {
                console.log("🟢 Conectado ao servidor Socket.io! ID:", socket.id);
                if (typeof window.pushAdventureLog === 'function') {
                    window.pushAdventureLog("🌐 Conectado com sucesso ao servidor online.");
                }

                if (typeof currentJoinedOnlineRoomId !== 'undefined' && currentJoinedOnlineRoomId) {
                    socket.emit('reconnect_sync', {
                        roomId: currentJoinedOnlineRoomId,
                        email: currentAuthenticatedAccount
                    });
                }
            });

            socket.on('disconnect', () => {
                console.warn("🔴 Desconectado do servidor Socket.io.");
                if (typeof window.pushAdventureLog === 'function') {
                    window.pushAdventureLog("⚠️ Conexão com o servidor online perdida.");
                }
            });

            // Tratamento de desconexão de jogadores da sala (Remove o peão congelado do tabuleiro)
            socket.off('player_disconnected');
            socket.on('player_disconnected', (data) => {
                const disconnectedIndex = data && (data.playerIndex !== undefined ? data.playerIndex : data.index);
                if (gameState && Array.isArray(gameState.players)) {
                    if (disconnectedIndex !== undefined && gameState.players[disconnectedIndex]) {
                        const removedPlayer = gameState.players[disconnectedIndex];
                        gameState.players.splice(disconnectedIndex, 1);
                        if (typeof window.pushAdventureLog === 'function') {
                            window.pushAdventureLog(`⚠️ O treinador ${removedPlayer.name || 'Adversário'} desconectou-se da partida.`);
                        }
                        if (typeof showCustomPopup === 'function') {
                            showCustomPopup("Treinador Desconectado", `O jogador ${removedPlayer.name || 'Adversário'} abandonou a sala.`, false);
                        }
                    }
                    if (typeof renderBoardMap === 'function') {
                        renderBoardMap();
                    }
                }
            });

            // === SISTEMA DE CONVITES POKÉMON (PvP e Trocas com Confirmação Real) ===
            socket.off('receive_pvp_invite');
            socket.on('receive_pvp_invite', (data) => {
                const challengerName = data.challengerName || data.name || 'Treinador';
                const challengerIndex = data.challengerIndex !== undefined ? data.challengerIndex : 0;
                if (typeof window.showPvPAcceptModal === 'function') {
                    window.showPvPAcceptModal(challengerName, challengerIndex);
                }
            });

            socket.off('receive_trade_invite');
            socket.on('receive_trade_invite', (data) => {
                const challengerName = data.challengerName || data.name || 'Treinador';
                const challengerIndex = data.challengerIndex !== undefined ? data.challengerIndex : 0;
                if (typeof window.showTradeAcceptModal === 'function') {
                    window.showTradeAcceptModal(challengerName, challengerIndex);
                }
            });

            // Tratamento de ações rejeitadas pelo servidor (ex: jogar fora de turno)
            socket.off('action_rejected');
            socket.on('action_rejected', (data) => {
                const msg = data && data.message ? data.message : 'Ação rejeitada pelo servidor.';
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup('Aviso de Turno', `⚠ ${msg}`, false);
                }
            });

            socket.off('login_response');
            socket.on('login_response', (response) => {
                if (response && response.success && (response.accountEmail || response.email)) {
                    window.currentAuthenticatedAccount = response.accountEmail || response.email;
                }
                if (typeof window.handleLoginResponse === 'function') {
                    window.handleLoginResponse(response);
                }
            });

            socket.off('rooms_list_update');
            socket.on('rooms_list_update', (rooms) => {
                if (typeof window.renderRoomsList === 'function') {
                    window.renderRoomsList(rooms);
                }
            });

            socket.off('rooms_list_response');
            socket.on('rooms_list_response', (rooms) => {
                if (typeof window.renderRoomsList === 'function') {
                    window.renderRoomsList(rooms);
                }
            });

            socket.off('room_joined');
            socket.on('room_joined', (data) => {
                if (data && (data.roomId || data.id)) {
                    if (data.gameState && typeof applyOnlineRoomState === 'function') {
                        applyOnlineRoomState(data);
                    }
                    if (typeof showCustomPopup === 'function') {
                        showCustomPopup('Sala Online', 'Entraste na sala com sucesso! Aguarda o Host iniciar a partida.', true);
                    }
                }
            });

            socket.off('room_game_started');
            socket.on('room_game_started', (data) => {
                if (applyOnlineRoomState(data)) {
                    showOnlineGameLayout();
                } else if (typeof showCustomPopup === 'function') {
                    showCustomPopup('Erro ao Iniciar', 'Não foi possível sincronizar os dados da sala para iniciar a partida.', false);
                }
            });

            // Sincronização em tempo real dos Logs de Jogo Globais
            socket.off('game_log_broadcast');
            socket.on('game_log_broadcast', (logData) => {
                if (logData && logData.message) {
                    if (typeof window.pushAdventureLog === 'function') {
                        window.pushAdventureLog(`[Global] ${logData.message}`);
                    }
                }
            });

            // Sincronização estrita de estado entre os jogadores da sala
            socket.off('sync_game_state');
            socket.on('sync_game_state', (data) => {
                if (data && data.gameState && typeof gameState !== 'undefined') {
                    Object.assign(gameState, data.gameState);
                    if (typeof ensureValidGameState === 'function') {
                        ensureValidGameState();
                    }
                }

                if (applyOnlineRoomState(data)) {
                    if (typeof refreshGameInterface === 'function') {
                        refreshGameInterface();
                    } else {
                        if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
                        if (typeof renderBottomPanel === 'function') renderBottomPanel();
                        if (typeof renderBoardMap === 'function') renderBoardMap();
                        if (typeof updateTurnIndicatorUI === 'function') updateTurnIndicatorUI();
                    }
                }
            });

            // Sincronização do Chat Online em tempo real
            socket.off('room_chat_broadcast');
            socket.on('room_chat_broadcast', (msgData) => {
                if (msgData && (msgData.text || msgData.message)) {
                    const messageText = msgData.text || msgData.message;
                    const senderName = msgData.sender || msgData.senderName || 'Treinador';

                    if (!Array.isArray(gameState.chatMessages)) {
                        gameState.chatMessages = [];
                    }
                    gameState.chatMessages.push({
                        sender: senderName,
                        text: messageText
                    });
                    if (gameState.chatMessages.length > 100) {
                        gameState.chatMessages = gameState.chatMessages.slice(-100);
                    }

                    // Renderizar diretamente na UI de chat se estiver ativa
                    const targetChatBox = document.getElementById('chat-messages-container') || document.getElementById('room-chat-box');
                    if (targetChatBox) {
                        const msgEl = document.createElement('div');
                        msgEl.className = 'text-[10px] text-slate-200 py-0.5 px-1 rounded bg-black/40 mb-1';
                        msgEl.innerHTML = `<strong class="text-amber-400">${senderName}:</strong> ${messageText}`;
                        targetChatBox.appendChild(msgEl);
                        targetChatBox.scrollTop = targetChatBox.scrollHeight;
                    }

                    if (typeof renderChatMessages === 'function') {
                        renderChatMessages();
                    }

                    if (typeof window.pushAdventureLog === 'function') {
                        window.pushAdventureLog(`💬 [Chat] ${senderName}: ${messageText}`);
                    }
                }
            });

            socket.off('trade_synchronized');
            socket.on('trade_synchronized', (data) => {
                if (data && data.gameState) {
                    if (typeof gameState !== 'undefined') {
                        Object.assign(gameState, data.gameState);
                    }
                    if (typeof refreshGameInterface === 'function') {
                        refreshGameInterface();
                    } else {
                        if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
                        if (typeof renderBottomPanel === 'function') renderBottomPanel();
                    }
                    if (typeof showCustomPopup === 'function') {
                        showCustomPopup('🌐 Sincronização Online', 'Uma troca foi efetuada na sua sala e o estado foi atualizado!', true);
                    }
                }
            });
        } else {
            console.warn("⚠️ Biblioteca Socket.io não encontrada no escopo global.");
        }
    } catch (err) {
        console.error("Erro ao inicializar Socket.io:", err);
    }

    return socket;
}

export function emitSocket(eventName, payload) {
    const activeSocket = socket || window.socket;
    if (!activeSocket || typeof activeSocket.emit !== 'function') {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup(
                'Conexão indisponível',
                'Não foi possível comunicar com o servidor online. Verifique a sua ligação.',
                false
            );
        }
        return false;
    }
    activeSocket.emit(eventName, payload);
    return true;
}

window.initializeSocketConnection = initializeSocketConnection;
window.emitSocket = emitSocket;
window.socket = socket;
