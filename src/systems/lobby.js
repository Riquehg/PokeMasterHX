// --- src/systems/lobby.js ---
// Sistema de Lobby Online, Salas, Sincronização de Partida, Chat e Ranking

import { gameState, ensureValidGameState, getCurrentPlayer, currentAuthenticatedAccount } from '../core/state.js';
import { saveGameProgress } from '../core/storage.js';
import { emitSocket, socket } from '../core/socket.js';

export let currentJoinedOnlineRoomId = null;
export let onlineRoomStarted = false;
export let onlineBoardReady = false;

export function getOnlinePlayerPayload() {
    try {
        const player = typeof getCurrentPlayer === 'function' ? getCurrentPlayer() : null;
        return player ? {
            ...player,
            accountEmail: typeof currentAuthenticatedAccount !== 'undefined' ? currentAuthenticatedAccount : null
        } : null;
    } catch (error) {
        return null;
    }
}

export function extractOnlineGameState(data) {
    if (!data || typeof data !== 'object') return null;

    const possibleStates = [
        data.gameState, data.game_state,
        data.roomState?.gameState, data.roomState?.game_state,
        data.room?.gameState, data.room?.game_state,
        data.state?.gameState, data.state?.game_state, data.state
    ];

    for (const candidate of possibleStates) {
        if (candidate && typeof candidate === 'object' && Array.isArray(candidate.players)) {
            return candidate;
        }
    }

    if (Array.isArray(data.players)) {
        return {
            ...(typeof gameState !== 'undefined' && gameState ? gameState : {}),
            players: data.players,
            currentPlayerIndex: Number(data.currentPlayerIndex) || 0,
            turn: Number(data.turn) || 1
        };
    }

    return null;
}

export function extractOnlineBoard(data) {
    if (!data || typeof data !== 'object') return null;

    const possibleBoards = [
        data.boardPokemonCards, data.board_pokemon_cards,
        data.roomState?.boardPokemonCards, data.roomState?.board_pokemon_cards,
        data.room?.boardPokemonCards, data.room?.board_pokemon_cards,
        data.state?.boardPokemonCards, data.state?.board_pokemon_cards
    ];

    for (const candidate of possibleBoards) {
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
            return candidate;
        }
    }

    return null;
}

export function applyOnlineRoomState(data) {
    const sharedState = extractOnlineGameState(data);
    const sharedBoard = extractOnlineBoard(data);

    if (!sharedState || !Array.isArray(sharedState.players)) return false;

    Object.assign(gameState, {
        ...sharedState,
        setupDone: true,
        online: true,
        onlineRoomId: currentJoinedOnlineRoomId,
        currentPlayerIndex: Number.isInteger(Number(sharedState.currentPlayerIndex)) ? Number(sharedState.currentPlayerIndex) : 0,
        turn: Math.max(1, Number(sharedState.turn) || 1),
        players: sharedState.players.map(player => ({
            ...player,
            activeTeam: Array.isArray(player?.activeTeam) ? player.activeTeam : [],
            pcBox: Array.isArray(player?.pcBox) ? player.pcBox : [],
            inventory: Array.isArray(player?.inventory) ? player.inventory : [],
            badges: Array.isArray(player?.badges) ? player.badges : [],
            equipmentSlots: Array.isArray(player?.equipmentSlots) ? player.equipmentSlots : [null, null]
        }))
    });

    const myEmail = typeof currentAuthenticatedAccount !== 'undefined' ? currentAuthenticatedAccount : null;
    const myPayload = getOnlinePlayerPayload();
    const myIndex = gameState.players.findIndex(p => (myEmail && p.email === myEmail) || (myPayload && p.name === myPayload.name));
    
    if (myIndex !== -1) {
        gameState.myPlayerIndex = myIndex;
    } else {
        gameState.myPlayerIndex = 0;
    }

    if (sharedBoard && typeof window.boardPokemonCards !== 'undefined') {
        window.boardPokemonCards = sharedBoard;
        onlineBoardReady = true;
    }

    if (typeof ensureValidGameState === 'function') {
        ensureValidGameState();
    }

    return true;
}

export function refreshOnlineGameInterface() {
    if (typeof ensureValidGameState === 'function') ensureValidGameState();
    if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
    if (typeof renderBottomPanel === 'function') renderBottomPanel();
    if (typeof renderChatMessages === 'function') renderChatMessages();
    if (typeof renderBoardMap === 'function') renderBoardMap();
}

export function showOnlineGameLayout() {
    const setupScreen = document.getElementById('setup-screen');
    const mainLayout = document.getElementById('main-game-layout');
    const authContainer = document.getElementById('auth-container');
    const onlineLobby = document.getElementById('online-lobby-container');
    const trainerMenu = document.getElementById('trainer-main-menu');
    const characterCreation = document.getElementById('character-creation-container');

    setupScreen?.classList.add('hidden');
    authContainer?.classList.add('hidden');
    onlineLobby?.classList.add('hidden');
    trainerMenu?.classList.add('hidden');
    characterCreation?.classList.add('hidden');
    mainLayout?.classList.remove('hidden');

    refreshOnlineGameInterface();

    if (typeof showCustomPopup === 'function') {
        showCustomPopup('Partida Online', 'A partida online foi iniciada com sucesso!', true);
    }
}

export function initLobbySocketListeners() {
    if (!socket) return;

    socket.off('rooms_list_response');
    socket.on('rooms_list_response', (rooms) => {
        renderRoomsListUI(rooms);
    });

    socket.off('room_joined');
    socket.on('room_joined', (response) => {
        if (response && response.success) {
            currentJoinedOnlineRoomId = response.roomId;
            refreshRoomsList();
        } else if (response && response.message && typeof showCustomPopup === 'function') {
            showCustomPopup('Erro na Sala', response.message, false);
        }
    });

    socket.off('room_state');
    socket.on('room_state', () => {
        refreshRoomsList();
    });

    socket.off('chat_broadcast');
    socket.on('chat_broadcast', (data) => {
        const chatBox = document.getElementById('lobby-chat-messages');
        if (chatBox && data && data.text) {
            const time = new Date(data.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            chatBox.innerHTML += `
                <div class="mb-1">
                    <span class="text-slate-500">[${time}]</span> <strong class="text-amber-400">${data.sender}:</strong> <span class="text-white">${data.text}</span>
                </div>
            `;
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    });

    socket.off('leaderboard_response');
    socket.on('leaderboard_response', (response) => {
        const rankingBox = document.getElementById('lobby-ranking-list');
        if (!rankingBox) return;

        if (!response || !response.success || !Array.isArray(response.ranking) || response.ranking.length === 0) {
            rankingBox.innerHTML = `<p class="text-slate-500 italic text-center py-4">Sem registos no ranking da liga.</p>`;
            return;
        }

        rankingBox.innerHTML = response.ranking.map((user, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
            return `
                <div class="flex justify-between items-center bg-black/40 px-2 py-1 rounded border border-amber-600/30 text-[9px]">
                    <span class="font-bold text-amber-300 truncate">${medal} ${user.trainerName}</span>
                    <span class="text-emerald-400 font-bold">${user.masterPoints} PM</span>
                </div>
            `;
        }).join('');
    });
}

export function requestLobbyRanking() {
    emitSocket('get_leaderboard');
}

export function createOnlineRoom() {
    let modal = document.getElementById('create-room-config-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'create-room-config-modal';
        modal.className = 'fixed inset-0 bg-black/90 z-[600] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="trainer-card max-w-sm w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <h3 class="text-xs font-black text-amber-400 font-cinzel">🛠️ CRIAR SALA ONLINE</h3>
                <button onclick="document.getElementById('create-room-config-modal').remove()" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800 cursor-pointer">✕</button>
            </div>
            
            <div class="space-y-3">
                <div>
                    <label class="block text-[10px] text-amber-300 font-bold mb-1">Nome da Sala:</label>
                    <input id="new-room-name-input" type="text" value="Sala de Kanto" class="w-full bg-black/60 border border-amber-600/60 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-amber-400">
                </div>

                <div>
                    <label class="block text-[10px] text-amber-300 font-bold mb-1">Modo de Jogo & Balanceamento:</label>
                    <select id="new-room-mode-select" class="w-full bg-black/60 border border-amber-600/60 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-amber-400">
                        <option value="fresh_start">Fresh Start (Competitivo do Zero)</option>
                        <option value="legacy">Livre / Legacy (Usa as equipas e itens do Solo)</option>
                    </select>
                </div>

                <div>
                    <label class="block text-[10px] text-amber-300 font-bold mb-1">Senha PIN (Opcional):</label>
                    <input id="new-room-pin-input" type="text" placeholder="Deixe em branco para sala pública" class="w-full bg-black/60 border border-amber-600/60 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-amber-400">
                </div>
            </div>

            <div class="flex gap-2 pt-2">
                <button onclick="document.getElementById('create-room-config-modal').remove()" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs cursor-pointer">Cancelar</button>
                <button onclick="window.submitCreateOnlineRoom()" class="flex-2 bg-amber-600 hover:bg-amber-500 text-black font-black py-2.5 rounded-xl text-xs uppercase cursor-pointer">Criar Sala</button>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
}

window.submitCreateOnlineRoom = function() {
    const nameInput = document.getElementById('new-room-name-input');
    const modeSelect = document.getElementById('new-room-mode-select');
    const pinInput = document.getElementById('new-room-pin-input');
    
    const roomName = nameInput ? nameInput.value.trim() : 'Sala de Kanto';
    const gameMode = modeSelect ? modeSelect.value : 'fresh_start';
    const roomPin = pinInput ? pinInput.value.trim() : '';

    if (!roomName) return;
    document.getElementById('create-room-config-modal')?.remove();

    emitSocket('create_room', {
        roomName,
        gameMode,
        maxPlayers: 4,
        allowEarlyStart: true,
        pin: roomPin,
        player: getOnlinePlayerPayload()
    });
};

export function searchOnlineRooms() {
    emitSocket('get_rooms_list');
    requestLobbyRanking();
}

export function refreshRoomsList() {
    emitSocket('get_rooms_list');
    requestLobbyRanking();
}

export function sendLobbyChatMessage() {
    const input = document.getElementById('lobby-chat-input');
    if (!input || !input.value.trim()) return;

    emitSocket('lobby_chat_message', {
        message: input.value.trim(),
        sender: typeof currentAuthenticatedAccount !== 'undefined' && currentAuthenticatedAccount ? currentAuthenticatedAccount : (getCurrentPlayer()?.name || 'Treinador')
    });

    input.value = '';
}

export function joinAndStartOnlineGame() {
    if (!currentJoinedOnlineRoomId) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup('Modo online', 'Entre em uma sala antes de iniciar a partida.', false);
        }
        return;
    }

    emitSocket('start_room_game', {
        roomId: currentJoinedOnlineRoomId,
        player: getOnlinePlayerPayload()
    });
}

export function renderRoomsListUI(rooms) {
    const container = document.getElementById('rooms-list-box') || document.getElementById('online-rooms-list-container');
    if (!container) return;

    let extraPanel = document.getElementById('lobby-extras-panel');
    if (!extraPanel) {
        const parentDiv = container.parentElement;
        if (parentDiv) {
            extraPanel = document.createElement('div');
            extraPanel.id = 'lobby-extras-panel';
            extraPanel.className = 'grid grid-cols-1 md:grid-cols-2 gap-3 mt-4';
            extraPanel.innerHTML = `
                <!-- Chat do Lobby -->
                <div class="bg-black/60 border border-amber-600/50 rounded-xl p-3 flex flex-col h-44">
                    <h4 class="text-[10px] font-bold text-amber-400 font-cinzel mb-1">💬 Chat Global do Lobby</h4>
                    <div id="lobby-chat-messages" class="flex-1 overflow-y-auto space-y-1 text-[9px] text-slate-300 pr-1 mb-2 bg-black/40 p-2 rounded border border-amber-900/40">
                        <p class="text-slate-500 italic">Conectado ao chat do lobby...</p>
                    </div>
                    <div class="flex gap-1">
                        <input id="lobby-chat-input" type="text" placeholder="Escreve uma mensagem..." class="flex-1 bg-black/80 border border-amber-600/40 rounded px-2 py-1 text-[9px] text-white focus:outline-none focus:border-amber-400" onkeydown="if(event.key==='Enter') sendLobbyChatMessage()">
                        <button onclick="sendLobbyChatMessage()" class="bg-amber-600 hover:bg-amber-500 text-black font-bold px-2.5 py-1 rounded text-[9px] cursor-pointer">Enviar</button>
                    </div>
                </div>

                <!-- Painel de Ranking da Liga -->
                <div class="bg-black/60 border border-amber-600/50 rounded-xl p-3 flex flex-col h-44">
                    <h4 class="text-[10px] font-bold text-amber-400 font-cinzel mb-1">🏆 Ranking da Liga (Pontos de Mestre)</h4>
                    <div id="lobby-ranking-list" class="flex-1 overflow-y-auto space-y-1.5 text-[9px] text-slate-300 pr-1 bg-black/40 p-2 rounded border border-amber-900/40">
                        <p class="text-slate-500 italic text-center py-4">A carregar classificação...</p>
                    </div>
                </div>
            `;
            parentDiv.appendChild(extraPanel);
            initLobbySocketListeners();
            requestLobbyRanking();
        }
    }

    let startPanel = document.getElementById('lobby-start-game-panel');
    if (!startPanel) {
        const parentDiv = container.parentElement;
        if (parentDiv) {
            startPanel = document.createElement('div');
            startPanel.id = 'lobby-start-game-panel';
            parentDiv.insertBefore(startPanel, container);
        }
    }

    if (currentJoinedOnlineRoomId) {
        if (startPanel) {
            startPanel.innerHTML = `
                <div class="bg-amber-950/40 border-2 border-amber-500 rounded-xl p-3 mb-3 flex items-center justify-between text-white shadow-lg">
                    <div>
                        <p class="text-[10px] font-bold text-amber-300">🎮 Sala Online Conectada</p>
                        <p class="text-[9px] text-slate-300">ID: ${currentJoinedOnlineRoomId}</p>
                    </div>
                    <button onclick="joinAndStartOnlineGame()" class="bg-emerald-600 hover:bg-emerald-500 text-black font-black px-4 py-2 rounded-xl text-xs uppercase shadow-lg cursor-pointer animate-pulse">
                        ▶ Iniciar Partida Online
                    </button>
                </div>
            `;
        }
    } else {
        if (startPanel) startPanel.innerHTML = '';
    }

    if (!Array.isArray(rooms) || rooms.length === 0) {
        container.innerHTML = `<p class="text-[10px] text-slate-500 text-center py-6">Nenhuma sala encontrada. Crie uma sala para começar.</p>`;
        return;
    }

    container.innerHTML = rooms.map((room, index) => {
        const roomId = room?.id || room?.roomId || `room-${index}`;
        const roomName = room?.name || room?.roomName || 'Sala sem nome';
        const host = room?.host || 'Treinador';
        const playerCount = Number(room?.playerCount ?? room?.players?.length ?? 0);
        const maxPlayers = Number(room?.maxPlayers) || 4;
        const hasPin = Boolean(room?.pin);

        return `
            <div class="flex justify-between items-center gap-2 bg-black/60 p-2.5 rounded-xl border border-amber-600/50 text-white text-[10px] my-1">
                <div class="min-w-0">
                    <p class="font-bold text-amber-300 truncate">${roomName} ${hasPin ? '🔒' : ''}</p>
                    <p class="text-slate-400 truncate">Host: ${host} · ${playerCount}/${maxPlayers} Jogadores</p>
                </div>
                <button type="button" data-room-id="${roomId}" data-has-pin="${hasPin}" class="join-online-room-button bg-amber-600 hover:bg-amber-500 text-black font-bold px-3 py-1 rounded cursor-pointer whitespace-nowrap">
                    Entrar
                </button>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.join-online-room-button').forEach(button => {
        button.addEventListener('click', () => {
            const roomId = button.getAttribute('data-room-id');
            const hasPin = button.getAttribute('data-has-pin') === 'true';
            
            let enteredPin = '';
            if (hasPin) {
                enteredPin = prompt('Esta sala é protegida por PIN. Insira a senha:') || '';
            }

            if (roomId) {
                currentJoinedOnlineRoomId = roomId;
                onlineRoomStarted = false;
                onlineBoardReady = false;

                emitSocket('join_room', {
                    roomId,
                    pin: enteredPin,
                    player: getOnlinePlayerPayload()
                });
            }
        });
    });
}

// Exposições Globais
window.createOnlineRoom = createOnlineRoom;
window.searchOnlineRooms = searchOnlineRooms;
window.refreshRoomsList = refreshRoomsList;
window.sendLobbyChatMessage = sendLobbyChatMessage;
window.joinAndStartOnlineGame = joinAndStartOnlineGame;
window.renderRoomsList = renderRoomsListUI;
