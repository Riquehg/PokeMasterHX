// --- src/systems/socket.js ---
// Gestão de Conexão Socket.io, Autenticação Remota e Sincronização Online

import { gameState, ensureValidGameState, currentAuthenticatedAccount, getCurrentOrMyPlayer } from '../core/state.js';
import { applyOnlineRoomState, showOnlineGameLayout, currentJoinedOnlineRoomId } from '../systems/lobby.js';
import { renderTeamCardSlots, renderBottomPanel } from './pcbox.js';
import { renderBoardMap } from './map.js';

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
                if (typeof appendAdventureLog === 'function') {
                    appendAdventureLog("🌐 Conectado com sucesso ao servidor online.");
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
                if (typeof appendAdventureLog === 'function') {
                    appendAdventureLog("⚠️ Conexão com o servidor online perdida.");
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

            // Sincronização estrita de estado entre os jogadores da sala
            socket.off('sync_game_state');
            socket.on('sync_game_state', (data) => {
                if (data && data.gameState && typeof gameState !== 'undefined') {
                    // Atualiza de forma segura preservando a estrutura local do jogador
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
                    }
                }
            });

            socket.off('room_chat_broadcast');
            socket.on('room_chat_broadcast', (msgData) => {
                if (msgData && msgData.text) {
                    if (!Array.isArray(gameState.chatMessages)) {
                        gameState.chatMessages = [];
                    }
                    gameState.chatMessages.push({
                        sender: msgData.sender || 'Treinador',
                        text: msgData.text
                    });
                    if (gameState.chatMessages.length > 100) {
                        gameState.chatMessages = gameState.chatMessages.slice(-100);
                    }
                    if (typeof renderChatMessages === 'function') {
                        renderChatMessages();
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
