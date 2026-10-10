// --- src/core/socket.js ---
// Gestão de Conexão Socket.io, Autenticação Remota e Sincronização Online

import { gameState, ensureValidGameState } from './state.js';
import { saveGameProgress } from './storage.js';
import { applyOnlineRoomState, showOnlineGameLayout, currentJoinedOnlineRoomId } from '../systems/lobby.js';

export let socket = null;
export let currentAuthenticatedAccount = null;

export function initializeSocketConnection() {
    try {
        if (typeof io !== 'undefined') {
            socket = io('https://pokemasterhx.onrender.com', {
                transports: ['websocket', 'polling']
            });

            socket.on('connect', () => {
                console.log("🟢 Conectado ao servidor Socket.io! ID:", socket.id);
                if (typeof appendAdventureLog === 'function') {
                    appendAdventureLog("🌐 Conectado com sucesso ao servidor online.");
                }
            });

            socket.on('disconnect', () => {
                console.warn("🔴 Desconectado do servidor Socket.io.");
                if (typeof appendAdventureLog === 'function') {
                    appendAdventureLog("⚠️ Conexão com o servidor online perdida.");
                }
            });

            socket.on('login_response', (response) => {
                if (typeof window.handleLoginResponse === 'function') {
                    window.handleLoginResponse(response);
                }
            });

            socket.on('rooms_list_update', (rooms) => {
                if (typeof window.renderRoomsList === 'function') {
                    window.renderRoomsList(rooms);
                }
            });

            // Confirmação de entrada na sala
            socket.on('room_joined', (data) => {
                if (data && (data.roomId || data.id)) {
                    if (typeof showCustomPopup === 'function') {
                        showCustomPopup('Sala Online', 'Entraste na sala com sucesso! Aguarda o Host iniciar a partida.', true);
                    }
                }
            });

            // Início do jogo na sala online (Ativa o layout partilhado)
            socket.on('room_game_started', (data) => {
                if (applyOnlineRoomState(data)) {
                    showOnlineGameLayout();
                } else if (typeof showCustomPopup === 'function') {
                    showCustomPopup('Erro ao Iniciar', 'Não foi possível sincronizar os dados da sala para iniciar a partida.', false);
                }
            });

            // Sincronização em tempo real do estado de jogo entre os jogadores
            socket.on('game_state_update', (data) => {
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

            // Mensagens de chat em tempo real na sala
            socket.on('room_chat_message', (msgData) => {
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
    if (!socket || typeof socket.emit !== 'function') {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup(
                'Conexão indisponível',
                'Não foi possível comunicar com o servidor online. Verifique a sua ligação.',
                false
            );
        }
        return false;
    }
    socket.emit(eventName, payload);
    return true;
}

window.socket = socket;
window.initializeSocketConnection = initializeSocketConnection;
window.emitSocket = emitSocket;
