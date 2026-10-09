// --- src/main.js ---
// Ponto de Entrada Principal e Inicializador do Motor Modular

import { gameState, setupConfig, ensureValidGameState, getCurrentPlayer } from './core/state.js';
import { loadGameProgress, saveGameProgress } from './core/storage.js';
import { renderBoardMap, tryInteractWithCity, onHexClick } from './systems/map.js';
import { setupDiceListeners } from './systems/dice.js';
import { MONSTER_CATALOG } from './config/cards-data.js';

// Importação dos Módulos dos Sistemas
import './systems/city.js';
import './systems/trainer.js';
import './systems/battle.js';
import './systems/vault.js';
import './systems/lobby.js';
import './systems/admin.js';
import { openPokemartModal, useInventoryItem } from './systems/inventory.js';
import { openSpecificTrainerCardModal } from './systems/trainer.js';
import { initiateGymSequence, GYM_LEADERS_CATALOG } from './systems/gym.js';
import { openEncounterModalWithPokemon, fleeEncounter } from './systems/encounter.js';
import { renderTeamCardSlots, renderBottomPanel, changePcBoxPage } from './systems/pcbox.js';
import { openPokedexModal, openPokedexDetailCard } from './systems/pokedex.js';
import { openVaultModal } from './systems/vault.js';
import { initializeSocketConnection, emitSocket } from './core/socket.js';

// ==========================================
// EXPOSIÇÃO GLOBAL PARA O HTML (Evita erros de onclick)
// ==========================================
window.onHexClick = onHexClick;
window.openSpecificTrainerCardModal = openSpecificTrainerCardModal;
window.openTrainerCardModal = function() { openSpecificTrainerCardModal(gameState.currentPlayerIndex || 0); };
window.openPokemartModal = openPokemartModal;
window.useInventoryItem = useInventoryItem;
window.tryInteractWithCity = tryInteractWithCity;
window.saveGameProgress = saveGameProgress;
window.initiateGymSequence = initiateGymSequence;
window.GYM_LEADERS_CATALOG = GYM_LEADERS_CATALOG;
window.openEncounterModalWithPokemon = openEncounterModalWithPokemon;
window.fleeEncounter = fleeEncounter;
window.renderTeamCardSlots = renderTeamCardSlots;
window.renderBottomPanel = renderBottomPanel;
window.changePcBoxPage = changePcBoxPage;
window.openPokedexModal = openPokedexModal;
window.openPokedexDetailCard = openPokedexDetailCard;
window.openVaultModal = openVaultModal;

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Inicializando o Motor Modular do Jogo (Partes 1, 2 & 3)...");

    // Inicializa o Socket.io[cite: 10]
    initializeSocketConnection();

    // 1. Tenta carregar um save existente ou inicializa um estado padrão
    const loaded = loadGameProgress();
    if (!loaded) {
        ensureValidGameState();
        saveGameProgress();
    }

    // 2. Renderiza o tabuleiro modular inicial e as waypoints
    renderBoardMap();

    // 3. Renderiza os slots da equipa ativa e painel inferior (Mochila/PC Box)
    renderTeamCardSlots();
    renderBottomPanel();

    // 4. Vincula os ouvintes de eventos da interface e menus
    setupDiceListeners();
    setupGlobalInterfaceListeners();
    setupAuthenticationListeners();
    loadDailyPokemonPreview();

    // Vinculação do Botão de Administrador do index.html
    const adminBtn = document.getElementById('open-admin-btn');
    if (adminBtn) {
        adminBtn.onclick = () => {
            if (typeof window.openAdminPanelModal === 'function') {
                window.openAdminPanelModal();
            } else {
                console.warn("⚠️ O módulo de administração ainda não foi carregado.");
            }
        };
    }

    console.log("✅ Jogo inicializado com sucesso!");
});

// Configura o fluxo de autenticação e comunicação com o servidor online
function setupAuthenticationListeners() {
    const submitBtn = document.getElementById('auth-submit-btn');

    if (submitBtn) {
        submitBtn.onclick = () => {
            const emailInput = document.getElementById('auth-email-input');
            const passwordInput = document.getElementById('auth-password-input');

            const email = emailInput ? emailInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value.trim() : '';

            if (!email || !password) {
                alert("Por favor, preencha o e-mail e a senha do treinador.");
                return;
            }

            console.log("🔐 A enviar credenciais para o servidor:", email);
            
            // Envia o pedido de login real para o servidor através de 'login_request'
            emitSocket('login_request', { email, password });
        };
    }

    const resumeBtn = document.getElementById('hub-resume-btn');
    if (resumeBtn) {
        resumeBtn.onclick = () => {
            document.getElementById('setup-screen').classList.add('hidden');
            document.getElementById('main-game-layout').classList.remove('hidden');
            renderTeamCardSlots();
            renderBottomPanel();
        };
    }

    const vaultBtn = document.getElementById('hub-vault-btn');
    if (vaultBtn) {
        vaultBtn.onclick = () => {
            openVaultModal();
        };
    }

    const onlineBtn = document.getElementById('hub-online-btn');
    const onlineLobby = document.getElementById('online-lobby-container');
    const trainerMainMenu = document.getElementById('trainer-main-menu');
    if (onlineBtn && onlineLobby && trainerMainMenu) {
        onlineBtn.onclick = () => {
            trainerMainMenu.classList.add('hidden');
            onlineLobby.classList.remove('hidden');
        };
    }

    const lobbyBackBtn = document.getElementById('lobby-back-btn');
    if (lobbyBackBtn && onlineLobby && trainerMainMenu) {
        lobbyBackBtn.onclick = () => {
            onlineLobby.classList.add('hidden');
            trainerMainMenu.classList.remove('hidden');
        };
    }
}

// Gestor global da resposta de autenticação recebida do servidor
window.handleLoginResponse = function(response) {
    if (!response || response.success !== true) {
        alert(response?.message || 'Erro ao autenticar no servidor.');
        return;
    }

    console.log("✅ Resposta de login recebida com sucesso:", response);

    // Se for uma conta nova registada, esconde o ecrã de auth e abre a criação de personagem[cite: 9]
    if (response.isNew || response.newAccount) {
        document.getElementById('auth-container')?.classList.add('hidden');
        if (typeof window.openCharacterCreationMode === 'function') {
            window.openCharacterCreationMode();
        }
        return;
    }

    // Se já tiver dados na base de dados, entra direto no menu principal do treinador
    document.getElementById('auth-container')?.classList.add('hidden');
    document.getElementById('trainer-main-menu')?.classList.remove('hidden');

    const player = getCurrentPlayer();
    if (player && response.profileData) {
        Object.assign(player, response.profileData);
        saveGameProgress();
    }
};

// Abre o modo de criação de personagem gerando os 8 avatares e 8 iniciais dinamicamente
window.openCharacterCreationMode = function () {
    document.getElementById('auth-container')?.classList.add('hidden');
    document.getElementById('trainer-main-menu')?.classList.add('hidden');
    document.getElementById('character-creation-container')?.classList.remove('hidden');

    // Renderiza os 8 Avatares
    const avatarGrid = document.getElementById('avatar-selection-grid');
    if (avatarGrid && avatarGrid.children.length === 0) {
        let avatarsHtml = '';
        for (let i = 1; i <= 8; i++) {
            const avatarId = i < 10 ? `0${i}` : `${i}`;
            const url = `https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/player_${avatarId}.png`;
            avatarsHtml += `
                <div onclick="selectAvatar(${i})" data-avatar="${i}" class="avatar-option w-14 h-16 bg-black/60 border-2 ${i === 1 ? 'border-amber-400' : 'border-blue-900'} rounded-xl p-1 flex items-center justify-center cursor-pointer hover:border-amber-400 transition-all">
                    <img src="${url}" class="w-full h-full object-contain" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                </div>
            `;
        }
        avatarGrid.innerHTML = avatarsHtml;
        window.selectedAvatarId = 1;
    }

    // Renderiza os 8 Pokémon Iniciais com sprites
    const starterGrid = document.getElementById('starter-selection-grid');
    if (starterGrid && starterGrid.children.length === 0) {
        const starters = [
            { id: 'bulbasaur', name: 'Bulbasaur', dex: '001' },
            { id: 'charmander', name: 'Charmander', dex: '004' },
            { id: 'squirtle', name: 'Squirtle', dex: '007' },
            { id: 'pikachu', name: 'Pikachu', dex: '025' },
            { id: 'eevee', name: 'Eevee', dex: '133' },
            { id: 'machop', name: 'Machop', dex: '066' },
            { id: 'gastly', name: 'Gastly', dex: '092' },
            { id: 'cubone', name: 'Cubone', dex: '104' }
        ];

        let startersHtml = '';
        starters.forEach((mon, index) => {
            const url = `https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/monsters/${mon.dex}.png`;
            const isSelected = index === 0;
            startersHtml += `
                <div id="starter-${mon.id}" onclick="selectStarter('${mon.id}')" class="starter-option w-16 h-20 bg-black/40 border-2 ${isSelected ? 'border-amber-400 bg-amber-950/60' : 'border-blue-900'} rounded-xl p-1 flex flex-col items-center justify-between cursor-pointer hover:border-amber-400 transition-all">
                    <img src="${url}" class="w-10 h-10 object-contain drop-shadow" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    <span class="text-[8px] text-white font-bold truncate">${mon.name}</span>
                </div>
            `;
        });
        starterGrid.innerHTML = startersHtml;
        window.selectedStarterPokemon = 'bulbasaur';
    }
};

// Atualização da seleção do avatar com alteração visual imediata da sprite
window.selectAvatar = function(id) {
    window.selectedAvatarId = id;
    
    // Atualiza a imagem de pré-visualização no topo do registo
    const previewImg = document.getElementById('preview-avatar-img');
    if (previewImg) {
        const avatarIdStr = id < 10 ? `0${id}` : `${id}`;
        previewImg.src = `https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/player_${avatarIdStr}.png`;
    }

    document.querySelectorAll('.avatar-option').forEach(el => {
        el.classList.remove('border-amber-400');
        el.classList.add('border-blue-900');
    });
    document.querySelector(`[data-avatar="${id}"]`)?.classList.replace('border-blue-900', 'border-amber-400');
};

window.selectStarter = function(starterName) {
    window.selectedStarterPokemon = starterName.toLowerCase();
    document.querySelectorAll('.starter-option').forEach(el => {
        el.classList.remove('border-amber-400', 'bg-amber-950/60');
        el.classList.add('border-blue-900', 'bg-black/40');
    });
    document.getElementById(`starter-${starterName.toLowerCase()}`)?.classList.replace('border-blue-900', 'border-amber-400');
};

// Vinculação do botão de Gravar e Iniciar Nova Partida
document.addEventListener('DOMContentLoaded', () => {
    const finalizeBtn = document.getElementById('finalize-creation-btn');
    if (finalizeBtn) {
        finalizeBtn.onclick = () => {
            const nameInput = document.getElementById('setup-trainer-name');
            const trainerName = nameInput ? nameInput.value.trim() : 'Ash Ketchum';
            const avatarId = window.selectedAvatarId || 1;
            const starter = window.selectedStarterPokemon || 'bulbasaur';

            console.log("✨ A gravar novo personagem:", { trainerName, avatarId, starter });

            // Monta o estado inicial do jogador com o starter escolhido
            const initialGameState = {
                gold: 350,
                players: [{
                    name: trainerName,
                    avatarId: avatarId,
                    gold: 350,
                    pokedex: [starter],
                    pcBox: [{ id: starter, name: starter, level: 5, currentHp: 20, maxHp: 20 }],
                    inventory: [{ id: 'ball_poke', name: 'Poké Ball', count: 5 }]
                }]
            };

            const profileData = {
                trainerName: trainerName,
                avatarId: avatarId,
                gold: 350,
                statistics: { captures: 1, shinyCaptures: 0, legendaryCaptures: 0, battlesWon: 0 }
            };

            // Envia o estado completo para o servidor guardar na tabela accounts do Supabase
            emitSocket('save_game_state', {
                gameState: initialGameState,
                profileData: profileData,
                trainerName: trainerName
            });

            // Oculta a tela de registo e abre o layout principal do mapa
            document.getElementById('setup-screen').classList.add('hidden');
            document.getElementById('main-game-layout').classList.remove('hidden');

            // Atualiza as sprites nos elementos do HUD do mapa (garantindo que reflete o novo avatar)
            const hudAvatar = document.getElementById('hud-trainer-avatar');
            if (hudAvatar) {
                const avatarIdStr = avatarId < 10 ? `0${avatarId}` : `${avatarId}`;
                hudAvatar.src = `https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/player_${avatarIdStr}.png`;
            }

            const hudName = document.getElementById('hud-trainer-name');
            if (hudName) hudName.textContent = trainerName;

            if (typeof window.renderTeamCardSlots === 'function') window.renderTeamCardSlots();
            if (typeof window.renderBottomPanel === 'function') window.renderBottomPanel();
        };
    }
});
