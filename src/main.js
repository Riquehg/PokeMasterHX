// --- src/main.js ---
// Ponto de Entrada Principal e Inicializador do Motor Modular

import { gameState, setupConfig, ensureValidGameState, getCurrentPlayer } from './core/state.js';
import { loadGameProgress, saveGameProgress } from './core/storage.js';
import { renderBoardMap, tryInteractWithCity } from './systems/map.js';
import { setupDiceListeners } from './systems/dice.js';
import { openSpecificTrainerCardModal, showCustomPopup } from './ui/modals.js';
import { openPokemartModal } from './systems/inventory.js';
import { MONSTER_CATALOG } from './config/cards-data.js';

// ==========================================
// EXPOSIÇÃO GLOBAL PARA O HTML (Evita erros de onclick)
// ==========================================
window.openSpecificTrainerCardModal = openSpecificTrainerCardModal;
window.openTrainerCardModal = function() { openSpecificTrainerCardModal(gameState.currentPlayerIndex || 0); };
window.openPokemartModal = openPokemartModal;
window.tryInteractWithCity = tryInteractWithCity;
window.saveGameProgress = saveGameProgress;

// Executado assim que o DOM estiver totalmente carregado
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Inicializando o Motor Modular do Jogo...");

    // 1. Tenta carregar um save existente ou inicializa um estado padrão
    const loaded = loadGameProgress();
    if (!loaded) {
        ensureValidGameState();
        saveGameProgress();
    }

    // 2. Renderiza o tabuleiro modular inicial e as waypoints
    renderBoardMap();

    // 3. Vincula os ouvintes de eventos da interface e menus
    setupDiceListeners();
    setupGlobalInterfaceListeners();
    setupAuthenticationListeners();
    loadDailyPokemonPreview();

    console.log("✅ Jogo inicializado com sucesso!");
});

// Configura o fluxo de autenticação e transição controlada para o menu/jogo
function setupAuthenticationListeners() {
    const submitBtn = document.getElementById('auth-submit-btn');
    const trainerMainMenu = document.getElementById('trainer-main-menu');
    const authContainer = document.getElementById('auth-container');

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

            console.log("🔐 Autenticando treinador:", email);

            // Em vez de entrar direto no tabuleiro, exibe o Hub do Treinador (Menu Inicial completo)
            if (authContainer) authContainer.classList.add('hidden');
            if (trainerMainMenu) trainerMainMenu.classList.remove('hidden');

            // Atualiza os dados do jogador no estado global
            const player = getCurrentPlayer();
            if (player) {
                player.email = email;
            }
            saveGameProgress();
        };
    }

    // Configuração dos botões do Hub do Treinador (Continuar, Nova Partida, Online, etc.)
    const resumeBtn = document.getElementById('hub-resume-btn');
    if (resumeBtn) {
        resumeBtn.onclick = () => {
            document.getElementById('setup-screen').classList.add('hidden');
            document.getElementById('main-game-layout').classList.remove('hidden');
        };
    }

    const onlineBtn = document.getElementById('hub-online-btn');
    const onlineLobby = document.getElementById('online-lobby-container');
    if (onlineBtn && onlineLobby) {
        onlineBtn.onclick = () => {
            trainerMainMenu.classList.add('hidden');
            onlineLobby.classList.remove('hidden');
        };
    }

    const lobbyBackBtn = document.getElementById('lobby-back-btn');
    if (lobbyBackBtn && onlineLobby) {
        lobbyBackBtn.onclick = () => {
            onlineLobby.classList.add('hidden');
            trainerMainMenu.classList.remove('hidden');
        };
    }
}

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

    const martBtn = document.getElementById('open-pokemart-btn');
    if (martBtn) {
        martBtn.onclick = () => {
            openPokemartModal();
        };
    }
}
