// --- src/main.js ---
import { gameState, setupConfig, ensureValidGameState, getCurrentPlayer, movementState } from './core/state.js';
import { loadGameProgress, saveGameProgress } from './core/storage.js';
import { renderBoardMap, tryInteractWithCity, onHexClick } from './systems/map.js';
import { setupDiceListeners, rollDiceForMovement, handleWaypointClick, resetTurnDiceState } from './systems/dice.js';
import { MONSTER_CATALOG } from './config/cards-data.js';

// Importação dos Módulos dos Sistemas (battle.js desativado para priorizar o encounter.js TCG)
import './systems/city.js';
import './systems/trainer.js';
// import './systems/battle.js'; 
import './systems/vault.js';
import './systems/lobby.js';
import './systems/admin.js';
import './systems/capture.js';
import './systems/encounter.js';
import { openPokemartModal, useInventoryItem } from './systems/inventory.js';
import { openSpecificTrainerCardModal } from './systems/trainer.js';
import { initiateGymSequence, GYM_LEADERS_CATALOG } from './systems/gym.js';
import { openEncounterModalWithPokemon, fleeEncounter, cyclePlayerEncounterPokemon, resolveCaptureAttempt, resolveBattleAttempt } from './systems/encounter.js';
import { renderTeamCardSlots, renderBottomPanel, changePcBoxPage, switchBottomView } from './systems/pcbox.js';
import { openPokedexModal, openPokedexDetailCard } from './systems/pokedex.js';
import { openVaultModal } from './systems/vault.js';
import { initializeSocketConnection, emitSocket } from './core/socket.js';

// ==========================================
// EXPOSIÇÃO GLOBAL PARA O HTML (Evita erros de onclick)
// ==========================================
window.onHexClick = onHexClick;
window.rollDiceForMovement = rollDiceForMovement;
window.rollDice = rollDiceForMovement;
window.handleWaypointClick = handleWaypointClick;
window.resetTurnDiceState = resetTurnDiceState;
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
window.cyclePlayerEncounterPokemon = cyclePlayerEncounterPokemon;
window.resolveCaptureAttempt = resolveCaptureAttempt;
window.resolveBattleAttempt = resolveBattleAttempt;
window.renderTeamCardSlots = renderTeamCardSlots;
window.renderBottomPanel = renderBottomPanel;
window.changePcBoxPage = changePcBoxPage;
window.switchBottomView = switchBottomView;
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
        if (typeof callback === 'function') {
            callback(result);
        }
    }, 800);
};

// Exposição do Popup Global de Alerta/Notificação para os eventos do mapa e capturas
window.showCustomPopup = function(title, message, isSuccess) {
    let popup = document.getElementById('global-custom-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'global-custom-popup';
        popup.className = 'fixed inset-0 bg-black/80 z-[700] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(popup);
    }

    const borderColor = isSuccess ? 'border-emerald-500' : 'border-amber-500';
    const headerColor = isSuccess ? 'text-emerald-400' : 'text-amber-400';

    popup.innerHTML = `
        <div class="trainer-card max-w-sm w-full p-5 space-y-3 border-4 ${borderColor} rounded-2xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white text-center">
            <h3 class="text-sm font-black ${headerColor} font-cinzel">${title}</h3>
            <p class="text-xs text-slate-200 whitespace-pre-line">${message}</p>
            <button onclick="document.getElementById('global-custom-popup').remove()" class="w-full bg-amber-600 hover:bg-amber-500 text-black font-black py-2 rounded-xl text-xs uppercase tracking-wider cursor-pointer">
                OK
            </button>
        </div>
    `;
    popup.classList.remove('hidden');
};

// Função para disparar eventos aleatórios nas casas de tipo 'event'
window.triggerRandomBoardEvent = function(eventName) {
    const cp = getCurrentPlayer();
    if (!cp) return;

    const eventsList = [
        { title: "🎁 Tesouro na Rota!", text: `Encontraste uma algibeira perdida em ${eventName}!\nGanhaste +150 Ouro.`, apply: () => { cp.gold = (cp.gold || 0) + 150; }, success: true },
        { title: "💊 Sorte no Caminho!", text: `Um viajante bondoso ofereceu-te suprimentos em ${eventName}!\nGanhaste +2 Poções e +1 Poké Ball.`, apply: () => { 
            if (!Array.isArray(cp.inventory)) cp.inventory = [];
            cp.inventory.push({ id: 'potion', name: 'Poção', count: 2, type: 'heal', value: 20 });
            cp.inventory.push({ id: 'ball_poke', name: 'Poké Ball', count: 1, type: 'sphere', value: 1 });
        }, success: true },
        { title: "⚡ Tempestade Elétrica!", text: `Uma forte tempestade surpreendeu-te em ${eventName}!\nOs teus Pokémon cansaram-se e perdeste a vez de avançar.`, apply: () => {}, success: false },
        { title: "🍃 Encontro Calmo", text: `Descansaste à sombra de uma árvore em ${eventName}.\nOs teus Pokémon recuperaram um pouco de energia.`, apply: () => {
            if (Array.isArray(cp.activeTeam)) {
                cp.activeTeam.forEach(m => {
                    if (m && m.currentHp < m.maxHp) m.currentHp = Math.min(m.maxHp, m.currentHp + 10);
                });
            }
        }, success: true }
    ];

    const randomEvt = eventsList[Math.floor(Math.random() * eventsList.length)];
    randomEvt.apply();
    saveGameProgress();

    window.showCustomPopup(randomEvt.title, randomEvt.text, randomEvt.success);

    const banner = document.getElementById('global-map-notification-banner');
    const bannerText = document.getElementById('global-map-notification-text');
    if (banner && bannerText) {
        bannerText.textContent = `${eventName}: ${randomEvt.title}`;
        banner.classList.remove('hidden');
        setTimeout(() => {
            banner.classList.add('hidden');
        }, 5000);
    }

    if (typeof renderBoardMap === 'function') renderBoardMap();
    if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
    if (typeof renderBottomPanel === 'function') renderBottomPanel();
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
                
                player.team = [starterInstance];
                player.activeTeam = [starterInstance];
                player.pcBox = [starterInstance];
                
                player.pokedex = [starterKey];
                player.inventory = [{ 
                    id: 'ball_poke', 
                    name: 'Poké Ball', 
                    count: 5, 
                    type: 'sphere', 
                    value: 1,
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
            renderBoardMap();
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
