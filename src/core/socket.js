// --- src/core/socket.js ---
// Gestão de Conexão Socket.io, Autenticação Remota e Sincronização Online

import { gameState, ensureValidGameState } from './state.js';
import { saveGameProgress } from './core/storage.js';

export let socket = null;
export let currentAuthenticatedAccount = null;

export function initializeSocketConnection() {
    try {
        if (typeof io !== 'undefined') {
            // Conecta ao servidor Socket.io alojado no Render (ou URL atual)
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

            // Ouve a resposta de autenticação/login da conta
            socket.on('login_response', (response) => {
                if (typeof window.handleLoginResponse === 'function') {
                    window.handleLoginResponse(response);
                }
            });

            // Ouve atualizações de salas online e lobby
            socket.on('rooms_list_update', (rooms) => {
                if (typeof window.renderRoomsList === 'function') {
                    window.renderRoomsList(rooms);
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

// Expor globalmente para uso nos outros módulos
window.socket = socket;
window.initializeSocketConnection = initializeSocketConnection;
window.emitSocket = emitSocket;
