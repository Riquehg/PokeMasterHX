const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Credenciais oficiais do Supabase
const SUPABASE_URL = 'https://juowcnkjhfrbfttnwge.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vy21ggMI3l16SmZtmagQHg_M7fWs1vi';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Gestão de Eventos Online via Socket.io
io.on('connection', (socket) => {
    console.log(`🔌 Novo jogador conectado: ${socket.id}`);

    // Evento de Login / Registo Online via Supabase
    socket.on('login_request', async ({ email, password }) => {
        try {
            // Procura a conta pelo e-mail na tabela 'accounts'
            let { data: account, error } = await supabase
                .from('accounts')
                .select('*')
                .eq('email', email)
                .maybeSingle();

            if (error) {
                console.error("Erro na query do Supabase:", error);
                socket.emit('login_response', { success: false, message: 'Erro ao consultar banco de dados.' });
                return;
            }

            if (!account) {
                // Se a conta não existe, cria automaticamente
                let { data: newAccount, error: insertError } = await supabase
                    .from('accounts')
                    .insert([{ 
                        email: email, 
                        password: password, 
                        game_state: null, 
                        board_pokemon_cards: null 
                    }])
                    .select()
                    .single();

                if (insertError) {
                    console.error("Erro ao criar conta:", insertError);
                    socket.emit('login_response', { success: false, message: 'Erro ao criar nova conta.' });
                    return;
                }

                socket.emit('login_response', { success: true, isNew: true, message: 'Conta criada com sucesso!' });
            } else if (account.password === password) {
                // Login bem-sucedido
                socket.emit('login_response', { 
                    success: true, 
                    isNew: !account.character_name, 
                    accountData: {
                        email: account.email,
                        name: account.character_name || email.split('@')[0],
                        gameState: account.game_state,
                        boardPokemonCards: account.board_pokemon_cards
                    }
                });
            } else {
                socket.emit('login_response', { success: false, message: 'Senha incorreta!' });
            }
        } catch (err) {
            console.error("Erro crítico no login:", err);
            socket.emit('login_response', { success: false, message: 'Erro no servidor ao processar login.' });
        }
    });

    // Guardar / Atualizar Estado de Jogo
    socket.on('save_game_state', async ({ email, gameState, boardPokemonCards }) => {
        try {
            await supabase
                .from('accounts')
                .update({
                    game_state: gameState,
                    board_pokemon_cards: boardPokemonCards
                })
                .eq('email', email);
        } catch (err) {
            console.error("Erro ao salvar progresso:", err);
        }
    });

    // Sincronização em tempo real entre jogadores
    socket.on('update_game_state', async (data) => {
        socket.broadcast.emit('sync_game_state', data);
    });

    socket.on('disconnect', () => {
        console.log(`❌ Jogador desconectado: ${socket.id}`);
    });
});

server.listen(3000, () => {
    console.log('🚀 Servidor Online com Supabase a correr na porta 3000');
});