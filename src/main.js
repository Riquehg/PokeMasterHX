// --- src/main.js ---
// Ponto de Entrada Principal e Inicializador do Motor Modular

import { gameState, setupConfig, ensureValidGameState, getCurrentPlayer } from './core/state.js';
import { loadGameProgress, saveGameProgress } from './core/storage.js';
import { renderBoardMap, tryInteractWithCity, onHexClick } from './systems/map.js';
import { setupDiceListeners, rollDiceForMovement, handleWaypointClick } from './systems/dice.js';
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
window.rollDiceForMovement = rollDiceForMovement;
window.handleWaypointClick = handleWaypointClick;
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

// Função global de animação de dado caso o módulo externo não a possua
window.rollDiceWithAnimation = function(callback) {
    const diceBtn = document.getElementById('roll-dice-btn');
    if (diceBtn) {
        diceBtn.classList.add('animate-spin');
    }
    setTimeout(() => {
        if (diceBtn) {
            diceBtn.classList.remove('animate-spin');
        }
        const result = Math.floor(Math.random() * 6) + 1;
        alert(`🎲 Resultado do Dado: ${result}`);
        if (typeof callback === 'function') {
            callback(result);
        }
    }, 800);
};

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Inicializando o Motor Modular do Jogo...");

    initializeSocketConnection();

    const loaded = loadGameProgress();
    if (!loaded) {
        ensureValidGameState();
        saveGameProgress();
    }

    renderBoardMap();
    renderTeamCardSlots();
    renderBottomPanel();

    setupDiceListeners();
    setupGlobalInterfaceListeners();
    setupAuthenticationListeners();
    loadDailyPokemonPreview();

    // Botão Admin
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

    // Botão Gravar e Iniciar Nova Partida
    const finalizeBtn = document.getElementById('finalize-creation-btn');
    if (finalizeBtn) {
        finalizeBtn.onclick = () => {
            const nameInput = document.getElementById('setup-trainer-name');
            const trainerName = nameInput ? nameInput.value.trim() : 'Ash Ketchum';
            const avatarId = window.selectedAvatarId || 1;
            const starterKey = window.selectedStarterPokemon || 'bulbasaur';

            const monData = MONSTER_CATALOG.find(m => m.id === starterKey) || {
                id: starterKey,
                name: starterKey.charAt(0).toUpperCase() + starterKey.slice(1),
                image: `https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/monsters/001.png`,
                types: ['Grass']
            };

            const starterInstance = {
                uniqueId: 'mon_' + Date.now(),
                id: monData.id,
                name: monData.name,
                level: 5,
                currentHp: 25,
                maxHp: 25,
                image: monData.image,
                types: monData.types || ['Normal']
            };

            if (!gameState.players || gameState.players.length === 0) {
                ensureValidGameState();
            }
            const player = getCurrentPlayer();
            if (player) {
                player.name = trainerName;
                player.avatarId = avatarId;
                player.gold = 350;
                
                // Define em ambas as propriedades para garantir compatibilidade com todos os módulos (PC Box, Equipa e Batalha)
                player.team = [starterInstance];
                player.activeTeam = [starterInstance];
                player.pcBox = [starterInstance];
                
                player.pokedex = [starterKey];
                player.inventory = [{ 
                    id: 'ball_poke', 
                    name: 'Poké Ball', 
                    count: 5, 
                    image: 'https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/items/poke_ball.png' 
                }];
            }

            saveGameProgress();

            emitSocket('save_game_state', {
                gameState: gameState,
                profileData: { trainerName, avatarId, gold: 350 },
                trainerName: trainerName
            });

            document.getElementById('setup-screen').classList.add('hidden');
            document.getElementById('main-game-layout').classList.remove('hidden');

            updateTrainerVisuals(trainerName, avatarId);
            renderBoardMap(); // Atualiza imediatamente o mapa com a sprite correta do jogador
            renderTeamCardSlots();
            renderBottomPanel();
        };
    }

    console.log("✅ Jogo inicializado com sucesso!");
});

function updateTrainerVisuals(trainerName, avatarId) {
    const hudAvatar = document.getElementById('hud-trainer-avatar');
    if (hudAvatar) {
        const avatarIdStr = avatarId < 10 ? `0${avatarId}` : `${avatarId}`;
        hudAvatar.src = `https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/player_${avatarIdStr}.png`;
    }

    const hubAvatarImg = document.getElementById('hub-avatar-img');
    if (hubAvatarImg) {
        const avatarIdStr = avatarId < 10 ? `0${avatarId}` : `${avatarId}`;
        hubAvatarImg.src = `https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/player_${avatarIdStr}.png`;
    }

    const hudName = document.getElementById('hud-trainer-name');
    if (hudName) hudName.textContent = trainerName;
}

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

            emitSocket('login_request', { email, password });
        };
    }

    const resumeBtn = document.getElementById('hub-resume-btn');
    if (resumeBtn) {
        resumeBtn.onclick = () => {
            document.getElementById('setup-screen').classList.add('hidden');
            document.getElementById('main-game-layout').classList.remove('hidden');
            const player = getCurrentPlayer();
            if (player) {
                updateTrainerVisuals(player.name || 'Ash', player.avatarId || 1);
            }
            renderBoardMap();
            renderTeamCardSlots();
            renderBottomPanel();
        };
    }

    const vaultBtn = document.getElementById('hub-vault-btn');
    if (vaultBtn) vaultBtn.onclick = () => openVaultModal();

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

window.handleLoginResponse = function(response) {
    if (!response || response.success !== true) {
        alert(response?.message || 'Erro ao autenticar no servidor.');
        return;
    }

    if (response.isNew || response.newAccount) {
        document.getElementById('auth-container')?.classList.add('hidden');
        if (typeof window.openCharacterCreationMode === 'function') {
            window.openCharacterCreationMode();
        }
        return;
    }

    document.getElementById('auth-container')?.classList.add('hidden');
    document.getElementById('trainer-main-menu')?.classList.remove('hidden');

    const player = getCurrentPlayer();
    if (player && response.profileData) {
        Object.assign(player, response.profileData);
        updateTrainerVisuals(player.name, player.avatarId || 1);
        renderBoardMap();
        saveGameProgress();
    }
};

window.openCharacterCreationMode = function () {
    document.getElementById('auth-container')?.classList.add('hidden');
    document.getElementById('trainer-main-menu')?.classList.add('hidden');
    document.getElementById('character-creation-container')?.classList.remove('hidden');

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

window.selectAvatar = function(id) {
    window.selectedAvatarId = id;
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

// Vinculação de todos os botões de controlo do HUD superior
function setupGlobalInterfaceListeners() {
    const trainerCardBtn = document.getElementById('open-trainer-card-btn') || document.getElementById('trainer-badge-btn');
    if (trainerCardBtn) {
        trainerCardBtn.onclick = () => {
            openSpecificTrainerCardModal(gameState.currentPlayerIndex || 0);
        };
    }

    const pokedexBtn = document.getElementById('open-pokedex-btn');
    if (pokedexBtn) {
        pokedexBtn.onclick = () => openPokedexModal();
    }

    // Vinculação do botão da PC Box
    const pcBoxBtn = document.getElementById('open-pc-box-btn') || document.querySelector('[onclick*="pcBox"]');
    if (pcBoxBtn) {
        pcBoxBtn.onclick = () => {
            if (typeof window.openVaultModal === 'function') {
                window.openVaultModal();
            }
        };
    }

    const saveGameBtn = document.getElementById('save-game-btn');
    if (saveGameBtn) {
        saveGameBtn.onclick = () => {
            saveGameProgress();
            alert("💾 Jogo salvo com sucesso!");
        };
    }

    const exportSaveBtn = document.getElementById('export-save-btn');
    if (exportSaveBtn) {
        exportSaveBtn.onclick = () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gameState, null, 2));
            const dlAnchorElem = document.createElement('a');
            dlAnchorElem.setAttribute("href", dataStr);
            dlAnchorElem.setAttribute("download", "pokemon_master_trainer_save.json");
            dlAnchorElem.click();
        };
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            if (confirm("Deseja sair para o menu principal?")) {
                document.getElementById('main-game-layout').classList.add('hidden');
                document.getElementById('setup-screen').classList.remove('hidden');
                document.getElementById('auth-container')?.classList.remove('hidden');
            }
        };
    }

    const passTurnBtn = document.getElementById('pass-turn-btn');
    if (passTurnBtn) {
        passTurnBtn.onclick = () => {
            gameState.currentPlayerIndex = ((gameState.currentPlayerIndex || 0) + 1) % (gameState.players?.length || 1);
            
            // Reseta o estado de movimento para permitir rolar o dado novamente no novo turno
            if (typeof movementState !== 'undefined') {
                movementState.hasRolledThisTurn = false;
                movementState.isMoving = false;
            }

            alert(`🔄 Turno passado com sucesso! Agora é a vez do próximo jogador.`);
            renderTeamCardSlots();
            renderBoardMap();
        };
    }
}
