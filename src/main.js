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
            
            // CORREÇÃO: O servidor escuta estritamente por 'login_request'
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

// Carrega o Pokémon do dia de forma aleatória para o banner inicial
function loadDailyPokemonPreview() {
    const nameEl = document.getElementById('daily-pokemon-name');
    const spriteEl = document.getElementById('daily-pokemon-sprite');

    if (MONSTER_CATALOG && MONSTER_CATALOG.length > 0) {
        const randomIndex = Math.floor(Math.random() * MONSTER_CATALOG.length);
        const dailyMon = MONSTER_CATALOG[randomIndex];

        if (nameEl) nameEl.textContent = dailyMon.name;
        if (spriteEl && dailyMon.image) {
            spriteEl.src = dailyMon.image;
        }
    }
}

// Vincula atalhos e botões globais da HUD
function setupGlobalInterfaceListeners() {
    const trainerCardBtn = document.getElementById('open-trainer-card-btn') || document.getElementById('trainer-badge-btn');
    if (trainerCardBtn) {
        trainerCardBtn.onclick = () => {
            openSpecificTrainerCardModal(gameState.currentPlayerIndex || 0);
        };
    }

    const pokedexBtn = document.getElementById('open-pokedex-btn');
    if (pokedexBtn) {
        pokedexBtn.onclick = () => {
            openPokedexModal();
        };
    }
}
