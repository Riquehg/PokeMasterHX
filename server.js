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
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://juowcnkjhfbfttnwge.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1b3djbmtiamhmcmJmdHRud2dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMTE0MzgsImV4cCI6MjEwNjc4NzQzOH0.nQy5fL4mNwNAycrJczCwRpXf7AT0WlV1dy765v7sn84'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
                        game_state: null, 
                        board_pokemon_cards: null 
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

    // Guardar / Atualizar Estado de Jogo com logs de salvamento
    socket.on('save_game_state', async ({ email, gameState, boardPokemonCards }) => {
        try {
            console.log(`💾 [LOG DEBUG] A guardar progresso para o utilizador: ${email}`);
            let { error: updateError } = await supabase
                .from('accounts')
                .update({
                    game_state: gameState,
                    board_pokemon_cards: boardPokemonCards
                })
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

    // Sincronização em tempo real entre jogadores
    socket.on('update_game_state', async (data) => {
        socket.broadcast.emit('sync_game_state', data);
    });

    socket.on('disconnect', () => {
        console.log(`❌ Jogador desconectado: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor Online com Supabase a correr na porta ${PORT}`);
});
