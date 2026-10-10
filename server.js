// --- SERVIDOR NODE.JS, SOCKET.IO E SUPABASE ---
// Pokémon Master Trainer HEX Edition

'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const SUPABASE_URL =
    process.env.SUPABASE_URL ||
    'https://juowcnkbjhfrbfttnwge.supabase.co';

const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_KEY não configurada.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PORT = process.env.PORT || 3000;
const MAX_ROOM_PLAYERS = 4;
const ADMIN_KEY = process.env.ADMIN_KEY || '';

const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    : true;

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        service: 'pokemaster-server',
        timestamp: new Date().toISOString()
    });
});

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST']
    },
    maxHttpBufferSize: 10e6,
    pingTimeout: 60000,
    pingInterval: 25000
});

// ============================================================
// ESTADOS TEMPORÁRIOS DO SERVIDOR
// ============================================================

let activeRooms = [];
let globalFeed = [];

// ============================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function sanitizeText(value, maxLength = 120) {
    return String(value || '')
        .replace(/[<>]/g, '')
        .trim()
        .slice(0, maxLength);
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeObject(value, fallback = {}) {
    return isPlainObject(value) ? value : fallback;
}

function safeArray(value, fallback = []) {
    return Array.isArray(value) ? value : fallback;
}

function getDefaultProfileData(email = '') {
    return {
        trainerName: email ? email.split('@')[0] : 'Treinador',
        avatarId: 1,
        gold: 350,
        pokedex: [],
        vault: [],
        permanentItems: [],
        statistics: {
            captures: 0,
            shinyCaptures: 0,
            legendaryCaptures: 0,
            battlesWon: 0
        },
        updatedAt: new Date().toISOString()
    };
}

function getFirstPlayer(gameState) {
    if (
        gameState &&
        Array.isArray(gameState.players) &&
        gameState.players.length > 0
    ) {
        return gameState.players[0];
    }
    return null;
}

function extractTrainerName(gameState, trainerName, profileData, email) {
    const explicitName = sanitizeText(trainerName, 80);
    if (explicitName) return explicitName;

    const firstPlayer = getFirstPlayer(gameState);
    if (firstPlayer && sanitizeText(firstPlayer.name, 80)) {
        return sanitizeText(firstPlayer.name, 80);
    }

    if (
        profileData &&
        typeof profileData.trainerName === 'string' &&
        profileData.trainerName.trim()
    ) {
        return sanitizeText(profileData.trainerName, 80);
    }

    return email ? email.split('@')[0] : 'Treinador';
}

function getGoldFromGameState(gameState, profileData = {}) {
    const firstPlayer = getFirstPlayer(gameState);
    if (firstPlayer && Number.isFinite(Number(firstPlayer.gold))) {
        return Number(firstPlayer.gold);
    }
    if (Number.isFinite(Number(gameState && gameState.gold))) {
        return Number(gameState.gold);
    }
    if (Number.isFinite(Number(profileData && profileData.gold))) {
        return Number(profileData.gold);
    }
    return 350;
}

function getPokedexFromAccount(account) {
    const profileData = safeObject(account.profile_data);
    const gameState = safeObject(account.game_state);

    if (Array.isArray(profileData.pokedex)) return profileData.pokedex;
    if (Array.isArray(gameState.pokedex)) return gameState.pokedex;

    const firstPlayer = getFirstPlayer(gameState);
    if (firstPlayer && Array.isArray(firstPlayer.pokedex)) return firstPlayer.pokedex;

    return [];
}

function getAccountPublicData(account, email) {
    const gameState = safeObject(account.game_state);
    const profileData = safeObject(
        account.profile_data,
        getDefaultProfileData(email)
    );

    const trainerName = extractTrainerName(
        gameState,
        account.character_name,
        profileData,
        email
    );

    const hasCharacter =
        Boolean(account.character_name) ||
        Boolean(profileData.trainerName) ||
        Boolean(
            gameState &&
            Array.isArray(gameState.players) &&
            gameState.players.length > 0 &&
            gameState.players[0] &&
            gameState.players[0].name
        );

    return {
        email: account.email,
        name: trainerName,
        trainerName,
        avatarId: profileData.avatarId || getFirstPlayer(gameState)?.avatarId || 1,
        gold: getGoldFromGameState(gameState, profileData),
        hasCharacter,
        gameState: account.game_state || {},
        boardPokemonCards: account.board_pokemon_cards || {},
        profileData
    };
}

function isColumnMissingError(error, columnName) {
    if (!error) return false;
    const text = [
        error.message,
        error.details,
        error.hint,
        error.code
    ].filter(Boolean).join(' ').toLowerCase();

    return (
        text.includes(columnName.toLowerCase()) &&
        (text.includes('column') || text.includes('schema cache') || text.includes('does not exist'))
    );
}

async function updateAccountByEmail(email, payload) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
        return { data: null, error: new Error('E-mail inválido.') };
    }

    let { data, error } = await supabase
        .from('accounts')
        .update(payload)
        .eq('email', normalizedEmail)
        .select()
        .maybeSingle();

    if (error && isColumnMissingError(error, 'profile_data')) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.profile_data;

        const fallbackResult = await supabase
            .from('accounts')
            .update(fallbackPayload)
            .eq('email', normalizedEmail)
            .select()
            .maybeSingle();

        data = fallbackResult.data;
        error = fallbackResult.error;
    }

    return { data, error };
}

async function findAccountByEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    return await supabase
        .from('accounts')
        .select('*')
        .eq('email', normalizedEmail)
        .maybeSingle();
}

function emitRoomsList() {
    io.emit('rooms_list_response', activeRooms.map(room => ({
        id: room.id,
        name: room.name,
        host: room.host,
        players: room.players.map(player => player.socketId),
        playerData: room.players.map(player => ({
            email: player.email,
            name: player.name,
            avatarId: player.avatarId
        })),
        playerCount: room.players.length,
        maxPlayers: MAX_ROOM_PLAYERS,
        status: room.status,
        pin: Boolean(room.pin && room.pin.trim() !== '')
    })));
}

function getRoomBySocketId(socketId) {
    return activeRooms.find(room =>
        room.players.some(player => player.socketId === socketId)
    );
}

function getRoomById(roomId) {
    return activeRooms.find(room => room.id === roomId);
}

function getSocketPlayerData(socket, payloadPlayer = null) {
    return {
        socketId: socket.id,
        email: payloadPlayer?.email || socket.data.email || '',
        name: payloadPlayer?.name || socket.data.trainerName || 'Treinador',
        avatarId: payloadPlayer?.avatarId || socket.data.avatarId || 1,
        gold: payloadPlayer?.gold || 350,
        currentZone: 5,
        activeTeam: safeArray(payloadPlayer?.activeTeam),
        pcBox: safeArray(payloadPlayer?.pcBox),
        inventory: safeArray(payloadPlayer?.inventory),
        badges: safeArray(payloadPlayer?.badges),
        equipmentSlots: safeArray(payloadPlayer?.equipmentSlots, [null, null])
    };
}

function removeSocketFromRooms(socketId) {
    const removedRooms = [];
    activeRooms = activeRooms.filter(room => {
        const wasInside = room.players.some(player => player.socketId === socketId);
        room.players = room.players.filter(player => player.socketId !== socketId);

        if (wasInside && room.players.length === 0) {
            removedRooms.push(room.id);
            return false;
        }
        if (wasInside && room.hostSocketId === socketId) {
            const nextHost = room.players[0];
            if (nextHost) {
                room.hostSocketId = nextHost.socketId;
                room.host = nextHost.name;
            }
        }
        return true;
    });
    return removedRooms;
}

// ============================================================
// CONEXÃO SOCKET.IO
// ============================================================

io.on('connection', socket => {
    console.log(`🔌 Novo jogador conectado: ${socket.id}`);

    socket.data.email = '';
    socket.data.trainerName = 'Treinador';
    socket.data.avatarId = 1;

    socket.on('reconnect_sync', payload => {
        const roomId = sanitizeText(payload?.roomId, 120);
        const email = normalizeEmail(payload?.email || payload?.accountEmail);
        const room = getRoomById(roomId);
        
        if (room) {
            socket.join(room.id);
            if (email) {
                const existingPlayer = room.players.find(p => normalizeEmail(p.email) === email);
                if (existingPlayer) {
                    existingPlayer.socketId = socket.id;
                }
            }
            socket.emit('room_joined', {
                success: true,
                roomId: room.id,
                room: {
                    id: room.id,
                    name: room.name,
                    host: room.host,
                    playerCount: room.players.length,
                    maxPlayers: MAX_ROOM_PLAYERS,
                    status: room.status
                },
                gameState: room.gameState
            });
            io.to(room.id).emit('room_state', { roomId: room.id, players: room.players });
        }
    });

    socket.on('login_request', async payload => {
        try {
            const email = normalizeEmail(payload?.email);
            const password = String(payload?.password || '');

            if (!email || !email.includes('@')) {
                socket.emit('login_response', { success: false, message: 'Informe um e-mail válido.' });
                return;
            }

            if (!password) {
                socket.emit('login_response', { success: false, message: 'Informe uma senha.' });
                return;
            }

            const accountResult = await findAccountByEmail(email);
            if (accountResult.error) {
                socket.emit('login_response', { success: false, message: `Erro no banco de dados: ${accountResult.error.message}` });
                return;
            }

            let account = accountResult.data;

            if (!account) {
                const defaultProfile = getDefaultProfileData(email);
                const insertPayload = {
                    email,
                    password,
                    character_name: null,
                    game_state: {},
                    board_pokemon_cards: {},
                    profile_data: defaultProfile
                };

                let insertResult = await supabase.from('accounts').insert([insertPayload]).select().single();
                if (insertResult.error && isColumnMissingError(insertResult.error, 'profile_data')) {
                    delete insertPayload.profile_data;
                    insertResult = await supabase.from('accounts').insert([insertPayload]).select().single();
                }

                if (insertResult.error) {
                    socket.emit('login_response', { success: false, message: `Erro ao criar conta: ${insertResult.error.message}` });
                    return;
                }

                account = insertResult.data;
                socket.data.email = email;
                socket.data.trainerName = defaultProfile.trainerName;
                socket.data.avatarId = defaultProfile.avatarId;

                socket.emit('login_response', {
                    success: true,
                    isNew: true,
                    accountEmail: email,
                    accountData: getAccountPublicData(account, email),
                    message: 'Conta criada com sucesso.'
                });
                return;
            }

            if (String(account.password || '') !== password) {
                socket.emit('login_response', { success: false, message: 'Senha incorreta.' });
                return;
            }

            const publicData = getAccountPublicData(account, email);
            socket.data.email = email;
            socket.data.trainerName = publicData.trainerName;
            socket.data.avatarId = publicData.avatarId;

            socket.emit('login_response', {
                success: true,
                isNew: !publicData.hasCharacter,
                accountEmail: email,
                accountData: publicData,
                message: publicData.hasCharacter ? 'Login realizado com sucesso.' : 'Conta encontrada. Crie o seu personagem.'
            });
        } catch (error) {
            console.error('🔥 Erro crítico no login:', error);
            socket.emit('login_response', { success: false, message: 'Erro interno do servidor.' });
        }
    });

    socket.on('request_saved_game', async payload => {
        try {
            const email = normalizeEmail(payload?.email || payload?.accountEmail || socket.data.email);
            if (!email) {
                socket.emit('saved_game_response', { success: false, message: 'E-mail não fornecido.' });
                return;
            }

            const accountResult = await findAccountByEmail(email);
            if (accountResult.error || !accountResult.data) {
                socket.emit('saved_game_response', { success: false, message: 'Conta não encontrada.' });
                return;
            }

            const account = accountResult.data;
            socket.emit('saved_game_response', {
                success: true,
                gameState: account.game_state || {},
                boardPokemonCards: account.board_pokemon_cards || {},
                profileData: account.profile_data || {}
            });
        } catch (error) {
            console.error('🔥 Erro ao buscar save da nuvem:', error);
            socket.emit('saved_game_response', { success: false, message: 'Erro interno.' });
        }
    });

    socket.on('save_game_state', async payload => {
        try {
            const email = normalizeEmail(payload?.email || socket.data.email);
            const gameState = safeObject(payload?.gameState);
            const boardPokemonCards = safeObject(payload?.boardPokemonCards);

            if (!email || !isPlainObject(payload?.gameState)) {
                socket.emit('save_response', { success: false, message: 'Dados inválidos.' });
                return;
            }

            let profileData = isPlainObject(payload?.profileData) ? payload.profileData : null;
            if (!profileData) {
                const existingAccount = await findAccountByEmail(email);
                if (!existingAccount.error && existingAccount.data && isPlainObject(existingAccount.data.profile_data)) {
                    profileData = existingAccount.data.profile_data;
                } else {
                    profileData = getDefaultProfileData(email);
                }
            }

            const trainerName = extractTrainerName(gameState, payload?.trainerName, profileData, email);
            const firstPlayer = getFirstPlayer(gameState);

            if (firstPlayer) {
                firstPlayer.name = trainerName;
                if (profileData.avatarId && !firstPlayer.avatarId) {
                    firstPlayer.avatarId = profileData.avatarId;
                }
            }

            profileData.trainerName = trainerName;
            profileData.avatarId = profileData.avatarId || firstPlayer?.avatarId || socket.data.avatarId || 1;
            profileData.gold = getGoldFromGameState(gameState, profileData);
            profileData.updatedAt = new Date().toISOString();

            const updatePayload = {
                character_name: trainerName,
                game_state: gameState,
                board_pokemon_cards: boardPokemonCards,
                profile_data: profileData
            };

            const result = await updateAccountByEmail(email, updatePayload);
            if (result.error) {
                socket.emit('save_response', { success: false, message: 'Erro ao salvar.' });
                return;
            }

            socket.data.email = email;
            socket.data.trainerName = trainerName;
            socket.data.avatarId = profileData.avatarId;

            socket.emit('save_response', { success: true, message: 'Salvo com sucesso.', trainerName, profileData });
        } catch (error) {
            console.error('🔥 Erro crítico ao salvar:', error);
            socket.emit('save_response', { success: false, message: 'Erro interno.' });
        }
    });

    // ========================================================
    // PAINEL ADMINISTRATIVO E CONFIGURAÇÕES DO SUPABASE
    // ========================================================

    socket.on('admin_get_users', async () => {
        try {
            const { data, error } = await supabase
                .from('accounts')
                .select('email, character_name, profile_data, updated_at, game_state');

            if (error) {
                socket.emit('admin_error', { message: 'Erro ao buscar contas do Supabase.' });
                return;
            }

            const usersList = (data || []).map(acc => {
                const profile = safeObject(acc.profile_data);
                const gameState = safeObject(acc.game_state);
                const firstPlayer = getFirstPlayer(gameState);

                return {
                    email: acc.email,
                    trainerName: acc.character_name || profile.trainerName || firstPlayer?.name || 'Treinador',
                    lastLogin: acc.updated_at || new Date().toISOString(),
                    gold: getGoldFromGameState(gameState, profile)
                };
            });

            socket.emit('admin_users_list', usersList);
        } catch (err) {
            console.error('🔥 Erro no admin_get_users:', err);
            socket.emit('admin_error', { message: 'Erro interno ao listar utilizadores.' });
        }
    });

    socket.on('admin_set_daily_pokemon', async payload => {
        try {
            const dailyConfig = payload?.dailyConfig;
            if (!dailyConfig) return;

            await supabase
                .from('game_config')
                .upsert({
                    config_key: 'pokemon_do_dia',
                    config_value: dailyConfig,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'config_key' });

            io.emit('daily_pokemon_updated', dailyConfig);
        } catch (err) {
            console.error('🔥 Erro ao salvar Pokémon do dia:', err);
        }
    });

    socket.on('admin_action', async payload => {
        try {
            const { action, email, amount, pokemon, itemId, count, newPass } = payload;
            const targetEmail = normalizeEmail(email);
            if (!targetEmail) return;

            const accRes = await findAccountByEmail(targetEmail);
            if (accRes.error || !accRes.data) {
                socket.emit('admin_action_response', { success: false, message: 'Conta não encontrada.' });
                return;
            }

            let account = accRes.data;
            let gameState = safeObject(account.game_state);
            let profileData = safeObject(account.profile_data);
            let firstPlayer = getFirstPlayer(gameState);

            if (action === 'give_gold') {
                const addGold = Number(amount) || 0;
                if (firstPlayer) {
                    firstPlayer.gold = (Number(firstPlayer.gold) || 350) + addGold;
                }
                profileData.gold = (Number(profileData.gold) || 350) + addGold;
                
                await updateAccountByEmail(targetEmail, { game_state: gameState, profile_data: profileData });
                socket.emit('admin_action_response', { success: true, message: `Adicionadas ${addGold} moedas a ${targetEmail}.` });
            } 
            else if (action === 'give_pokemon') {
                if (pokemon && pokemon.id) {
                    const newMon = {
                        uniqueId: 'mon_' + Date.now(),
                        id: pokemon.id,
                        name: pokemon.name || pokemon.id,
                        level: pokemon.level || 5,
                        currentHp: 30,
                        maxHp: 30,
                        image: `https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/monsters/001.png`
                    };
                    if (!gameState.players) gameState.players = [{}];
                    if (!gameState.players[0].pcBox) gameState.players[0].pcBox = [];
                    gameState.players[0].pcBox.push(newMon);

                    await updateAccountByEmail(targetEmail, { game_state: gameState });
                    socket.emit('admin_action_response', { success: true, message: `Pokémon ${pokemon.name} enviado para a PC Box de ${targetEmail}.` });
                }
            } 
            else if (action === 'give_item') {
                if (itemId) {
                    if (!gameState.players) gameState.players = [{}];
                    if (!gameState.players[0].inventory) gameState.players[0].inventory = [];
                    
                    const inv = gameState.players[0].inventory;
                    const existing = inv.find(i => i.id === itemId);
                    if (existing) {
                        existing.count = (Number(existing.count) || 1) + (Number(count) || 1);
                    } else {
                        inv.push({ id: itemId, name: itemId, count: Number(count) || 1, type: 'item' });
                    }

                    await updateAccountByEmail(targetEmail, { game_state: gameState });
                    socket.emit('admin_action_response', { success: true, message: `Item ${itemId} (${count}x) adicionado a ${targetEmail}.` });
                }
            } 
            else if (action === 'reset_password') {
                if (newPass) {
                    await supabase.from('accounts').update({ password: newPass }).eq('email', targetEmail);
                    socket.emit('admin_action_response', { success: true, message: `Senha alterada com sucesso para ${targetEmail}.` });
                }
            } 
            else if (action === 'delete_account') {
                await supabase.from('accounts').delete().eq('email', targetEmail);
                socket.emit('admin_action_response', { success: true, message: `Conta ${targetEmail} apagada do Supabase.` });
            }
        } catch (err) {
            console.error('🔥 Erro na ação de admin:', err);
            socket.emit('admin_action_response', { success: false, message: 'Erro ao executar comando administrativo.' });
        }
    });

    // ========================================================
    // SALAS ONLINE
    // ========================================================

    socket.on('get_rooms_list', () => {
        emitRoomsList();
    });

    socket.on('create_room', payload => {
        const roomName = sanitizeText(payload?.roomName, 80) || 'Sala de Kanto';
        const roomPin = String(payload?.pin || '').trim();
        const allowEarlyStart = Boolean(payload?.allowEarlyStart ?? true);
        const gameMode = sanitizeText(payload?.gameMode, 40) || 'fresh_start';

        if (getRoomBySocketId(socket.id)) {
            socket.emit('room_joined', { success: false, message: 'Você já está em uma sala.' });
            return;
        }

        const playerData = getSocketPlayerData(socket, payload?.player);
        const room = {
            id: `room_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: roomName,
            pin: roomPin,
            allowEarlyStart,
            gameMode,
            host: playerData.name,
            hostSocketId: socket.id,
            status: 'waiting',
            createdAt: new Date().toISOString(),
            players: [playerData],
            gameState: null
        };

        activeRooms.push(room);
        socket.join(room.id);

        socket.emit('room_joined', {
            success: true,
            roomId: room.id,
            room: {
                id: room.id,
                name: room.name,
                host: room.host,
                playerCount: room.players.length,
                maxPlayers: MAX_ROOM_PLAYERS,
                status: room.status,
                pin: Boolean(room.pin)
            }
        });

        emitRoomsList();
    });

    socket.on('join_room', payload => {
        const roomId = sanitizeText(payload?.roomId, 120);
        const enteredPin = String(payload?.pin || '').trim();
        const room = getRoomById(roomId);

        if (!room) {
            socket.emit('room_joined', { success: false, message: 'Sala não encontrada.' });
            return;
        }

        if (getRoomBySocketId(socket.id)) {
            socket.emit('room_joined', { success: false, message: 'Você já está em uma sala.' });
            return;
        }

        if (room.pin && room.pin !== enteredPin) {
            socket.emit('room_joined', { success: false, message: 'Senha PIN incorreta.' });
            return;
        }

        if (room.players.length >= MAX_ROOM_PLAYERS) {
            socket.emit('room_joined', { success: false, message: 'Sala cheia.' });
            return;
        }

        if (room.status === 'playing') {
            socket.emit('room_joined', { success: false, message: 'A partida já começou.' });
            return;
        }

        const playerData = getSocketPlayerData(socket, payload?.player);
        room.players.push(playerData);
        socket.join(room.id);

        if (room.players.length >= MAX_ROOM_PLAYERS) {
            room.status = 'full';
        }

        socket.emit('room_joined', {
            success: true,
            roomId: room.id,
            room: {
                id: room.id,
                name: room.name,
                host: room.host,
                playerCount: room.players.length,
                maxPlayers: MAX_ROOM_PLAYERS,
                status: room.status
            }
        });

        io.to(room.id).emit('room_state', { roomId: room.id, players: room.players });
        emitRoomsList();
    });

    socket.on('leave_room', () => {
        const room = getRoomBySocketId(socket.id);
        if (!room) return;

        room.players = room.players.filter(player => player.socketId !== socket.id);
        socket.leave(room.id);

        if (room.players.length === 0) {
            activeRooms = activeRooms.filter(activeRoom => activeRoom.id !== room.id);
        } else {
            if (room.hostSocketId === socket.id) {
                room.hostSocketId = room.players[0].socketId;
                room.host = room.players[0].name;
            }
            io.to(room.id).emit('room_state', { roomId: room.id, players: room.players });
        }

        socket.emit('room_left', { success: true, roomId: room.id });
        emitRoomsList();
    });

    socket.on('start_room_game', async () => {
        const room = getRoomBySocketId(socket.id);
        if (!room || room.hostSocketId !== socket.id) return;

        room.status = 'playing';
        const preparedPlayers = room.players.map(p => ({
            name: p.name,
            avatarId: p.avatarId,
            gold: p.gold || 350,
            currentZone: 5,
            activeTeam: safeArray(p.activeTeam),
            pcBox: safeArray(p.pcBox),
            inventory: safeArray(p.inventory),
            badges: safeArray(p.badges)
        }));

        room.gameState = {
            players: preparedPlayers,
            currentPlayerIndex: 0,
            turn: 1
        };

        io.to(room.id).emit('room_game_started', {
            roomId: room.id,
            gameState: room.gameState,
            boardPokemonCards: {}
        });

        emitRoomsList();
    });

    socket.on('get_leaderboard', async () => {
        try {
            const result = await supabase
                .from('accounts')
                .select('email, character_name, game_state, profile_data');

            if (result.error) return;

            const ranking = (result.data || []).map(account => {
                const pokedex = getPokedexFromAccount(account);
                const profileData = safeObject(account.profile_data);
                const gameState = safeObject(account.game_state);
                const player = getFirstPlayer(gameState);

                const badgesCount = Array.isArray(player?.badges) ? player.badges.length : 0;
                const masterPoints = (pokedex.length * 10) + (badgesCount * 100);

                return {
                    trainerName: extractTrainerName(gameState, account.character_name, profileData, account.email),
                    avatarId: profileData.avatarId || 1,
                    masterPoints,
                    pokedexCount: pokedex.length,
                    badgesCount
                };
            }).sort((a, b) => b.masterPoints - a.masterPoints).slice(0, 50);

            socket.emit('leaderboard_response', { success: true, ranking });
        } catch (error) {
            console.error('🔥 Erro no ranking:', error);
        }
    });

    socket.on('room_chat_message', payload => {
        const room = getRoomBySocketId(socket.id);
        const message = sanitizeText(payload?.message, 500);
        if (!room || !message) return;

        io.to(room.id).emit('room_chat_broadcast', {
            channel: 'room',
            roomId: room.id,
            sender: socket.data.trainerName || 'Treinador',
            text: message,
            createdAt: new Date().toISOString()
        });
    });

    socket.on('update_game_state', data => {
        const room = getRoomBySocketId(socket.id);
        const safeData = safeObject(data);

        if (room) {
            if (safeData.gameState) {
                room.gameState = safeData.gameState;
            }
            socket.to(room.id).emit('sync_game_state', {
                ...safeData,
                gameState: room.gameState,
                sender: socket.data.trainerName,
                updatedAt: new Date().toISOString()
            });
        }
    });

    socket.on('disconnect', reason => {
        console.log(`❌ Jogador desconectado: ${socket.id} | Motivo: ${reason}`);
        removeSocketFromRooms(socket.id);
        emitRoomsList();
    });
});

// ============================================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================================

server.listen(PORT, () => {
    console.log(`🚀 Servidor Pokémon Master Trainer ativo na porta ${PORT}`);
    console.log(`🗄️ Supabase conectado em: ${SUPABASE_URL}`);
});
