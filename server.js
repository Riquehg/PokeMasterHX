// --- SERVIDOR NODE.JS & SOCKET.IO (SERVER.JS) ---

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Servir os ficheiros estáticos (HTML, CSS, JS e assets) da raiz do projeto
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Credenciais do Supabase configuradas com a sua chave anon oficial
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://juowcnkbjhfrbfttnwge.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1b3djbmtiamhmcmJmdHRud2dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMTE0MzgsImV4cCI6MjEwNjc4NzQzOH0.nQy5fL4mNwNAycrJczCwRpXf7AT0WlV1dy765v7sn84'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Memória temporária para gestão de salas online do Multiplayer
let activeRooms = [];

// Gestão de Eventos Online via Socket.io
io.on('connection', (socket) => {
    console.log(`🔌 Novo jogador conectado: ${socket.id}`);

    // Evento de Login / Registo Online via Supabase com rastreio detalhado de erro
    socket.on('login_request', async ({ email, password }) => {
        try {
            console.log(`🔍 [LOG DEBUG] A tentar procurar a conta para o e-mail: ${email}`);

            // Procura a conta pelo e-mail na tabela 'accounts'
            let { data: account, error } = await supabase
                .from('accounts')
                .select('*')
                .eq('email', email)
                .maybeSingle();

            if (error) {
                console.error("❌ ERRO NA QUERY DO SUPABASE (Select):", {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code
                });
                socket.emit('login_response', { success: false, message: `Erro no banco: ${error.message}` });
                return;
            }

            if (!account) {
                console.log(`ℹ️ [LOG DEBUG] Conta não encontrada para ${email}. A criar nova conta...`);
                
               // Se a conta não existe, cria automaticamente
               let { data: newAccount, error: insertError } = await supabase
                    .from('accounts')
                    .insert([{ 
                        email: email, 
                        password: password, 
                        game_state: {}, 
                        board_pokemon_cards: {} 
                    }])
                    .select()
                    .single();

                if (insertError) {
                    console.error("❌ ERRO AO CRIAR CONTA (Insert):", {
                        message: insertError.message,
                        details: insertError.details,
                        hint: insertError.hint,
                        code: insertError.code
                    });
                    socket.emit('login_response', { success: false, message: `Erro ao criar nova conta: ${insertError.message}` });
                    return;
                }

                console.log(`✅ [LOG DEBUG] Nova conta criada com sucesso para: ${email}`);
                socket.emit('login_response', { success: true, isNew: true, message: 'Conta criada com sucesso!' });
            } else if (account.password === password) {
                console.log(`✅ [LOG DEBUG] Login bem-sucedido para: ${email}`);
                
                // Valida se o personagem já foi criado anteriormente
                const hasCharacter = !!account.character_name;

                // Login bem-sucedido
                socket.emit('login_response', { 
                    success: true, 
                    isNew: !hasCharacter, 
                    accountData: {
                        email: account.email,
                        name: account.character_name || email.split('@')[0],
                        gameState: account.game_state,
                        boardPokemonCards: account.board_pokemon_cards
                    }
                });
            } else {
                console.warn(`⚠️ [LOG DEBUG] Tentativa de login falhada: Senha incorreta para ${email}`);
                socket.emit('login_response', { success: false, message: 'Senha incorreta!' });
            }
        } catch (err) {
            console.error("🔥 ERRO CRÍTICO NO CATCH DE LOGIN:", {
                name: err.name,
                message: err.message,
                stack: err.stack
            });
            socket.emit('login_response', { success: false, message: 'Erro crítico no servidor ao processar login.' });
        }
    });

    // Guardar / Atualizar Estado de Jogo e Nome do Personagem
    socket.on('save_game_state', async ({ email, gameState, boardPokemonCards, trainerName }) => {
        try {
            console.log(`💾 [LOG DEBUG] A guardar progresso para o utilizador: ${email}`);
            
            let updatePayload = {
                game_state: gameState,
                board_pokemon_cards: boardPokemonCards
            };

            if (trainerName) {
                updatePayload.character_name = trainerName;
            } else if (gameState && gameState.trainerName) {
                updatePayload.character_name = gameState.trainerName;
            }

            let { error: updateError } = await supabase
                .from('accounts')
                .update(updatePayload)
                .eq('email', email);

            if (updateError) {
                console.error("❌ ERRO AO SALVAR NO SUPABASE:", updateError);
            } else {
                console.log(`✅ [LOG DEBUG] Progresso guardado com sucesso para ${email}`);
            }
        } catch (err) {
            console.error("🔥 ERRO CRÍTICO AO SALVAR PROGRESSO:", err);
        }
    });

    // === GESTÃO DE SALAS ONLINE (MULTIPLAYER) ===
    socket.on('get_rooms_list', () => {
        socket.emit('rooms_list_response', activeRooms);
    });

    socket.on('create_room', ({ roomName, host }) => {
        const newRoom = {
            id: 'room_' + Date.now(),
            name: roomName || 'Sala de Kanto',
            host: host || 'Treinador',
            players: [socket.id]
        };
        activeRooms.push(newRoom);
        socket.join(newRoom.id);
        
        console.log(`🏠 [LOBBY] Sala criada: ${newRoom.name} (${newRoom.id}) por ${newRoom.host}`);
        io.emit('rooms_list_response', activeRooms);
        socket.emit('room_joined', { success: true, roomId: newRoom.id });
    });

    socket.on('join_room', ({ roomId }) => {
        const room = activeRooms.find(r => r.id === roomId);
        if (room) {
            room.players.push(socket.id);
            socket.join(roomId);
            console.log(`👥 [LOBBY] Jogador entrou na sala: ${room.name}`);
            io.emit('rooms_list_response', activeRooms);
            socket.emit('room_joined', { success: true, roomId: roomId });
        } else {
            socket.emit('room_joined', { success: false, message: "Sala não encontrada." });
        }
    });

    socket.on('lobby_chat_message', ({ message, sender }) => {
        io.emit('chat_broadcast', { sender: sender || 'Treinador', text: message });
    });

    // === EVENTOS DO PAINEL DO ADMINISTRADOR ===
    socket.on('admin_get_users', async () => {
        try {
            console.log(`🛡️ [ADMIN] A carregar lista de utilizadores...`);
            let { data: users, error } = await supabase
                .from('accounts')
                .select('email, character_name, game_state');

            if (error) {
                console.error("❌ Erro ao buscar utilizadores para o admin:", error);
                return;
            }

            const formattedUsers = (users || []).map(u => {
                let goldVal = 350;
                if (u.game_state && typeof u.game_state === 'object') {
                    goldVal = u.game_state.gold !== undefined ? u.game_state.gold : (u.game_state.money || 350);
                }
                return {
                    email: u.email,
                    trainerName: u.character_name || u.email.split('@')[0],
                    gold: goldVal
                };
            });

            socket.emit('admin_users_list', formattedUsers);
        } catch (err) {
            console.error("🔥 Erro crítico em admin_get_users:", err);
        }
    });

    socket.on('admin_action', async ({ action, email, amount, newPass }) => {
        try {
            console.log(`🛡️️ [ADMIN AÇÃO] A executar '${action}' para o email: ${email}`);

            if (action === 'give_gold') {
                let { data: acc } = await supabase.from('accounts').select('game_state').eq('email', email).single();
                if (acc) {
                    let gameState = acc.game_state || {};
                    let currentGold = gameState.gold !== undefined ? gameState.gold : 350;
                    gameState.gold = currentGold + (amount || 100);

                    await supabase.from('accounts').update({ game_state: gameState }).eq('email', email);
                    console.log(`🪙 [ADMIN] Adicionado ${amount} de ouro para ${email}`);
                }
            } 
            else if (action === 'reset_password') {
                if (newPass) {
                    await supabase.from('accounts').update({ password: newPass }).eq('email', email);
                    console.log(`🔑 [ADMIN] Senha redefinida para a conta ${email}`);
                }
            } 
            else if (action === 'delete_account') {
                await supabase.from('accounts').delete().eq('email', email);
                console.log(`🗑️ [ADMIN] Conta ${email} apagada com sucesso da base de dados.`);
            }
        } catch (err) {
            console.error("🔥 Erro crítico ao executar ação administrativa:", err);
        }
    });

    // Sincronização em tempo real entre jogadores
    socket.on('update_game_state', async (data) => {
        socket.broadcast.emit('sync_game_state', data);
    });

    socket.on('disconnect', () => {
        console.log(`❌ Jogador desconectado: ${socket.id}`);
        // Remover de salas ativas vazias
        activeRooms = activeRooms.filter(room => {
            room.players = room.players.filter(id => id !== socket.id);
            return room.players.length > 0;
        });
        io.emit('rooms_list_response', activeRooms);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor Online com Supabase a correr na porta ${PORT}`);
});
