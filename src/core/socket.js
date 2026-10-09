// --- src/core/socket.js ---
// Gestão de Conexão Socket.io, Autenticação Remota e Sincronização Online

import { gameState, ensureValidGameState } from './state.js';
import { saveGameProgress } from './storage.js';

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
