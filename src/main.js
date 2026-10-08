// --- src/main.js ---
// Ponto de Entrada Principal e Inicializador do Motor Modular

import { gameState, setupConfig, ensureValidGameState, getCurrentPlayer } from './core/state.js';
import { loadGameProgress, saveGameProgress } from './core/storage.js';
import { renderBoardMap } from './systems/map.js';
import { setupDiceListeners } from './systems/dice.js';
import { openSpecificTrainerCardModal, showCustomPopup } from './ui/modals.js';
import { openPokemartModal } from './systems/inventory.js';

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

    // 3. Vincula os ouvintes de eventos da interface (como o botão de rolar dado)
    setupDiceListeners();
    setupGlobalInterfaceListeners();

    console.log("✅ Jogo inicializado com sucesso!");
});

// Vincula atalhos e botões globais da HUD
function setupGlobalInterfaceListeners() {
    // Botão de abrir Ficha do Treinador na HUD
    const trainerCardBtn = document.getElementById('open-trainer-card-btn') || document.getElementById('trainer-badge-btn');
    if (trainerCardBtn) {
        trainerCardBtn.onclick = () => {
            openSpecificTrainerCardModal(gameState.currentPlayerIndex || 0);
        };
    }

    // Botão de abrir Loja / Poké Mart
    const martBtn = document.getElementById('open-pokemart-btn');
    if (martBtn) {
        martBtn.onclick = () => {
            openPokemartModal();
        };
    }
}