// --- MOTOR DO JOGO DIGITAL: POKÉMON MASTER TRAINER (HEX Edition) ---

if (typeof SUPABASE_STORAGE_URL === 'undefined') {
    var SUPABASE_STORAGE_URL = "https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/";
}
var SUPABASE_STORAGE_URL = "https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/";

// 1. Inicializar a conexão Socket.io com o servidor backend na nuvem (Render)
const socket = io('https://pokemasterhx.onrender.com');

// Variável global de autenticação declarada apenas uma vez no início
let currentAuthenticatedAccount = null;

// Ouvir sincronizações de outros jogadores em tempo real
socket.on('sync_game_state', (remoteData) => {
    if (!remoteData) return;
    gameState = remoteData.gameState || gameState;
    boardPokemonCards = remoteData.boardPokemonCards || boardPokemonCards;
    if (typeof initGameEngine === 'function') initGameEngine();
    if (typeof renderBoardMap === 'function') renderBoardMap();
});

let gameState = {
    setupDone: false,
    players: [],
    currentPlayerIndex: 0,
    turn: 1,
    currentEncounter: null,
    chatMessages: [
        { sender: "Sistema", text: "Bem-vindo ao Pokémon Master Trainer HEX Edition!" }
    ],
    currentBottomView: 'inventory',
    pcBoxCurrentPage: 0
};

// --- VARIÁVEIS DE CONFIGURAÇÃO DA TELA INICIAL ---
let setupConfig = {
    mode: 'solo', // 'solo' ou 'local_multi'
    playersCount: 1,
    avatarId: 1,
    starterId: 'bulbasaur',
    playersData: []
};

let setupWizardState = {
    currentConfiguringIndex: 0,
    collectedPlayers: []
};

let boardPokemonCards = {};
let currentEncounterState = {
    wildPokemon: null,
    selectedTeamMemberIndex: 0,
    itemBonus: 0,
    battlePowerBonus: 0,
    hasAttemptedCapture: false
};

// Variável temporária para armazenar a aura da Poké Ball selecionada no turno atual
let selectedBallAura = null;

// Fallback preventivo de estado válido para evitar travamentos ao limpar o navegador
function ensureValidGameState() {
    if (!gameState || !Array.isArray(gameState.players) || gameState.players.length === 0) {
        gameState = {
            setupDone: false,
            players: [{
                name: "Ash Ketchum",
                avatarId: 1,
                currentZone: 5,
                level: 1,
                gold: 350,
                badges: [],
                activeTeam: [],
                pcBox: [],
                inventory: [],
                equipmentSlots: [null, null]
            }],
            currentPlayerIndex: 0,
            turn: 1,
            currentBottomView: 'inventory',
            pcBoxCurrentPage: 0
        };
    }
}

// Atalho rápido para obter o jogador atual da vez com segurança absoluta
function getCurrentPlayer() {
    ensureValidGameState();
    const idx = gameState.currentPlayerIndex || 0;
    return gameState.players[idx] || gameState.players[0];
}

// --- SISTEMA DE SAVE, LOAD E EXPORT/IMPORT ---

function saveGameProgress() {
    try {
        const cp = getCurrentPlayer();
        const saveData = {
            gameState: gameState,
            boardPokemonCards: boardPokemonCards,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('pokemon_master_trainer_save', JSON.stringify(saveData));

        if (currentAuthenticatedAccount) {
            socket.emit('save_game_state', {
                email: currentAuthenticatedAccount,
                trainerName: cp ? cp.name : "Treinador",
                gameState: gameState,
                boardPokemonCards: boardPokemonCards
            });
        }

        showCustomPopup("💾 Jogo Salvo", "O progresso da aventura foi guardado com sucesso na nuvem do Supabase!", true);
        appendAdventureLog("Progresso do jogo salvo com sucesso na nuvem.");
    } catch (error) {
        showCustomPopup("Erro ao Salvar", "❌ Não foi possível guardar o jogo.", false);
    }
}

function loadGameProgress() {
    try {
        const savedRaw = localStorage.getItem('pokemon_master_trainer_save');
        if (!savedRaw) {
            showCustomPopup("Sem Save", "⚠ Não foi encontrado nenhum jogo guardado neste navegador.", false);
            return false;
        }

        const saveData = JSON.parse(savedRaw);
        gameState = saveData.gameState || gameState;
        boardPokemonCards = saveData.boardPokemonCards || {};

        ensureValidGameState();

        const setupScreen = document.getElementById('setup-screen');
        const mainGameLayout = document.getElementById('main-game-layout');
        const postLoginDashboard = document.getElementById('post-login-dashboard');

        if (setupScreen) setupScreen.classList.add('hidden');
        if (postLoginDashboard) postLoginDashboard.classList.add('hidden');
        if (mainGameLayout) mainGameLayout.classList.remove('hidden');

        initGameEngine();
        if (typeof renderBoardMap === 'function') renderBoardMap();
        showCustomPopup("📂 Jogo Carregado", "Bem-vindo de volta à jornada!", true);
        appendAdventureLog("Jogo anterior carregado com sucesso.");
        return true;
    } catch (error) {
        showCustomPopup("Erro ao Carregar", "❌ O ficheiro de save está corrompido ou incompatível.", false);
        return false;
    }
}

function deleteGameSave() {
    if (confirm("⚠️ Tem a certeza absoluta de que deseja apagar o seu progresso guardado?")) {
        localStorage.removeItem('pokemon_master_trainer_save');
        showCustomPopup("🗑 Save Apagado", "O progresso guardado foi eliminado com sucesso.", true);
        appendAdventureLog("Progresso do jogo foi apagado.");
    }
}

function exportSaveToFile() {
    const p = getCurrentPlayer();
    const saveData = {
        gameState: gameState,
        boardPokemonCards: boardPokemonCards,
        exportDate: new Date().toLocaleString()
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(saveData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `pokemon_trainer_save_${p.name.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    
    showCustomPopup("💾 Backup Exportado", "O ficheiro de save (.json) foi descarregado com sucesso!", true);
}

function importSaveFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const saveData = JSON.parse(e.target.result);
            if (!saveData.gameState) throw new Error("Formato inválido");

            gameState = saveData.gameState;
            boardPokemonCards = saveData.boardPokemonCards || {};
            ensureValidGameState();

            localStorage.setItem('pokemon_master_trainer_save', JSON.stringify(saveData));

            const setupScreen = document.getElementById('setup-screen');
            const mainGameLayout = document.getElementById('main-game-layout');
            const postLoginDashboard = document.getElementById('post-login-dashboard');

            if (setupScreen) setupScreen.classList.add('hidden');
            if (postLoginDashboard) postLoginDashboard.classList.add('hidden');
            if (mainGameLayout) mainGameLayout.classList.remove('hidden');

            initGameEngine();
            if (typeof renderBoardMap === 'function') renderBoardMap();
            showCustomPopup("📂 Backup Carregado", "O jogo foi importado com sucesso!", true);
            appendAdventureLog("Save importado via ficheiro externo.");
        } catch (err) {
            showCustomPopup("Erro de Importação", "❌ O ficheiro selecionado não é um save válido.", false);
        }
    };
    reader.readAsText(file);
}

window.logoutToSetupScreen = function() {
    if (confirm("⚠ Deseja realmente sair da sessão atual? Certifique-se de que salvou o seu progresso!")) {
        const mainLayout = document.getElementById('main-game-layout');
        if (mainLayout) mainLayout.classList.add('hidden');

        const setupScreen = document.getElementById('setup-screen');
        if (setupScreen) setupScreen.classList.remove('hidden');

        const authContainer = document.getElementById('auth-container');
        const onlineLobby = document.getElementById('online-lobby-container');
        const postLoginDashboard = document.getElementById('post-login-dashboard');
        
        if (authContainer) authContainer.classList.remove('hidden');
        if (onlineLobby) onlineLobby.classList.add('hidden');
        if (postLoginDashboard) postLoginDashboard.classList.add('hidden');
    }
};

// --- TABELA DE VANTAGENS DE TIPO (HEX Edition TCG) ---
const TYPE_ADVANTAGES = {
    "Fogo": { strongAgainst: ["Grama", "Inseto", "Gelo", "Aço"], weakAgainst: ["Água", "Fogo", "Pedra", "Dragão"] },
    "Água": { strongAgainst: ["Fogo", "Terra", "Pedra"], weakAgainst: ["Água", "Grama", "Dragão"] },
    "Grama": { strongAgainst: ["Água", "Terra", "Pedra"], weakAgainst: ["Fogo", "Grama", "Veneno", "Voador", "Inseto", "Dragão", "Aço"] },
    "Elétrico": { strongAgainst: ["Água", "Voador"], weakAgainst: ["Elétrico", "Grama", "Dragão"] },
    "Psíquico": { strongAgainst: ["Lutador", "Veneno"], weakAgainst: ["Psíquico", "Aço"] },
    "Lutador": { strongAgainst: ["Normal", "Gelo", "Pedra", "Sombrio", "Aço"], weakAgainst: ["Veneno", "Voador", "Psíquico", "Inseto"] }
};

function calculateTypeAdvantageMultiplier(attackerType, defenderType) {
    if (!attackerType || !defenderType) return 1.0;
    const cleanAtk = attackerType.split('/')[0].trim();
    const cleanDef = defenderType.split('/')[0].trim();

    const adv = TYPE_ADVANTAGES[cleanAtk];
    if (adv) {
        if (adv.strongAgainst && adv.strongAgainst.includes(cleanDef)) return 1.3; 
        if (adv.weakAgainst && adv.weakAgainst.includes(cleanDef)) return 0.8;      
    }
    return 1.0;
}

function getTierColorClass(tierOrColor) {
    const val = String(tierOrColor).toLowerCase();
    if (val === '1' || val === 'rosa') return 'bg-gradient-to-b from-pink-950 via-pink-900 to-black border-pink-500';
    if (val === '2' || val === 'verde') return 'bg-gradient-to-b from-emerald-950 via-emerald-900 to-black border-emerald-500';
    if (val === '3' || val === 'azul') return 'bg-gradient-to-b from-blue-950 via-blue-900 to-black border-blue-500';
    if (val === '4' || val === 'vermelho') return 'bg-gradient-to-b from-red-950 via-red-900 to-black border-red-500';
    if (val === '5' || val === 'amarelo') return 'bg-gradient-to-b from-amber-950 via-amber-900 to-black border-amber-400';
    return 'bg-gradient-to-b from-amber-950 via-amber-900 to-black border-amber-600';
}

function updateTrainerCardBadges(cp) {
    const badgesArray = cp.badges || [];
    const allBadges = ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'volcano'];
    
    allBadges.forEach(badgeKey => {
        const imgEl = document.getElementById(`badge-${badgeKey}`);
        if (imgEl) {
            if (badgesArray.includes(badgeKey)) {
                imgEl.classList.remove('grayscale', 'opacity-40');
                imgEl.classList.add('drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]', 'scale-110');
            } else {
                imgEl.classList.add('grayscale', 'opacity-40');
                imgEl.classList.remove('drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]', 'scale-110');
            }
        }
    });
}

window.openSpecificTrainerCardModal = function(playerIndex) {
    const cp = gameState.players[playerIndex] || gameState.players[0];
    const loggedPlayer = getCurrentPlayer();
    
    const areOnSameTile = (loggedPlayer.currentZone === cp.currentZone) && (loggedPlayer.name !== cp.name);

    let cardModal = document.getElementById('trainer-card-modal-full');
    if (!cardModal) {
        cardModal = document.createElement('div');
        cardModal.id = 'trainer-card-modal-full';
        cardModal.className = 'fixed inset-0 bg-black/85 z-[350] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(cardModal);
    }

    let teamSlotsHtml = '';
    for (let i = 0; i < 6; i++) {
        let mon = cp.activeTeam[i];
        if (mon) {
            let curHp = mon.currentHp !== undefined ? mon.currentHp : (mon.maxHp || 20);
            let maxHp = mon.maxHp || mon.hp || 20;
            const shinyBadgeModal = mon.isShiny ? '<span class="bg-amber-400 text-black font-black text-[7px] px-1 rounded-full animate-pulse">✨ SHINY</span>' : '';
            const tierColorBg = getTierColorClass(mon.tier || 1);
            const auraClassModal = mon.auraEffect || '';
            const monImgSrc = mon.isShiny && mon.shinyImage ? mon.shinyImage : (mon.image || '');
            
            teamSlotsHtml += `
                <div class="${tierColorBg} border-2 ${mon.isShiny ? 'border-amber-400 shiny-card-glow' : ''} ${auraClassModal} rounded-xl p-2 flex flex-col justify-between h-28 text-white shadow relative">
                    <div class="flex justify-between items-center text-[9px] font-bold">
                        <span class="truncate">${mon.name}</span>
                        ${shinyBadgeModal}
                        <span>Nv.${mon.level || 1}</span>
                    </div>
                    <div class="my-auto flex justify-center bg-black/40 rounded-lg p-1">
                        <img src="${monImgSrc}" class="w-10 h-10 object-contain drop-shadow" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    </div>
                    <div class="text-[8px] text-center font-black bg-black/60 text-amber-300 rounded p-0.5">
                        HP: ${curHp}/${maxHp} | STR: ${mon.str || 4}
                    </div>
                </div>
            `;
        } else {
            teamSlotsHtml += `
                <div class="bg-slate-900/60 border border-slate-700 rounded-xl flex items-center justify-center text-slate-500 text-[10px] h-28">
                    Vazio
                </div>
            `;
        }
    }

    const badgeCount = Array.isArray(cp.badges) ? cp.badges.length : (typeof cp.badges === 'number' ? cp.badges : 0);
    const badgesArray = cp.badges || [];
    const allBadgesDef = [
        { key: 'boulder', title: 'Insígnia da Rocha' },
        { key: 'cascade', title: 'Insígnia da Cascata' },
        { key: 'thunder', title: 'Insígnia do Trovão' },
        { key: 'rainbow', title: 'Insígnia do Arco-Íris' },
        { key: 'soul', title: 'Insígnia da Alma' },
        { key: 'volcano', title: 'Insígnia do Vulcão' }
    ];

    let badgesHtml = '';
    allBadgesDef.forEach(b => {
        const hasIt = badgesArray.includes(b.key);
        const cls = hasIt ? 'drop-shadow-[0_0_8px_rgba(255,215,0,0.8)] scale-110' : 'grayscale opacity-40';
        badgesHtml += `<img id="badge-${b.key}" src="${SUPABASE_STORAGE_URL}badges/${b.key}.png" class="w-7 h-7 object-contain transition-transform ${cls}" alt="${b.key}" title="${b.title}">`;
    });

    let interactionButtonsHtml = '';
    if (areOnSameTile) {
        interactionButtonsHtml = `
            <div class="bg-purple-950/40 border-2 border-purple-600/60 p-3 rounded-xl flex flex-wrap gap-2 items-center justify-between mt-3">
                <span class="text-[10px] text-purple-300 font-bold">📍 Estão na mesma casa! Ações disponíveis:</span>
                <div class="flex gap-2 w-full">
                    <button onclick="document.getElementById('trainer-card-modal-full').remove(); triggerPvPBattleArena('${cp.name}');" class="flex-1 bg-red-700 hover:bg-red-600 text-white font-black py-2 rounded-lg text-[10px] uppercase shadow">
                        ⚔ Desafiar PvP
                    </button>
                    <button onclick="document.getElementById('trainer-card-modal-full').remove(); openTradeModal('${loggedPlayer.name}', '${cp.name}');" class="flex-1 bg-blue-700 hover:bg-blue-600 text-white font-black py-2 rounded-lg text-[10px] uppercase shadow">
                        🔄 Propor Troca
                    </button>
                </div>
            </div>
        `;
    }

    cardModal.innerHTML = `
        <div class="max-w-4xl w-full p-6 bg-gradient-to-b from-[#0f172a] to-[#020617] border-4 border-blue-600 rounded-2xl shadow-2xl space-y-4 text-white relative">
            <div class="flex justify-between items-center border-b border-blue-900/60 pb-2">
                <span class="text-xs font-black text-blue-400 font-cinzel tracking-wider">TRAINER'S CARD (${cp.name}) - Zona #${cp.currentZone}</span>
                <button onclick="document.getElementById('trainer-card-modal-full').remove()" class="text-blue-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-blue-950/60 rounded border border-blue-800">✕</button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                <div class="bg-black/60 border-2 border-blue-900 p-4 rounded-xl flex flex-col items-center justify-center space-y-2">
                    <img src="${SUPABASE_STORAGE_URL}player_0${cp.avatarId || 1}.png" class="w-20 h-20 object-contain drop-shadow-[0_0_10px_rgba(59,130,246,0.6)]" onerror="this.src='https://api.iconify.design/noto:boy.svg'">
                    <span class="text-xs font-black text-amber-400">${cp.name}</span>
                    <span class="text-[10px] text-slate-300">Ouro: ${cp.gold} 🪙</span>
                </div>

                <div class="md:col-span-3 grid grid-cols-3 gap-2">
                    ${teamSlotsHtml}
                </div>
            </div>

            ${interactionButtonsHtml}

            <div class="border-t border-blue-900/60 pt-3 flex justify-between items-center">
                <span class="text-xs font-bold text-slate-300">LEAGUE BADGES: (<span id="badges-count-text">${badgeCount}</span> / 6)</span>
                <div class="flex items-center gap-2">
                    ${badgesHtml}
                </div>
            </div>
        </div>
    `;
    cardModal.classList.remove('hidden');
    updateTrainerCardBadges(cp);
};

window.openTrainerCardModal = function() {
    window.openSpecificTrainerCardModal(gameState.currentPlayerIndex || 0);
};

// --- FUNÇÕES DA TELA INICIAL (WIZARD DE CONFIGURAÇÃO) ---

window.setGameMode = function(mode) {
    setupConfig.mode = mode;
    const btnSolo = document.getElementById('btn-mode-solo');
    const btnMulti = document.getElementById('btn-mode-multi');
    const multiWizard = document.getElementById('multiplayer-wizard-container');
    const soloNameBox = document.getElementById('solo-trainer-name-box');
    const soloAvatarBox = document.getElementById('solo-avatar-box');
    const soloStarterBox = document.getElementById('solo-starter-box');
    
    if (!btnSolo || !btnMulti) return;

    if (mode === 'solo') {
        setupConfig.playersCount = 1;
        btnSolo.className = "py-2.5 px-4 rounded-xl border-2 border-amber-600 bg-amber-950/60 text-amber-300 font-bold text-xs transition-all hover:bg-amber-900 flex items-center justify-center gap-2";
        btnMulti.className = "py-2.5 px-4 rounded-xl border-2 border-slate-700 bg-slate-900/60 text-slate-400 font-bold text-xs transition-all hover:bg-slate-800 flex items-center justify-center gap-2";
        if (multiWizard) multiWizard.classList.add('hidden');
        if (soloNameBox) soloNameBox.classList.remove('hidden');
        if (soloAvatarBox) soloAvatarBox.classList.remove('hidden');
        if (soloStarterBox) soloStarterBox.classList.remove('hidden');
    } else {
        setupConfig.playersCount = 2;
        setupWizardState.currentConfiguringIndex = 0;
        setupWizardState.collectedPlayers = [];

        btnMulti.className = "py-2.5 px-4 rounded-xl border-2 border-amber-600 bg-amber-950/60 text-amber-300 font-bold text-xs transition-all flex items-center justify-center gap-2";
        btnSolo.className = "py-2.5 px-4 rounded-xl border-2 border-slate-700 bg-slate-900/60 text-slate-400 font-bold text-xs transition-all flex items-center justify-center gap-2";
        
        if (multiWizard) multiWizard.classList.remove('hidden');
        updateWizardUI();
    }
};

window.setPlayersCount = function(count) {
    setupConfig.playersCount = count;
    [2, 3, 4].forEach(n => {
        const btn = document.getElementById(`btn-count-${n}`);
        if (btn) {
            btn.className = n === count ? "bg-amber-600 text-black px-2.5 py-1 rounded font-bold text-xs" : "bg-slate-800 text-slate-300 px-2.5 py-1 rounded font-bold text-xs hover:bg-slate-700";
        }
    });
    setupWizardState.currentConfiguringIndex = 0;
    setupWizardState.collectedPlayers = [];
    updateWizardUI();
};

function updateWizardUI() {
    const titleEl = document.getElementById('multi-wizard-title');
    if (titleEl) {
        titleEl.innerText = `Configuração do Jogador ${setupWizardState.currentConfiguringIndex + 1} de ${setupConfig.playersCount}`;
    }
    const nameInput = document.getElementById('setup-trainer-name');
    if (nameInput) {
        nameInput.value = `Treinador ${setupWizardState.currentConfiguringIndex + 1}`;
    }
}

window.selectAvatar = function(id) {
    setupConfig.avatarId = id;
    document.querySelectorAll('.avatar-option').forEach(el => {
        el.classList.remove('border-amber-500', 'bg-amber-950/40');
        el.classList.add('border-amber-900/60', 'bg-black/50');
    });
    const selected = document.querySelector(`[data-avatar="${id}"]`);
    if (selected) {
        selected.classList.remove('border-amber-900/60', 'bg-black/50');
        selected.classList.add('border-amber-500', 'bg-amber-950/40');
    }
};

window.selectStarter = function(starterId) {
    setupConfig.starterId = starterId;
    const possibleStarters = ['bulbasaur', 'charmander', 'squirtle', 'pikachu', 'chikorita', 'cyndaquil', 'totodile', 'eevee'];
    
    possibleStarters.forEach(id => {
        const el = document.getElementById(`starter-${id}`);
        if (el) {
            el.classList.remove('border-amber-500', 'bg-amber-950/40');
            el.classList.add('border-amber-900/60', 'bg-black/40');
        }
    });
    const target = document.getElementById(`starter-${starterId}`);
    if (target) {
        target.classList.remove('border-amber-900/60', 'bg-black/40');
        target.classList.add('border-amber-500', 'bg-amber-950/40');
    }
};

window.startMainGame = function() {
    const nameInput = document.getElementById('setup-trainer-name');
    const trainerName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : "Ash Ketchum";

    if (setupConfig.mode === 'solo') {
        gameState.players = [];
        const starterMonster = (typeof MONSTER_CATALOG !== 'undefined' ? MONSTER_CATALOG.find(m => m.id === setupConfig.starterId) : null) || {
            id: setupConfig.starterId,
            name: setupConfig.starterId.charAt(0).toUpperCase() + setupConfig.starterId.slice(1),
            type: "Normal", level: 1, str: 4, hp: 20
        };

        gameState.players.push({
            name: trainerName,
            avatarId: setupConfig.avatarId || 1,
            currentZone: 5,
            level: 1,
            gold: 350,
            badges: [],
            activeTeam: [{
                ...starterMonster, level: 1, xp: 0, tier: 1,
                currentHp: starterMonster.hp || 20, maxHp: starterMonster.hp || 20,
                uniqueId: 'mon_' + Date.now(),
                isShiny: false
            }],
            pcBox: [],
            inventory: [
                { id: 'poke_ball', name: 'Poké Ball', type: 'sphere', value: 0, icon: '🔴', image: `${SUPABASE_STORAGE_URL}items/poke_ball.png`, count: 5, cost: 50, desc: 'Esfera clássica.' },
                { id: 'ball_great', name: 'Great Ball', type: 'sphere', value: 1, icon: '🔵', image: `${SUPABASE_STORAGE_URL}items/great_ball.png`, count: 3, cost: 100, desc: 'Adiciona +1 na captura.' },
                { id: 'ball_ultra', name: 'Ultra Ball', type: 'sphere', value: 2, icon: '🟡', image: `${SUPABASE_STORAGE_URL}items/ultra_ball.png`, count: 2, cost: 200, desc: 'Adiciona +2 na captura.' },
                { id: 'item_rarecandy', name: 'Rare Candy', type: 'rarecandy', value: 100, icon: '🍬', image: `${SUPABASE_STORAGE_URL}items/rare_candy.png`, count: 2, cost: 300, desc: 'Dá 100 XP imediato (Sobe de Nível).' },
                { id: 'evolution_stone', name: 'Evolution Stone', type: 'evolution', value: 1, icon: '💎', image: `${SUPABASE_STORAGE_URL}items/evolution_stone.png`, count: 1, cost: 500, desc: 'Evolve um Anima compatível.' },
                { id: 'item_vitamin', name: 'Vitamin', type: 'battle', value: 2, icon: '🧪', image: `${SUPABASE_STORAGE_URL}items/vitamin.png`, count: 2, cost: 150, desc: 'Aumenta o STR do Pokémon em +2 na batalha.' },
                { id: 'item_potion', name: 'Potion', type: 'heal', value: 20, icon: '💊', image: `${SUPABASE_STORAGE_URL}items/potion.png`, count: 3, cost: 50, desc: 'Restaura 20 HP de um Anima.' },
                { id: 'item_revive', name: 'Revive', type: 'revive', value: 50, icon: '🌟', image: `${SUPABASE_STORAGE_URL}items/revive.png`, count: 1, cost: 250, desc: 'Revive um Anima desmaiado (HP 0).' }
            ],
            equipmentSlots: [null, null]
        });

        launchGameSession();
    } else {
        setupWizardState.collectedPlayers.push({
            name: trainerName,
            avatarId: setupConfig.avatarId || 1,
            starterId: setupConfig.starterId || 'bulbasaur'
        });

        setupWizardState.currentConfiguringIndex++;

        if (setupWizardState.currentConfiguringIndex < setupConfig.playersCount) {
            updateWizardUI();
            showCustomPopup("Próximo Treinador", `Configuração do Jogador ${setupWizardState.currentConfiguringIndex} guardada!\n\nPasse o dispositivo para o Jogador ${setupWizardState.currentConfiguringIndex + 1}.`, true);
        } else {
            gameState.players = [];
            setupWizardState.collectedPlayers.forEach(pData => {
                const starterMonster = (typeof MONSTER_CATALOG !== 'undefined' ? MONSTER_CATALOG.find(m => m.id === pData.starterId) : null) || {
                    id: pData.starterId,
                    name: pData.starterId.charAt(0).toUpperCase() + pData.starterId.slice(1),
                    type: "Normal", level: 1, str: 4, hp: 20
                };

                gameState.players.push({
                    name: pData.name,
                    avatarId: pData.avatarId,
                    currentZone: 5,
                    level: 1,
                    gold: 350,
                    badges: [],
                    activeTeam: [{
                        ...starterMonster, level: 1, xp: 0, tier: 1,
                        currentHp: starterMonster.hp || 20, maxHp: starterMonster.hp || 20,
                        uniqueId: 'mon_' + Date.now() + Math.random(),
                        isShiny: false
                    }],
                    pcBox: [],
                    inventory: [
                        { id: 'poke_ball', name: 'Poké Ball', type: 'sphere', value: 0, icon: '🔴', image: `${SUPABASE_STORAGE_URL}items/poke_ball.png`, count: 5, cost: 50, desc: 'Esfera clássica.' },
                        { id: 'ball_great', name: 'Great Ball', type: 'sphere', value: 1, icon: '🔵', image: `${SUPABASE_STORAGE_URL}items/great_ball.png`, count: 3, cost: 100, desc: 'Adiciona +1 na captura.' },
                        { id: 'ball_ultra', name: 'Ultra Ball', type: 'sphere', value: 2, icon: '🟡', image: `${SUPABASE_STORAGE_URL}items/ultra_ball.png`, count: 2, cost: 200, desc: 'Adiciona +2 na captura.' },
                        { id: 'item_rarecandy', name: 'Rare Candy', type: 'rarecandy', value: 100, icon: '🍬', image: `${SUPABASE_STORAGE_URL}items/rare_candy.png`, count: 2, cost: 300, desc: 'Dá 100 XP imediato (Sobe de Nível).' },
                        { id: 'evolution_stone', name: 'Evolution Stone', type: 'evolution', value: 1, icon: '💎', image: `${SUPABASE_STORAGE_URL}items/evolution_stone.png`, count: 1, cost: 500, desc: 'Evolve um Anima compatível.' },
                        { id: 'item_vitamin', name: 'Vitamin', type: 'battle', value: 2, icon: '🧪', image: `${SUPABASE_STORAGE_URL}items/vitamin.png`, count: 2, cost: 150, desc: 'Aumenta o STR do Pokémon em +2 na batalha.' },
                        { id: 'item_potion', name: 'Potion', type: 'heal', value: 20, icon: '💊', image: `${SUPABASE_STORAGE_URL}items/potion.png`, count: 3, cost: 50, desc: 'Restaura 20 HP de um Anima.' },
                        { id: 'item_revive', name: 'Revive', type: 'revive', value: 50, icon: '🌟', image: `${SUPABASE_STORAGE_URL}items/revive.png`, count: 1, cost: 250, desc: 'Revive um Anima desmaiado (HP 0).' }
                    ],
                    equipmentSlots: [null, null]
                });
            });

            launchGameSession();
        }
    }
};

function launchGameSession() {
    ensureValidGameState();
    gameState.currentPlayerIndex = 0;
    gameState.turn = 1;

    const setupScreen = document.getElementById('setup-screen');
    const mainGameLayout = document.getElementById('main-game-layout');
    const postLoginDashboard = document.getElementById('post-login-dashboard');
    
    if (setupScreen) setupScreen.classList.add('hidden');
    if (postLoginDashboard) postLoginDashboard.classList.add('hidden');
    if (mainGameLayout) mainGameLayout.classList.remove('hidden');

    checkAndRenderPassTurnButton();
    initGameEngine();
    appendAdventureLog(`Partida iniciada com ${gameState.players.length} jogador(es)! Turno de ${getCurrentPlayer().name}.`);
}

// --- MOTOR DO JOGO PRINCIPAL ---

function initGameEngine() {
    ensureValidGameState();
    initializeBoardPokemonCards(); 
    if (typeof renderBoardMap === 'function') renderBoardMap(); 
    renderTeamCardSlots();
    renderEquipmentSlots();
    renderBottomPanel();
    renderChatMessages();
    updatePlayerUI();
}

// --- 1. GERAÇÃO DE MONSTROS NO TABULEIRO ---
function initializeBoardPokemonCards() {
    if (typeof BOARD_WAYPOINTS === 'undefined' || typeof MONSTER_CATALOG === 'undefined') return;

    BOARD_WAYPOINTS.forEach(wp => {
        if (wp.type === 'pokemon') {
            if (boardPokemonCards[wp.id]) return;

            let targetTier = 1;
            let targetRarity = wp.color ? wp.color.toLowerCase() : 'rosa';

            if (targetRarity === 'rosa') targetTier = 1;
            else if (targetRarity === 'verde') targetTier = 2;
            else if (targetRarity === 'azul') targetTier = 3;
            else if (targetRarity === 'vermelho') targetTier = 4;
            else if (targetRarity === 'amarelo') targetTier = 5;

            const availableMonsters = MONSTER_CATALOG.filter(m => m.tier === targetTier);
            const randomMonster = availableMonsters.length > 0 
                ? availableMonsters[Math.floor(Math.random() * availableMonsters.length)]
                : MONSTER_CATALOG[0];
            
            let minAllowedLevel = 1;
            let maxAllowedLevel = 5;

            if (targetTier === 1) { minAllowedLevel = 1; maxAllowedLevel = 6; }
            else if (targetTier === 2) { minAllowedLevel = 6; maxAllowedLevel = 14; }
            else if (targetTier === 3) { minAllowedLevel = 14; maxAllowedLevel = 24; }
            else if (targetTier === 4) { minAllowedLevel = 24; maxAllowedLevel = 35; }
            else if (targetTier === 5) { minAllowedLevel = 35; maxAllowedLevel = 50; }

            if (randomMonster.evolutionLevel && maxAllowedLevel >= randomMonster.evolutionLevel) {
                maxAllowedLevel = randomMonster.evolutionLevel - 1;
            }
            if (minAllowedLevel > maxAllowedLevel) minAllowedLevel = Math.max(1, maxAllowedLevel - 3);

            const wildLevel = Math.floor(Math.random() * (maxAllowedLevel - minAllowedLevel + 1)) + minAllowedLevel;

            const isShiny = Math.random() < 0.08;
            const shinyHpBonus = isShiny ? 6 : 0;
            const shinyStrBonus = isShiny ? 2 : 0;

            const baseHp = randomMonster.hp || 20;
            const baseStr = randomMonster.str || 3;
            const scaledHp = baseHp + ((wildLevel - 1) * 2) + shinyHpBonus;
            const scaledStr = baseStr + Math.floor((wildLevel - 1) / 3) + shinyStrBonus;

            boardPokemonCards[wp.id] = { 
                ...randomMonster, 
                tier: targetTier,
                level: wildLevel,
                hp: scaledHp,
                str: scaledStr,
                waypointId: wp.id,
                currentHp: scaledHp,
                maxHp: scaledHp,
                revealed: false, 
                weakened: false,
                isShiny: isShiny,
                image: randomMonster.image || '',
                shinyImage: randomMonster.shinyImage || null,
                auraEffect: selectedBallAura || monster.auraEffect || null,
                visualClass: selectedBallAura || monster.visualClass || null
            };
        }
    });
}

// --- 2. CAPTURADOS VÃO DIRETO PARA A BOX ---
function addMonsterToPlayer(monster) {
    const cp = getCurrentPlayer();
    const maxHVal = monster.maxHp || monster.hp || 20;
    const newMon = { 
        ...monster, 
        level: monster.level || 1, 
        xp: 0, 
        currentHp: maxHVal, 
        maxHp: maxHVal, 
        uniqueId: 'mon_' + Date.now() + Math.random(),
        isShiny: !!monster.isShiny,
        shinyImage: monster.shinyImage || null,
        auraEffect: selectedBallAura || monster.auraEffect || null,
    };

    selectedBallAura = null;

    if (!Array.isArray(cp.pcBox)) cp.pcBox = [];
    cp.pcBox.push(newMon);
    appendAdventureLog(`${cp.name} capturou ${newMon.isShiny ? '✨ Shiny ' : ''}${newMon.name} (Nv. ${newMon.level}) e foi enviado diretamente para a PC Box!`);

    renderTeamCardSlots();
    renderBottomPanel();
}

function renderEquipmentSlots() {
    const cp = getCurrentPlayer();
    for (let i = 0; i < 2; i++) {
        const slotEl = document.getElementById(`equipment-slot-${i}`);
        if (!slotEl) continue;

        const item = cp.equipmentSlots ? cp.equipmentSlots[i] : null;
        if (item) {
            slotEl.innerHTML = `<span title="${item.name}">${item.icon || '🎒'}</span>`;
            slotEl.className = "h-8 bg-amber-950 border border-amber-500 rounded flex items-center justify-center cursor-pointer text-[12px] shadow";
        } else {
            slotEl.innerHTML = `<span class="text-[9px] text-amber-500/40">Slot ${i+1}</span>`;
            slotEl.className = "h-8 bg-black/60 border border-amber-600/40 rounded flex items-center justify-center cursor-pointer text-[10px]";
        }
    }
}
// --- ATUALIZAÇÃO DA UI DA BATALHA SELVAGEM (Com cartões e pré-soma corretos) ---
function updateEncounterUIInfo() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;
    const activeMon = cp.activeTeam[currentEncounterState.selectedTeamMemberIndex] || cp.activeTeam[0];
    if (!wild || !activeMon) return;

    const activeHp = activeMon.currentHp !== undefined ? activeMon.currentHp : (activeMon.maxHp || 20);
    const activeMaxHp = activeMon.maxHp || activeMon.hp || 20;

    const typeMult = calculateTypeAdvantageMultiplier(activeMon.type, wild.type);
    const baseStr = (activeMon.str || 4) + currentEncounterState.battlePowerBonus;
    const estimatedPlayerPower = Math.round(baseStr * typeMult); 
    
    const isLegendary = (wild.tier === 5) || (wild.color && wild.color.toLowerCase() === 'amarelo');
    const weakenedBonus = (wild.weakened && !isLegendary) ? 1 : 0;
    const totalCaptureBonusSoFar = currentEncounterState.itemBonus + weakenedBonus;

    let displayTarget = 4;
    const tier = wild.tier || 1;
    if (tier === 2) displayTarget = 5;
    else if (tier === 3 || tier === 4) displayTarget = 6;
    else if (isLegendary) displayTarget = 7;
    if (wild.isShiny) displayTarget += 1;

    const playerCardBg = getTierColorClass(activeMon.tier || 1);
    const enemyCardBg = getTierColorClass(wild.tier || 1);
    const auraEncPlayerClass = activeMon.auraEffect || '';

    const playerVisual = document.getElementById('player-card-visual');
    if (playerVisual) {
        playerVisual.className = `relative flex flex-col justify-between p-4 rounded-3xl border-4 ${playerCardBg} ${auraEncPlayerClass} shadow-2xl w-72 h-96 text-white`;
        playerVisual.innerHTML = `
            <div class="flex justify-between items-center font-black text-xs border-b-2 border-amber-400 pb-2">
                <span class="text-amber-300 font-bold uppercase">NV. ${activeMon.level || 1}</span>
                <span class="text-amber-900 bg-amber-200 px-2 py-0.5 rounded font-bold uppercase text-[10px] border border-amber-400">${activeMon.type || 'Normal'}</span>
            </div>
            
            <div class="flex flex-col items-center justify-center my-auto space-y-3">
                <h3 class="text-base font-black text-white text-center truncate w-full">${activeMon.name}</h3>
                <div class="flex items-center justify-center bg-black/60 w-36 h-36 rounded-2xl border-2 border-amber-400 shadow-inner p-3 relative">
                    <img src="${activeMon.isShiny && activeMon.shinyImage ? activeMon.shinyImage : (activeMon.image || '')}" alt="${activeMon.name}" class="max-h-32 max-w-full object-contain drop-shadow-md" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                </div>
            </div>

            <div class="w-full bg-black/90 text-amber-300 rounded-2xl p-3 text-center space-y-1.5 shadow-md">
                <p class="text-xs font-bold tracking-wide">HP: ${activeHp} / ${activeMaxHp} &nbsp;|&nbsp; STR: ${activeMon.str || 4}</p>
                <p class="text-[11px] font-black text-emerald-400 bg-emerald-950/90 rounded-xl px-2.5 py-1 border border-emerald-600">⚡ Pré-Soma: ~${estimatedPlayerPower} + [🎲 1-6]</p>
            </div>
            
            <button onclick="cyclePlayerEncounterPokemon()" class="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-amber-600 hover:bg-amber-500 text-black font-black text-[10px] px-3 py-1 rounded-full shadow border border-amber-300 uppercase tracking-wider cursor-pointer">
                🔄 Trocar Anima
            </button>
        `;
    }

    const encVisual = document.getElementById('enc-card-visual');
    if (encVisual) {
        encVisual.className = `relative flex flex-col justify-between p-4 rounded-3xl border-4 ${enemyCardBg} shadow-2xl w-72 h-96 text-white ${wild.isShiny ? 'shiny-card-glow' : ''}`;
        const weakenedBadge = wild.weakened ? `<span class="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-md font-bold shadow">🩹 Enfraquecido (+1 Cap.)</span>` : '';
        const shinyWildBadge = wild.isShiny ? `<span class="bg-amber-400 text-black text-[10px] px-2 py-0.5 rounded-md font-black shadow animate-pulse">✨ SHINY SELVAGEM</span>` : '';
        
        encVisual.innerHTML = `
            <div class="flex justify-between items-center font-black text-xs border-b-2 border-red-900 pb-2">
                <span class="text-red-400 font-bold uppercase">NV. ${wild.level || 1}</span>
                ${shinyWildBadge}
                <span class="text-red-300 bg-red-950 px-2 py-0.5 rounded font-bold uppercase text-[10px] border border-red-800">${wild.type}</span>
            </div>

            <div class="flex flex-col items-center justify-center my-auto space-y-3">
                <h3 class="text-base font-black text-white text-center truncate w-full">${wild.name}</h3>
                <div class="flex items-center justify-center bg-black/60 w-36 h-36 rounded-2xl border-2 ${wild.isShiny ? 'border-amber-400 shiny-card-glow' : 'border-red-800'} shadow-inner p-3 relative">
                    <img src="${wild.isShiny && wild.shinyImage ? wild.shinyImage : (wild.image || '')}" alt="${wild.name}" class="max-h-32 max-w-full object-contain drop-shadow-md" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    ${wild.weakened ? '<span class="absolute top-2 right-2 bg-red-500 text-xs px-2 py-0.5 rounded-md shadow">🩹</span>' : ''}
                </div>
            </div>

            <div class="w-full bg-black/90 text-red-300 rounded-2xl p-3 text-center space-y-1.5 shadow-md">
                <p class="text-xs font-bold tracking-wide">HP: ${wild.currentHp || wild.hp || 15} &nbsp;|&nbsp; STR: ${wild.str || 3}</p>
                <p class="text-[11px] font-black text-amber-300 bg-amber-950/90 rounded-xl px-2.5 py-1 border border-amber-600">🎯 Alvo p/ Capturar: ${displayTarget}+ (Bónus: +${totalCaptureBonusSoFar})</p>
                ${weakenedBadge}
            </div>

            <div class="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-red-800 text-white font-black text-[10px] px-3 py-1 rounded-full shadow border border-red-600 uppercase tracking-wider pointer-events-none">
                Inimigo Selvagem
            </div>
        `;
    }
}

// 1. Correção rigorosa na verificação de HP zero na Batalha Selvagem
window.resolveBattleAttempt = function() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;
    const activeMon = cp.activeTeam[currentEncounterState.selectedTeamMemberIndex];
    if (!wild || !activeMon) return;

    if ((activeMon.currentHp !== undefined ? activeMon.currentHp : activeMon.maxHp) <= 0) {
        showCustomPopup("Pokémon Desmaiado", "⚠ O teu Anima atual está com 0 de HP e não pode lutar! Troca de Anima ou usa um Revive.", false);
        return;
    }

    rollDiceWithAnimation((playerDice, wildDice) => {
        const typeMult = calculateTypeAdvantageMultiplier(activeMon.type, wild.type);
        const playerPower = Math.round(((activeMon.str || 4) + currentEncounterState.battlePowerBonus + playerDice) * typeMult);
        const wildPower = (wild.str || 3) + wildDice;

        if (playerPower >= wildPower) {
            const damageToWild = Math.max(10, playerPower - wildPower + 10);
            wild.currentHp = Math.max(0, (wild.currentHp !== undefined ? wild.currentHp : wild.maxHp) - damageToWild);

            if (wild.currentHp <= 0) {
                showCustomPopup("🏆 POKÉMON SELVAGEM DERROTADO!", `O teu ${activeMon.name} venceu e desmaiou o ${wild.name} selvagem!\n\nPodes agora tentar capturá-lo.`, true);
                wild.weakened = true;
                if (wild.waypointId && boardPokemonCards[wild.waypointId]) {
                    boardPokemonCards[wild.waypointId].weakened = true;
                    boardPokemonCards[wild.waypointId].currentHp = 0;
                }
                addExperienceToMonster(activeMon, 50);
                triggerCaptureFlow(wild);
            } else {
                showCustomPopup("⚔️ ATAQUE BEM-SUCEDIDO!", `O teu ${activeMon.name} causou ${damageToWild} de dano ao ${wild.name}!\n\nHP Restante do Selvagem: ${wild.currentHp}/${wild.maxHp || wild.hp}`, true);
            }
            updateEncounterUIInfo();
        } else {
            const damageToPlayer = 15;
            activeMon.currentHp = Math.max(0, (activeMon.currentHp || activeMon.maxHp) - damageToPlayer);
            
            if (activeMon.currentHp <= 0) {
                showCustomPopup("💀 O TEU POKÉMON DESMAIOU", `O ${wild.name} selvagem desferiu um golpe crítico!\n\n💔 O teu ${activeMon.name} desmaiou (HP 0). A batalha contra este selvagem está encerrada para este Anima. Deves fugir ou trocar!`, false);
                closeEncounterModalUI();
            } else {
                showCustomPopup("💥 CONTRA-ATAQUE SOFRIDO", `O ${wild.name} selvagem foi mais forte nesta ronda!\n\n💔 ${activeMon.name} sofreu ${damageToPlayer} de dano.`, false);
            }
            renderTeamCardSlots();
            updateEncounterUIInfo();
        }
    });
};

// 2. Isolamento correto do Cofre Global e Dados da Conta do Treinador
function saveGlobalTrainerAccountData(trainerName, avatarId) {
    const globalAccountData = {
        trainerName: trainerName,
        avatarId: avatarId,
        vault: JSON.parse(localStorage.getItem('pokemon_master_trainer_vault') || '[]'),
        pokedex: JSON.parse(localStorage.getItem('pokemon_master_trainer_pokedex') || '[]'),
        updatedAt: new Date().toISOString()
    };
    localStorage.setItem('pokemon_master_trainer_account_profile', JSON.stringify(globalAccountData));
}

function loadGlobalTrainerAccountData() {
    try {
        const raw = localStorage.getItem('pokemon_master_trainer_account_profile');
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
}

// --- VALIDAÇÃO OBRIGATÓRIA DE POKÉ BALLS NA CAPTURA (Fase 1) ---
function triggerCaptureFlow(wildPokemon) {
    const cp = getCurrentPlayer();
    if (!cp.inventory) cp.inventory = [];

    const availableSpheres = cp.inventory.filter(i => i.type === 'sphere' && i.count > 0);

    if (availableSpheres.length === 0) {
        showCustomPopup(
            "Sem Poké Balls!", 
            "❌ Não tens nenhuma Poké Ball, Great Ball ou Ultra Ball na tua mochila!\n\nVisita o Poké Mart numa cidade para adquirir esferas antes de tentares capturar este Anima.", 
            false
        );
        return;
    }

    let captureModal = document.getElementById('capture-flow-modal');
    if (!captureModal) {
        captureModal = document.createElement('div');
        captureModal.id = 'capture-flow-modal';
        captureModal.className = 'fixed inset-0 bg-black/90 z-[600] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(captureModal);
    }

    let sphereButtonsHtml = '';
    availableSpheres.forEach(sphere => {
        let btnColor = 'bg-red-600 hover:bg-red-500';
        if (sphere.id === 'ball_great') btnColor = 'bg-blue-600 hover:bg-blue-500';
        if (sphere.id === 'ball_ultra') btnColor = 'bg-amber-600 hover:bg-amber-500';

        sphereButtonsHtml += `
            <button onclick="document.getElementById('capture-flow-modal').remove(); attemptCatchWithSpecificBall('${sphere.id}', '${wildPokemon.waypointId}')" class="${btnColor} text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer flex items-center gap-1.5 shadow">
                <span>${sphere.icon || '🔴'}</span> ${sphere.name} (${sphere.count})
            </button>
        `;
    });

    captureModal.innerHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] text-white text-center">
            <h3 class="text-sm font-black text-amber-400 uppercase">🎯 TENTATIVA DE CAPTURA</h3>
            <p class="text-xs text-slate-300">O ${wildPokemon.name} está debilitado! Escolha uma esfera da sua mochila:</p>
            <div class="flex flex-wrap justify-center gap-3 my-4">
                ${sphereButtonsHtml}
            </div>
            <button onclick="document.getElementById('capture-flow-modal').remove()" class="text-xs text-slate-400 hover:text-white underline cursor-pointer">Fugir / Ignorar</button>
        </div>
    `;
    captureModal.classList.remove('hidden');
}

window.attemptCatchWithSpecificBall = function(ballItemId, waypointId) {
    const cp = getCurrentPlayer();
    if (!cp.inventory) return;

    let sphereItem = cp.inventory.find(i => i.id === ballItemId);
    if (!sphereItem || sphereItem.count <= 0) {
        showCustomPopup("Esfera Esgotada", "❌ Não tens unidades suficientes desta esfera!", false);
        return;
    }

    sphereItem.count--;

    let bonus = sphereItem.value || 0;
    if (sphereItem.aura) {
        selectedBallAura = sphereItem.aura;
    }

    currentEncounterState.itemBonus = bonus;
    resolveCaptureAttempt();
    renderBottomPanel();
};

window.attemptCatchWithBall = function(ballType, waypointId) {
    let bonus = 0;
    if (ballType === 'greatball') bonus = 1;
    if (ballType === 'ultraball') bonus = 2;
    currentEncounterState.itemBonus = bonus;
    resolveCaptureAttempt();
};

// --- MODAL DETALHADO DO POKÉMON ---

window.openPokemonDetailModal = function(monsterIdOrUniqueId, fromArea = 'team') {
    const cp = getCurrentPlayer();
    let monster = null;
    if (fromArea === 'team') {
        monster = cp.activeTeam.find(m => m.uniqueId === monsterIdOrUniqueId || m.id === monsterIdOrUniqueId);
    } else if (fromArea === 'pcbox') {
        monster = cp.pcBox.find(m => m.uniqueId === monsterIdOrUniqueId || m.id === monsterIdOrUniqueId);
    } else if (fromArea === 'board') {
        monster = boardPokemonCards[monsterIdOrUniqueId];
    }
    if (!monster) return;

    let detailModal = document.getElementById('pokemon-detail-modal');
    if (!detailModal) {
        detailModal = document.createElement('div');
        detailModal.id = 'pokemon-detail-modal';
        detailModal.className = 'fixed inset-0 bg-black/85 z-[350] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(detailModal);
    }

    const typeKey = monster.type ? monster.type.split('/')[0].trim() : 'Normal';
    const xpCurrent = monster.xp || 0;
    const curHp = monster.currentHp !== undefined ? monster.currentHp : (monster.hp || 20);
    const maxHp = monster.maxHp || monster.hp || 20;
    const isFainted = curHp <= 0;
    
    let evolutionText = 'Forma Final';
    if (monster.evolvesTo) {
        evolutionText = `Evolui no Nv. ${monster.evolutionLevel || 16}`;
    }

    const typeInfo = TYPE_ADVANTAGES[typeKey] || { strongAgainst: [], weakAgainst: [] };
    const strongList = typeInfo.strongAgainst.length > 0 ? typeInfo.strongAgainst.join(', ') : 'Nenhuma específica';
    const weakList = typeInfo.weakAgainst.length > 0 ? typeInfo.weakAgainst.join(', ') : 'Nenhuma específica';
    const shinyBanner = monster.isShiny ? '<div class="bg-amber-400 text-black font-black text-[9px] text-center rounded py-0.5 animate-pulse">✨ POKÉMON SHINY RARO ✨</div>' : '';
    const tierCardBg = getTierColorClass(monster.tier || 1);
    const auraDetailClass = monster.auraEffect || '';
    const monImgUrl = monster.isShiny && monster.shinyImage ? monster.shinyImage : (monster.image || '');

    const showVaultButton = (monster.uniqueId && (fromArea === 'team' || fromArea === 'pcbox')) ? `
        <button onclick="saveMonsterToVault('${monster.uniqueId}'); document.getElementById('pokemon-detail-modal').remove();" class="w-full bg-blue-700 hover:bg-blue-600 text-white font-black py-2 rounded-xl text-xs uppercase shadow transition-all cursor-pointer">
            📦 Guardar no Cofre Global
        </button>
    ` : '';

    detailModal.innerHTML = `
        <div class="trainer-card max-w-md w-full p-5 space-y-3 border-4 ${isFainted ? 'border-red-600' : (monster.isShiny ? 'border-amber-400 shiny-card-glow' : 'border-amber-500')} ${auraDetailClass} rounded-2xl ${tierCardBg} shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-1.5">
                <span class="text-xs font-black text-amber-400 font-cinzel tracking-wider">FICHA TÉCNICA DO ANIMA</span>
                <button onclick="document.getElementById('pokemon-detail-modal').remove()" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800">✕</button>
            </div>

            ${shinyBanner}
            ${isFainted ? '<div class="bg-red-950/80 border border-red-500 text-red-200 text-center py-1 rounded text-xs font-black animate-pulse">⚠ ANIMA DESMAIADO (HP 0)</div>' : ''}

            <div class="grid grid-cols-2 gap-3 items-center">
                <div class="bg-black/60 border-2 border-amber-700/60 p-3 rounded-xl flex flex-col items-center justify-center h-32">
                    <img src="${monImgUrl}" alt="${monster.name}" class="w-20 h-20 object-contain drop-shadow-[0_0_10px_rgba(255,215,0,0.6)] ${isFainted ? 'grayscale opacity-50' : ''}" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                </div>
                <div class="space-y-1.5 text-xs">
                    <div>
                        <h3 class="text-base font-black text-white">${monster.name}</h3>
                        <p class="text-[10px] text-amber-400 font-bold uppercase">Tipo: ${monster.type || 'Normal'}</p>
                    </div>
                    <div class="bg-black/40 p-2 rounded-lg border border-amber-900/40 space-y-0.5 text-[10px]">
                        <div class="flex justify-between"><span>Nível:</span> <span class="font-bold text-amber-300">Nv. ${monster.level || 1}</span></div>
                        <div class="flex justify-between"><span>Força (STR):</span> <span class="font-bold text-amber-300">${monster.str || 4}</span></div>
                        <div class="flex justify-between"><span>Vida (HP):</span> <span class="font-bold ${isFainted ? 'text-red-400' : 'text-emerald-400'}">${curHp} / ${maxHp}</span></div>
                    </div>
                </div>
            </div>

            <div class="bg-black/60 p-2.5 rounded-xl border border-amber-900/60 space-y-1.5 text-[10px]">
                <p class="text-amber-300 font-bold border-b border-amber-900/40 pb-0.5">⚡ Ecossistema de Tipos (TCG):</p>
                <div class="text-emerald-400">
                    <span class="font-bold">Vantagem (+30% Dano):</span> ${strongList}
                </div>
                <div class="text-red-400">
                    <span class="font-bold">Desvantagem (-20% Dano):</span> ${weakList}
                </div>
            </div>

            <div class="space-y-1 bg-black/50 p-2.5 rounded-xl border border-amber-900/50">
                <div class="flex justify-between text-[10px] font-bold text-slate-300">
                    <span>Experiência (XP):</span>
                    <span>${xpCurrent} / 100</span>
                </div>
                <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-amber-900">
                    <div class="bg-gradient-to-r from-amber-500 to-yellow-400 h-full transition-all duration-300" style="width: ${Math.min(xpCurrent, 100)}%;"></div>
                </div>
                <p class="text-[9px] text-slate-400 text-right pt-0.5">✨ ${evolutionText}</p>
            </div>

            ${showVaultButton}

            <button onclick="document.getElementById('pokemon-detail-modal').remove()" class="w-full bg-amber-600 hover:bg-amber-500 text-black font-black py-2 rounded-xl text-xs uppercase shadow transition-all cursor-pointer">
                Fechar Ficha
            </button>
        </div>
    `;
    detailModal.classList.remove('hidden');
};

// --- USO DE ITENS NA MOCHILA ---

function useInventoryItemMainScreen(itemId) {
    const cp = getCurrentPlayer();
    if (!cp.inventory) cp.inventory = [];
    let item = cp.inventory.find(i => i.id === itemId);
    if (!item || item.count <= 0) {
        showCustomPopup("Sem Itens", "❌ Não tens unidades deste item na mochila!", false);
        return;
    }

    if (item.type === 'heal') {
        let target = cp.activeTeam.find(m => m.currentHp < m.maxHp);
        if (!target) {
            showCustomPopup("Aviso", "✨ Todos los Pokémon na equipa ativa estão com HP máximo!", false);
            return;
        }
        item.count--;
        target.currentHp = Math.min(target.maxHp, target.currentHp + item.value);
        showCustomPopup("Item Usado", `💊 ${item.name} usada em ${target.name}!\nHP recuperado para ${target.currentHp}/${target.maxHp}.`, true);
        renderTeamCardSlots();
        renderBottomPanel();
    } else if (item.type === 'revive') {
        let target = cp.activeTeam.find(m => m.currentHp <= 0);
        if (!target) {
            showCustomPopup("Aviso", "✨ Não há nenhum Pokémon desmaiado na equipa ativa!", false);
            return;
        }
        item.count--;
        target.currentHp = Math.floor(target.maxHp / 2);
        showCustomPopup("Item Usado", `🌟 ${item.name} usado! ${target.name} foi revivido com ${target.currentHp} HP!`, true);
        renderTeamCardSlots();
        renderBottomPanel();
    } else if (item.type === 'rarecandy') {
        let target = cp.activeTeam[0];
        if (!target) return;
        item.count--;
        showCustomPopup("Doce Raro Usado", `🍬 ${item.name} dado a ${target.name}!\nO Anima ganhou 100 XP e subiu de nível!`, true);
        addExperienceToMonster(target, 100);
        renderBottomPanel();
    } else if (item.type === 'evolution') {
        let target = cp.activeTeam.find(m => m.evolvesTo);
        if (!target) {
            showCustomPopup("Aviso", "⚠️ Nenhum Pokémon na tua equipa ativa reage a esta pedra de evolução!", false);
            return;
        }
        item.count--;
        const nextEvolution = MONSTER_CATALOG.find(m => m.id === target.evolvesTo);
        if (nextEvolution) {
            const oldName = target.name;
            target.name = nextEvolution.name;
            target.image = nextEvolution.image;
            if (nextEvolution.shinyImage) target.shinyImage = nextEvolution.shinyImage;
            target.str = (target.str || 4) + 3;
            target.maxHp = (target.maxHp || 20) + 10;
            target.currentHp = target.maxHp;
            target.evolvesTo = nextEvolution.evolvesTo || null;

            showEvolutionModalUI(oldName, target);
            appendAdventureLog(`✨ ${cp.name} usou uma Evolution Stone: ${oldName} evoluiu para ${target.name}!`);
        }
        renderTeamCardSlots();
        renderBottomPanel();
    } else {
        showCustomPopup("Informação", `ℹ O item ${item.name} só pode ser aplicado diretamente durante uma Batalha ou Encontro.`, true);
    }
}
// --- SPRITES DOS GINÁSIOS CORRIGIDOS (leaders/) E FLUXO DE ARENA INTEGRADO ---
window.openCityModal = function(cityName) {
    let cityModal = document.getElementById('city-hub-modal');
    if (!cityModal) {
        cityModal = document.createElement('div');
        cityModal.id = 'city-hub-modal';
        cityModal.className = 'fixed inset-0 bg-black/85 z-[350] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(cityModal);
    }

    const cp = getCurrentPlayer();
    
    let gymInfo = null;
    if (typeof GYM_LEADERS_CATALOG !== 'undefined') {
        const normalizeStr = (str) => str.toLowerCase().replace(/city/g, '').replace(/island/g, '').replace(/\s+/g, '').trim();
        const cleanSearchName = normalizeStr(cityName);

        gymInfo = GYM_LEADERS_CATALOG.find(g => {
            const cleanCatalogName = normalizeStr(g.city);
            return cleanCatalogName === cleanSearchName || g.city.toLowerCase() === cityName.toLowerCase();
        });
    }

    const hasBadge = gymInfo && cp.badges && cp.badges.includes(gymInfo.badgeKey);

    let gymSectionHtml = `<p class="text-xs text-slate-400 text-center">Esta localidade não possui um ginásio oficial registado.</p>`;

    if (gymInfo) {
        let leaderFileName = gymInfo.leader;
        if (leaderFileName === "Misty") leaderFileName = "misty";
        const leaderSpriteUrl = `${SUPABASE_STORAGE_URL}leaders/${encodeURIComponent(leaderFileName)}.png`;

        const leaderTeam = gymInfo.pokemons || [gymInfo.pokemon];
        let teamPokesHtml = '';
        leaderTeam.forEach(pk => {
            teamPokesHtml += `
                <div class="flex items-center gap-2 bg-black/40 p-1.5 rounded-xl border border-red-900/50">
                    <img src="${pk.image}" class="w-10 h-10 object-contain drop-shadow" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    <div class="text-[10px]">
                        <p class="font-bold text-white">${pk.name}</p>
                        <p class="text-amber-400">Nv. ${pk.level} | ${pk.type}</p>
                    </div>
                </div>
            `;
        });

        gymSectionHtml = `
            <div class="bg-red-950/40 border-2 border-red-600/60 p-3 rounded-2xl space-y-2">
                <div class="flex justify-between items-center border-b border-red-900 pb-1">
                    <div class="flex items-center gap-2">
                        <img src="${leaderSpriteUrl}" class="w-10 h-10 object-contain rounded-full bg-black border border-amber-400 shadow" onerror="this.src='https://api.iconify.design/noto:man-raising-hand.svg'">
                        <div>
                            <span class="text-xs font-black text-red-300">Líder: ${gymInfo.leader}</span>
                            <p class="text-[9px] text-slate-300">Formato: ${gymInfo.format}x${gymInfo.format}</p>
                        </div>
                    </div>
                    <div>
                        ${hasBadge ? '<span class="bg-emerald-600 text-white font-bold text-[9px] px-2 py-0.5 rounded-full shadow">✔ Insígnia Conquistada</span>' : '<span class="bg-amber-500 text-black font-black text-[9px] px-2 py-0.5 rounded-full animate-pulse shadow">⭐ Ginásio Pendente</span>'}
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    ${teamPokesHtml}
                </div>
                <div class="flex justify-between items-center text-[10px] text-slate-300 pt-1 border-t border-red-900/40">
                    <span>Prémio: <strong class="text-amber-400">${gymInfo.rewardGold} 🪙</strong></span>
                    <span>Insígnia: <strong class="text-amber-300 uppercase">${gymInfo.badgeKey}</strong></span>
                </div>
                <button onclick="document.getElementById('city-hub-modal').remove(); initiateGymSequence('${gymInfo.city}');" class="w-full bg-amber-600 hover:bg-amber-500 text-black font-black py-2 rounded-xl text-xs uppercase shadow transition-all cursor-pointer">
                    ⚔️ Desafiar Ginásio de ${gymInfo.city}
                </button>
            </div>
        `;
    }

    cityModal.innerHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-amber-500 rounded-2xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <span class="text-xs font-black text-amber-400 font-cinzel tracking-wider">🏙 CIDADE DE ${cityName.toUpperCase()}</span>
                <button onclick="document.getElementById('city-hub-modal').remove()" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-amber-950/60 rounded border border-amber-800">✕</button>
            </div>
            
            <div class="grid grid-cols-2 gap-2">
                <button onclick="document.getElementById('city-hub-modal').remove(); openPokemonCenterModal();" class="bg-emerald-700 hover:bg-emerald-600 text-white font-black py-2 px-3 rounded-xl text-[10px] uppercase shadow flex items-center justify-center gap-1.5 cursor-pointer">
                    🏥 Centro Pokémon
                </button>
                <button onclick="document.getElementById('city-hub-modal').remove(); openPokemartModal();" class="bg-blue-700 hover:bg-blue-600 text-white font-black py-2 px-3 rounded-xl text-[10px] uppercase shadow flex items-center justify-center gap-1.5 cursor-pointer">
                    🏪 Poké Mart
                </button>
            </div>

            ${gymSectionHtml}

            <button onclick="document.getElementById('city-hub-modal').remove()" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-xl text-xs cursor-pointer">Continuar Viagem</button>
        </div>
    `;
    cityModal.classList.remove('hidden');
};

window.openPokemonCenterModal = function() {
    const cp = getCurrentPlayer();
    if (cp.activeTeam) cp.activeTeam.forEach(mon => { mon.currentHp = mon.maxHp || mon.hp || 20; });
    if (cp.pcBox) cp.pcBox.forEach(mon => { mon.currentHp = mon.maxHp || mon.hp || 20; });

    renderTeamCardSlots();
    renderBottomPanel();
    updatePlayerUI();
    showCustomPopup("🏥 Centro Pokémon", `A enfermeira Joy cuidou da equipa de ${cp.name}!\n\n✨ Todos los Pokémon foram totalmente curados!`, true);
    appendAdventureLog(`${cp.name} visitou o Centro Pokémon: Equipa totalmente curada.`);
};

window.openPokemartModal = function() {
    let martModal = document.getElementById('pokemart-modal');
    if (!martModal) {
        martModal = document.createElement('div');
        martModal.id = 'pokemart-modal';
        martModal.className = 'fixed inset-0 bg-black/85 z-[350] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(martModal);
    }

    renderMartContent(martModal);
    martModal.classList.remove('hidden');
};

function renderMartContent(modalEl) {
    const cp = getCurrentPlayer();
    let itemsForSale = [
        { id: 'poke_ball', name: 'Poké Ball', type: 'sphere', value: 0, cost: 50, icon: '🔴', image: `${SUPABASE_STORAGE_URL}items/poke_ball.png`, desc: 'Esfera clássica.' },
        { id: 'ball_great', name: 'Great Ball', type: 'sphere', value: 1, cost: 100, icon: '🔵', image: `${SUPABASE_STORAGE_URL}items/great_ball.png`, desc: '+1 na captura.' },
        { id: 'ball_ultra', name: 'Ultra Ball', type: 'sphere', value: 2, cost: 200, icon: '🟡', image: `${SUPABASE_STORAGE_URL}items/ultra_ball.png`, desc: '+2 na captura.' },
        { id: 'item_rarecandy', name: 'Rare Candy', type: 'rarecandy', value: 100, cost: 300, icon: '🍬', image: `${SUPABASE_STORAGE_URL}items/rare_candy.png`, desc: 'Dá 100 XP (Sobe de Nível).' },
        { id: 'evolution_stone', name: 'Evolution Stone', type: 'evolution', value: 1, cost: 500, icon: '💎', image: `${SUPABASE_STORAGE_URL}items/evolution_stone.png`, desc: 'Evolve um Anima compatível.' },
        { id: 'item_potion', name: 'Potion', type: 'heal', value: 20, cost: 50, icon: '💊', image: `${SUPABASE_STORAGE_URL}items/potion.png`, desc: 'Restaura 20 HP.' },
        { id: 'item_revive', name: 'Revive', type: 'revive', value: 50, cost: 250, icon: '🌟', image: `${SUPABASE_STORAGE_URL}items/revive.png`, desc: 'Revive um Anima desmaiado.' },
        { id: 'item_vitamin', name: 'Vitamin', type: 'battle', value: 2, cost: 150, icon: '🧪', image: `${SUPABASE_STORAGE_URL}items/vitamin.png`, desc: '+2 STR na batalha.' }
    ];

    let shopHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-blue-500 rounded-2xl bg-gradient-to-b from-[#0f172a] to-[#020617] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-blue-900/60 pb-2">
                <span class="text-xs font-black text-blue-400 font-cinzel tracking-wider">🏪 POKÉ MART (${cp.name})</span>
                <span class="bg-amber-500 text-black font-black text-[10px] px-2 py-0.5 rounded">Ouro: ${cp.gold} 🪙</span>
            </div>
            <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
    `;

    itemsForSale.forEach(item => {
        const itemImg = item.image ? `<img src="${item.image}" class="w-8 h-8 object-contain">` : `<span class="text-xl">${item.icon}</span>`;
        shopHTML += `
            <div class="flex items-center justify-between bg-black/50 p-2.5 rounded-xl border border-blue-900/50">
                <div class="flex items-center gap-2">
                    ${itemImg}
                    <div>
                        <p class="text-xs font-bold text-white">${item.name}</p>
                        <p class="text-[9px] text-slate-400">${item.desc}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs font-black text-amber-400">${item.cost} 🪙</span>
                    <button onclick="buyItemFromMart('${item.id}', ${item.cost})" class="bg-blue-600 hover:bg-blue-500 text-white font-black px-3 py-1 rounded-lg text-[10px] shadow cursor-pointer">
                        Comprar
                    </button>
                </div>
            </div>
        `;
    });

    shopHTML += `
            </div>
            <button onclick="document.getElementById('pokemart-modal').remove()" class="w-full bg-slate-700 hover:bg-slate-600 text-white font-black py-2 rounded-xl text-xs uppercase shadow cursor-pointer">
                Sair da Loja
            </button>
        </div>
    `;

    modalEl.innerHTML = shopHTML;
}

window.buyItemFromMart = function(itemId, cost) {
    const cp = getCurrentPlayer();
    if (cp.gold < cost) {
        showCustomPopup("Sem Ouro", "❌ Não tens ouro suficiente para comprar este item!", false);
        return;
    }

    cp.gold -= cost;
    if (!Array.isArray(cp.inventory)) cp.inventory = [];
    let existingItem = cp.inventory.find(i => i.id === itemId);
    if (existingItem) {
        existingItem.count++;
    } else {
        let baseItemsCatalog = {
            poke_ball: { id: 'poke_ball', name: 'Poké Ball', type: 'sphere', value: 0, icon: '🔴', image: `${SUPABASE_STORAGE_URL}items/poke_ball.png`, count: 1, desc: 'Esfera clássica.' },
            ball_great: { id: 'ball_great', name: 'Great Ball', type: 'sphere', value: 1, icon: '🔵', image: `${SUPABASE_STORAGE_URL}items/great_ball.png`, count: 1, desc: '+1 na captura.' },
            ball_ultra: { id: 'ball_ultra', name: 'Ultra Ball', type: 'sphere', value: 2, icon: '🟡', image: `${SUPABASE_STORAGE_URL}items/ultra_ball.png`, count: 1, desc: '+2 na captura.' },
            item_rarecandy: { id: 'item_rarecandy', name: 'Rare Candy', type: 'rarecandy', value: 100, icon: '🍬', image: `${SUPABASE_STORAGE_URL}items/rare_candy.png`, count: 1, desc: 'Dá 100 XP (Sobe de Nível).' },
            evolution_stone: { id: 'evolution_stone', name: 'Evolution Stone', type: 'evolution', value: 1, icon: '💎', image: `${SUPABASE_STORAGE_URL}items/evolution_stone.png`, count: 1, desc: 'Evolve um Anima compatível.' },
            item_potion: { id: 'item_potion', name: 'Potion', type: 'heal', value: 20, icon: '💊', image: `${SUPABASE_STORAGE_URL}items/potion.png`, count: 1, desc: 'Restaura 20 HP.' },
            item_revive: { id: 'item_revive', name: 'Revive', type: 'revive', value: 50, icon: '🌟', image: `${SUPABASE_STORAGE_URL}items/revive.png`, count: 1, desc: 'Revive um Anima desmaiado.' },
            item_vitamin: { id: 'item_vitamin', name: 'Vitamin', type: 'battle', value: 2, icon: '🧪', image: `${SUPABASE_STORAGE_URL}items/vitamin.png`, count: 1, desc: 'Aumenta o STR do Pokémon.' }
        };
        if (baseItemsCatalog[itemId]) {
            cp.inventory.push(baseItemsCatalog[itemId]);
        }
    }

    updatePlayerUI();
    renderBottomPanel();
    showCustomPopup("Compra Realizada", "🎉 Item comprado com sucesso!", true);
    
    let martModal = document.getElementById('pokemart-modal');
    if (martModal) renderMartContent(martModal);
};

// --- FLUXO DE GINÁSIO INTEGRADO COM A ARENA TCG ---

let currentGymBattleSession = null;
let gymAttemptedThisTurn = {}; 

function initiateGymSequence(cityName) {
    const cp = getCurrentPlayer();
    const gymInfo = (typeof GYM_LEADERS_CATALOG !== 'undefined') ? GYM_LEADERS_CATALOG.find(g => g.city.toLowerCase() === cityName.toLowerCase()) : null;
    
    if (!gymInfo) {
        showCustomPopup("Aviso", "Este local não possui um ginásio oficial registado.", false);
        return;
    }

    const attemptKey = `${gameState.currentPlayerIndex}_${gymInfo.city}`;
    if (gymAttemptedThisTurn[attemptKey]) {
        showCustomPopup("Tentativa Esgotada", "⚠ Já fizeste a tua tentativa de desafio neste ginásio durante este turno! Podes tentar novamente apenas no próximo turno.", false);
        return;
    }

    currentGymBattleSession = {
        gym: gymInfo,
        format: gymInfo.format || 1,
        challengerTeam: []
    };

    if (typeof openBattleArena === 'function') {
        openBattleArena({
            type: 'gym',
            format: gymInfo.format,
            data: gymInfo
        });
    } else {
        showGymVsScreen(gymInfo);
    }
}

function showGymVsScreen(gymInfo) {
    let vsModal = document.getElementById('gym-vs-modal');
    if (!vsModal) {
        vsModal = document.createElement('div');
        vsModal.id = 'gym-vs-modal';
        vsModal.className = 'fixed inset-0 bg-black/95 z-[450] flex flex-col items-center justify-center p-6 text-white backdrop-blur-md';
        document.body.appendChild(vsModal);
    }

    let leaderFileName = gymInfo.leader;
    if (leaderFileName === "Misty") leaderFileName = "misty";
    const leaderSpriteUrl = `${SUPABASE_STORAGE_URL}leaders/${encodeURIComponent(leaderFileName)}.png`;

    let leaderPokemonsHtml = '';
    const leaderTeam = gymInfo.pokemons || [gymInfo.pokemon];
    leaderTeam.forEach(pk => {
        leaderPokemonsHtml += `<img src="${pk.image}" class="w-12 h-12 object-contain bg-black/60 rounded-xl p-1.5 border border-red-600 shadow" title="${pk.name} Nv.${pk.level}">`;
    });

    vsModal.innerHTML = `
        <div class="text-center space-y-2 mb-8 animate-fadeIn">
            <span class="text-xs font-black text-amber-400 uppercase tracking-widest font-cinzel">Ginásio Oficial de ${gymInfo.city}</span>
            <h2 class="text-2xl font-black text-white font-cinzel tracking-wider">LÍDER ${gymInfo.leader.toUpperCase()}</h2>
            <p class="text-xs text-amber-300 font-bold">Formato de Batalha: ${gymInfo.format}x${gymInfo.format}</p>
        </div>

        <div class="flex items-center justify-center gap-8 my-4 w-full max-w-2xl">
            <div class="flex flex-col items-center border-4 border-amber-500 rounded-3xl p-5 bg-gradient-to-b from-amber-950 to-black shadow-2xl w-48">
                <img src="${leaderSpriteUrl}" class="w-24 h-24 object-contain mb-2 drop-shadow-[0_0_10px_rgba(255,215,0,0.6)]" onerror="this.src='https://api.iconify.design/noto:man-raising-hand.svg'">
                <span class="text-xs font-black text-amber-300 uppercase">Líder</span>
            </div>
            
            <div class="text-3xl font-black text-red-500 animate-pulse font-cinzel">VS</div>
            
            <div class="flex flex-col items-center border-4 border-red-600 rounded-3xl p-5 bg-gradient-to-b from-red-950 to-black shadow-2xl w-48 space-y-2">
                <div class="flex flex-wrap justify-center gap-1.5 min-h-[48px]">
                    ${leaderPokemonsHtml}
                </div>
                <span class="text-xs font-black text-red-300 uppercase">Cartel Inimigo</span>
            </div>
        </div>

        <button onclick="document.getElementById('gym-vs-modal').remove(); openTeamSelectionModalForGym();" class="mt-8 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-black px-8 py-3 rounded-2xl text-xs uppercase tracking-wider shadow-2xl transition-all transform hover:scale-105 cursor-pointer">
            Preparar Equipa e Aceitar Desafio <i class="fa-solid fa-arrow-right ml-1"></i>
        </button>
    `;
    vsModal.classList.remove('hidden');
}

function openTeamSelectionModalForGym() {
    const cp = getCurrentPlayer();
    const formatLimit = currentGymBattleSession ? currentGymBattleSession.format : 1;
    let selectedIndices = [];

    let selModal = document.getElementById('team-selection-modal');
    if (!selModal) {
        selModal = document.createElement('div');
        selModal.id = 'team-selection-modal';
        selModal.className = 'fixed inset-0 bg-black/90 z-[400] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(selModal);
    }

    function renderSelectionGrid() {
        let teamGridHtml = '';
        if (cp.activeTeam) {
            cp.activeTeam.forEach((mon, idx) => {
                const isFainted = (mon.currentHp !== undefined ? mon.currentHp : mon.maxHp) <= 0;
                const isSelected = selectedIndices.includes(idx);
                const tierCardBg = getTierColorClass(mon.tier || 1);
                const auraGymSelClass = mon.auraEffect || '';
                const monImgSrc = mon.isShiny && mon.shinyImage ? mon.shinyImage : (mon.image || '');

                teamGridHtml += `
                    <div onclick="${isFainted ? '' : `toggleGymTeamSelection(${idx})`}" class="${tierCardBg} ${auraGymSelClass} p-3 rounded-2xl border-2 ${isSelected ? 'border-amber-400 bg-amber-950/80 scale-105' : 'border-amber-900/60'} ${isFainted ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-amber-500'} flex flex-col justify-between h-36 transition-all text-white">
                        <div class="flex justify-between items-center text-[10px] font-bold text-amber-300">
                            <span>${mon.name}</span>
                            <span>Nv.${mon.level || 1}</span>
                        </div>
                        <div class="my-auto flex justify-center bg-black/40 rounded p-1">
                            <img src="${monImgSrc}" class="w-14 h-14 object-contain">
                        </div>
                        <div class="text-[9px] text-center font-bold ${isFainted ? 'text-red-400' : 'text-emerald-400'}">
                            ${isFainted ? 'DESMAIADO' : `HP: ${mon.currentHp !== undefined ? mon.currentHp : mon.maxHp}/${mon.maxHp}`}
                        </div>
                    </div>
                `;
            });
        }

        const canConfirm = selectedIndices.length === formatLimit;

        selModal.innerHTML = `
            <div class="trainer-card max-w-2xl w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
                <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                    <span class="text-xs font-black text-amber-400 font-cinzel">🛡 SELEÇÃO DE EQUIPA (${selectedIndices.length}/${formatLimit})</span>
                    <button onclick="document.getElementById('team-selection-modal').remove();" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800">✕ Cancelar</button>
                </div>
                <div class="grid grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1">
                    ${teamGridHtml}
                </div>
                <div class="flex gap-2">
                    <button onclick="document.getElementById('team-selection-modal').remove();" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer">
                        Voltar / Desistir
                    </button>
                    <button onclick="confirmGymTeamSelection([${selectedIndices.join(',')}])" ${canConfirm ? '' : 'disabled'} class="flex-2 ${canConfirm ? 'bg-amber-500 hover:bg-amber-400 text-black cursor-pointer shadow-lg' : 'bg-slate-800 text-slate-500 cursor-not-allowed'} font-black py-3 rounded-xl text-xs uppercase tracking-wider transition-all">
                        Confirmar e Iniciar
                    </button>
                </div>
            </div>
        `;
    }

    window.toggleGymTeamSelection = function(idx) {
        const exists = selectedIndices.indexOf(idx);
        if (exists > -1) {
            selectedIndices.splice(exists, 1);
        } else {
            if (selectedIndices.length < formatLimit) {
                selectedIndices.push(idx);
            } else {
                showCustomPopup("Limite Atingido", ` Este ginásio permite apenas uma equipa de ${formatLimit} Pokémon!`, false);
            }
        }
        renderSelectionGrid();
    };

    renderSelectionGrid();
    selModal.classList.remove('hidden');
}

window.confirmGymTeamSelection = function(chosenIndexes) {
    const selModal = document.getElementById('team-selection-modal');
    if (selModal) selModal.remove();

    if (currentGymBattleSession) {
        currentGymBattleSession.challengerTeam = chosenIndexes;
        executeLockedGymBattleSequence();
    }
};

function executeLockedGymBattleSequence() {
    const cp = getCurrentPlayer();
    const gym = currentGymBattleSession.gym;
    
    const attemptKey = `${gameState.currentPlayerIndex}_${gym.city}`;
    gymAttemptedThisTurn[attemptKey] = true;

    let activeMonIndex = currentGymBattleSession.challengerTeam[0];
    let activeMon = cp.activeTeam[activeMonIndex];
    const leaderTeam = gym.pokemons || [gym.pokemon];
    let leaderPoke = leaderTeam[0];

    if (!activeMon || (activeMon.currentHp !== undefined ? activeMon.currentHp : activeMon.maxHp) <= 0) {
        showCustomPopup("Derrota", "⚠️ O teu Pokémon escolhido está desmaiado!", false);
        return;
    }

    rollDiceWithAnimation((playerDice, leaderDice) => {
        const typeMult = calculateTypeAdvantageMultiplier(activeMon.type, leaderPoke.type);
        const playerPower = (activeMon.str || 4) + playerDice + (typeMult > 1 ? 2 : 0);
        const leaderPower = leaderPoke.str + leaderDice;

        if (playerPower >= leaderPower) {
            if (!Array.isArray(cp.badges)) cp.badges = [];
            if (!cp.badges.includes(gym.badgeKey)) {
                cp.badges.push(gym.badgeKey);
            }
            cp.gold += gym.rewardGold;

            showCustomPopup(
                `🏆 VITÓRIA NO GINÁSIO DE ${gym.city.toUpperCase()}!`,
                `Derrotaste o Líder ${gym.leader}!\n\n✨ Ganhaste a Insígnia oficial!\n💰 Ouro: +${gym.rewardGold}\n🎖️ Total de Insígnias: ${cp.badges.length} / 6`,
                true
            );

            addExperienceToMonster(activeMon, 70);
            updatePlayerUI();
            appendAdventureLog(`${cp.name} conquistou a insígnia de ${gym.city} contra o Líder ${gym.leader}!`);
        } else {
            let damage = 20;
            activeMon.currentHp = Math.max(0, (activeMon.currentHp || activeMon.maxHp) - damage);

            showCustomPopup(
                `💥 DERROTA CONTRA ${gym.leader.toUpperCase()}`,
                `O ${leaderPoke.name} do líder foi superior nesta ronda tática.\n\n💔 ${activeMon.name} sofreu ${damage} de dano!\n\n⚠ Tentativa de ginásio esgotada para este turno.`,
                false
            );
            renderTeamCardSlots();
        }
    });
}

// --- INTERAÇÃO ENTRE JOGADORES NA MESMA CASA ---

function checkPlayerCellCollision(zoneId, movedPlayerIndex) {
    if (!gameState.players || !Array.isArray(gameState.players) || gameState.players.length <= 1) return;
    const currentMover = gameState.players[movedPlayerIndex];
    
    const cooccupants = gameState.players.filter((p, idx) => idx !== movedPlayerIndex && p.currentZone === zoneId);
    if (cooccupants.length > 0) {
        openMultiplayerInteractionModal(currentMover, cooccupants[0]);
    }
}

function openMultiplayerInteractionModal(playerA, playerB) {
    let interModal = document.getElementById('mp-interaction-modal');
    if (!interModal) {
        interModal = document.createElement('div');
        interModal.id = 'mp-interaction-modal';
        interModal.className = 'fixed inset-0 bg-black/85 z-[380] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(interModal);
    }

    interModal.innerHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-purple-500 rounded-2xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-purple-900 pb-2">
                <span class="text-xs font-black text-purple-400 font-cinzel">🤝 ENCONTRO DE TREINADORES</span>
                <button onclick="document.getElementById('mp-interaction-modal').remove()" class="text-purple-400 font-bold text-sm px-2 bg-purple-950 rounded cursor-pointer">✕</button>
            </div>
            <p class="text-xs text-slate-300 text-center"><span class="text-amber-300 font-bold">${playerA.name}</span> e <span class="text-amber-300 font-bold">${playerB.name}</span> pararam na mesma casa!</p>
            <div class="space-y-2.5">
                <button onclick="document.getElementById('mp-interaction-modal').remove(); triggerPvPBattleArena('${playerB.name}');" class="w-full bg-red-700 hover:bg-red-600 text-white font-black py-2.5 rounded-xl text-xs uppercase shadow cursor-pointer">
                    ⚔️ Desafiar para Batalha PvP na Arena
                </button>
                
                <button onclick="document.getElementById('mp-interaction-modal').remove(); openTradeModal('${playerA.name}', '${playerB.name}');" class="w-full bg-blue-700 hover:bg-blue-600 text-white font-black py-2.5 rounded-xl text-xs uppercase shadow cursor-pointer">
                    🔄 Propor Troca de Anima / Itens
                </button>

                <button onclick="document.getElementById('mp-interaction-modal').remove(); openSpecificTrainerCardModal(${gameState.players.findIndex(p => p.name === playerB.name)});" class="w-full bg-amber-700 hover:bg-amber-600 text-black font-black py-2.5 rounded-xl text-xs uppercase shadow cursor-pointer">
                    📋 Ver Trainer Card de ${playerB.name}
                </button>
            </div>
            <button onclick="document.getElementById('mp-interaction-modal').remove()" class="w-full bg-slate-800 text-slate-300 font-bold py-2 rounded-xl text-xs cursor-pointer">Continuar Viagem</button>
        </div>
    `;
    interModal.classList.remove('hidden');
}

function triggerPvPBattleArena(opponentName) {
    const opponent = gameState.players.find(p => p.name === opponentName);
    if (!opponent) return;

    if (typeof openBattleArena === 'function') {
        openBattleArena({
            type: 'pvp',
            format: 1,
            opponent: opponent
        });
    } else {
        showCustomPopup("Erro", "Módulo da Arena de Batalha indisponível.", false);
    }
}
// --- SISTEMA DE ENCONTRO / BATALHA TCG (SELVAGENS) ---

function openEncounterModalWithPokemon(pokemon) {
    const cp = getCurrentPlayer();
    const modal = document.getElementById('encounter-modal');
    if (!modal) return;

    if (!cp.activeTeam || cp.activeTeam.length === 0) {
        showCustomPopup("Aviso", "🚫 Precisas de pelo menos um Pokémon na Equipa Ativa!", false);
        return;
    }

    let validIndex = cp.activeTeam.findIndex(m => (m.currentHp !== undefined ? m.currentHp : m.maxHp) > 0);
    if (validIndex === -1) {
        showCustomPopup("Equipa Desmaiada!", "⚠ Todos os Pokémon da tua Equipa Ativa estão desmaiados (HP 0)!", false);
        return;
    }

    if (typeof currentEncounterState !== 'undefined') {
        currentEncounterState.wildPokemon = pokemon;
        currentEncounterState.itemBonus = 0;
        currentEncounterState.battlePowerBonus = 0;
        currentEncounterState.selectedTeamMemberIndex = validIndex;
        currentEncounterState.hasAttemptedCapture = false;
    }

    if (typeof updateEncounterUIInfo === 'function') updateEncounterUIInfo();
    if (typeof renderEncounterItemsList === 'function') renderEncounterItemsList();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cyclePlayerEncounterPokemon() {
    const cp = getCurrentPlayer();
    if (!cp.activeTeam || cp.activeTeam.length <= 1) return;
    let startIndex = currentEncounterState.selectedTeamMemberIndex;
    let nextIndex = (startIndex + 1) % cp.activeTeam.length;
    
    while (nextIndex !== startIndex) {
        let mon = cp.activeTeam[nextIndex];
        let hp = mon.currentHp !== undefined ? mon.currentHp : mon.maxHp;
        if (hp > 0) break;
        nextIndex = (nextIndex + 1) % cp.activeTeam.length;
    }

    currentEncounterState.selectedTeamMemberIndex = nextIndex;
    updateEncounterUIInfo();
}

function renderEncounterItemsList() {
    const cp = getCurrentPlayer();
    const container = document.getElementById('encounter-items-container');
    if (!container) return;
    container.innerHTML = '';

    if (cp.inventory) {
        cp.inventory.forEach((item, index) => {
            if (!item || item.count <= 0) return;
            const btn = document.createElement('button');
            btn.className = "bg-blue-900/60 hover:bg-blue-800 text-blue-200 px-2.5 py-1 rounded-lg border border-blue-600 text-[10px] flex items-center gap-1.5 shadow cursor-pointer";
            const itemImg = item.image ? `<img src="${item.image}" class="w-4 h-4 object-contain">` : `<span>${item.icon}</span>`;
            btn.innerHTML = `${itemImg} <span>${item.name} (${item.count})</span>`;
            btn.onclick = () => useItemInEncounter(item, index);
            container.appendChild(btn);
        });
    }
}

function useItemInEncounter(item, itemIndex) {
    const cp = getCurrentPlayer();
    const activeMon = cp.activeTeam[currentEncounterState.selectedTeamMemberIndex];
    if (!activeMon) return;

    if (item.type === 'sphere') {
        item.count--;
        currentEncounterState.itemBonus = item.value || 0;
        
        if (item.aura) {
            selectedBallAura = item.aura;
        }

        showCustomPopup("Poké Ball Lançada", `🔴 Lançaste uma ${item.name}!\nBónus aplicado: +${item.value || 0}`);
        
        renderEncounterItemsList();
        updateEncounterUIInfo();
        resolveCaptureAttempt();

    } else if (item.type === 'battle') {
        item.count--;
        currentEncounterState.battlePowerBonus += (item.value || 2);
        showCustomPopup("Item Usado", `⚔️ ${item.name} aplicada! STR +${item.value} para este combate.`);
        renderEncounterItemsList();
        updateEncounterUIInfo();
    } else if (item.type === 'heal') {
        if (activeMon.currentHp >= activeMon.maxHp) {
            showCustomPopup("Aviso", `${activeMon.name} já está com HP máximo!`, false);
            return;
        }
        item.count--;
        activeMon.currentHp = Math.min(activeMon.maxHp, activeMon.currentHp + item.value);
        showCustomPopup("Item Usado", `💊 Potion usada em ${activeMon.name}!`);
        renderEncounterItemsList();
        updateEncounterUIInfo();
        renderTeamCardSlots();
    } else if (item.type === 'revive') {
        if (activeMon.currentHp > 0) {
            showCustomPopup("Aviso", `${activeMon.name} não está desmaiado!`, false);
            return;
        }
        item.count--;
        activeMon.currentHp = Math.floor(activeMon.maxHp / 2);
        showCustomPopup("Item Usado", `🌟 Revive usado em ${activeMon.name}!`, true);
        renderEncounterItemsList();
        updateEncounterUIInfo();
        renderTeamCardSlots();
    }
}

// --- ROLAGEM DE DADO ---
function rollDiceWithAnimation(callback) {
    let diceOverlay = document.getElementById('central-dice-overlay');
    if (!diceOverlay) {
        diceOverlay = document.createElement('div');
        diceOverlay.id = 'central-dice-overlay';
        diceOverlay.className = 'fixed inset-0 bg-black/90 z-[500] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(diceOverlay);
    }

    const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    
    let counter = 0;
    const interval = setInterval(() => {
        const randomFace = diceFaces[Math.floor(Math.random() * diceFaces.length)];
        
        diceOverlay.innerHTML = `
            <div class="trainer-card max-w-xs w-full p-8 text-center space-y-4 border-4 border-amber-400 rounded-3xl bg-gradient-to-b from-amber-950 to-black shadow-2xl animate-pulse">
                <h3 class="text-lg font-black text-amber-300 font-cinzel tracking-widest">ROLANDO O DADO...</h3>
                <div class="text-7xl my-4 text-amber-400 drop-shadow-[0_0_20px_rgba(255,215,0,0.8)]">${randomFace}</div>
                <p class="text-xs text-slate-300 font-bold">A sortear valor aleatório (1 - 6)</p>
            </div>
        `;
        diceOverlay.classList.remove('hidden');
        counter++;
        
        if (counter > 12) {
            clearInterval(interval);
            const finalPlayerRoll = Math.floor(Math.random() * 6) + 1;
            const finalWildRoll = Math.floor(Math.random() * 6) + 1;
            const finalFace = diceFaces[finalPlayerRoll - 1];

            diceOverlay.innerHTML = `
                <div class="trainer-card max-w-xs w-full p-8 text-center space-y-4 border-4 border-amber-400 rounded-3xl bg-gradient-to-b from-amber-950 to-black shadow-2xl animate-bounce">
                    <h3 class="text-lg font-black text-emerald-400 font-cinzel tracking-widest">DADO SORTEADO!</h3>
                    <div class="text-7xl my-4 text-amber-300 drop-shadow-[0_0_25px_rgba(255,215,0,1)]">${finalFace}</div>
                    <p class="text-sm font-black text-white bg-black/60 p-2 rounded-xl">Resultado obtido: <span class="text-amber-400 text-lg">+${finalPlayerRoll}</span></p>
                </div>
            `;

            setTimeout(() => {
                diceOverlay.remove();
                callback(finalPlayerRoll, finalWildRoll);
            }, 1200);
        }
    }, 80);
}

function showCustomPopup(title, message, isSuccess = true) {
    let popupEl = document.getElementById('game-custom-popup');
    if (!popupEl) {
        popupEl = document.createElement('div');
        popupEl.id = 'game-custom-popup';
        popupEl.className = 'fixed inset-0 bg-black/80 z-[400] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(popupEl);
    }

    const borderColor = isSuccess ? 'border-amber-400' : 'border-red-600';
    const headerColor = isSuccess ? 'text-amber-300' : 'text-red-400';

    popupEl.innerHTML = `
        <div class="trainer-card max-w-sm w-full p-6 text-center space-y-4 border-4 ${borderColor} rounded-2xl bg-gradient-to-b from-[#1c1410] to-black shadow-2xl text-white">
            <h2 class="text-base font-black ${headerColor} font-cinzel tracking-wider">${title}</h2>
            <div class="text-xs text-slate-200 whitespace-pre-line leading-relaxed bg-black/40 p-3 rounded-xl border border-amber-900/50">
                ${message}
            </div>
            <button onclick="document.getElementById('game-custom-popup').remove()" class="w-full bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-400 text-black font-black py-2.5 rounded-xl text-xs uppercase shadow transition-all cursor-pointer">
                Continuar
            </button>
        </div>
    `;
    popupEl.classList.remove('hidden');
}

function resolveCaptureAttempt() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;
    const activeMon = cp.activeTeam[currentEncounterState.selectedTeamMemberIndex];
    if (!wild) return;

    let requiredTarget = 4;
    const tier = wild.tier || 1;
    const isLegendary = (tier === 5) || (wild.color && wild.color.toLowerCase() === 'amarelo');

    if (tier === 2) {
        requiredTarget = 5;
    } else if (tier === 3 || tier === 4) {
        requiredTarget = 6;
    } else if (isLegendary) {
        requiredTarget = 7;
    }

    if (wild.isShiny) {
        requiredTarget += 1;
    }

    const weakenedBonus = (wild.weakened && !isLegendary) ? 1 : 0;

    rollDiceWithAnimation((roll, _) => {
        const totalCaptureValue = roll + currentEncounterState.itemBonus + weakenedBonus;
        let success = totalCaptureValue >= requiredTarget;

        if (success) {
            showCustomPopup("🔴🔵 CAPTURA BEM-SUCEDIDA!", `A Poké Ball abanou... Click!\nCapturaste o ${wild.isShiny ? '✨ Shiny ' : ''}${wild.name} (Nv. ${wild.level}) e foi enviado para a PC Box!\n(Dado: ${roll} + Bónus: ${currentEncounterState.itemBonus + weakenedBonus} = ${totalCaptureValue} vs Alvo ${requiredTarget}+)`, true);
            addMonsterToPlayer(wild);

            if (wild.waypointId) {
                cp.currentZone = wild.waypointId;
                if (boardPokemonCards[wild.waypointId]) {
                    delete boardPokemonCards[wild.waypointId];
                }
            }
            if (typeof renderBoardMap === 'function') renderBoardMap();

            if (activeMon && activeMon.currentHp > 0) addExperienceToMonster(activeMon, 30);
            closeEncounterModalUI();
        } else {
            if (!isLegendary) {
                wild.weakened = true;
                if (wild.waypointId && boardPokemonCards[wild.waypointId]) {
                    boardPokemonCards[wild.waypointId].weakened = true;
                }
            }

            if (wild.waypointId) {
                cp.currentZone = wild.waypointId;
            }
            if (typeof renderBoardMap === 'function') renderBoardMap();

            const weakenedNotice = (!isLegendary) ? "\n🩹 O Pokémon ficou enfraquecido no tabuleiro (+1 bónus permanente na próxima tentativa)!" : "";
            showCustomPopup("❌ A CAPTURA FALHOU!", `O ${wild.name} libertou-se!\n(Dado: ${roll} + Bónus: ${currentEncounterState.itemBonus + weakenedBonus} = ${totalCaptureValue} | Necessário: ${requiredTarget}+).${weakenedNotice}`, false);
            
            updateEncounterUIInfo();
        }
    });
}

function fleeEncounter() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;
    if (wild && wild.waypointId) {
        cp.currentZone = wild.waypointId;
    }
    showCustomPopup("Fuga", "🏃‍♂ Afastaste-te do Pokémon com segurança!", true);
    closeEncounterModalUI();
    if (typeof renderBoardMap === 'function') renderBoardMap();
}

function closeEncounterModalUI() {
    const modal = document.getElementById('encounter-modal');
    if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }
}

function checkMonsterEvolution(monster) {
    if (!monster.evolvesTo) return;
    if (monster.level >= (monster.evolutionLevel || 16)) {
        const nextEvolution = MONSTER_CATALOG.find(m => m.id === monster.evolvesTo);
        if (nextEvolution) {
            const oldName = monster.name;
            monster.name = nextEvolution.name;
            monster.image = nextEvolution.image;
            if (nextEvolution.shinyImage) monster.shinyImage = nextEvolution.shinyImage;
            monster.str = (monster.str || 4) + 3;
            monster.maxHp = (monster.maxHp || 20) + 10;
            monster.currentHp = monster.maxHp;
            
            appendAdventureLog(`✨ O ${oldName} evoluiu para ${monster.name}!`);
            showEvolutionModalUI(oldName, monster);
        }
    }
}

function showEvolutionModalUI(oldName, evolvedMonster) {
    let evoModal = document.getElementById('evolution-popup-modal');
    if (!evoModal) {
        evoModal = document.createElement('div');
        evoModal.id = 'evolution-popup-modal';
        evoModal.className = 'fixed inset-0 bg-black/90 z-[300] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(evoModal);
    }

    const evoImgUrl = evolvedMonster.isShiny && evolvedMonster.shinyImage ? evolvedMonster.shinyImage : evolvedMonster.image;

    evoModal.innerHTML = `
        <div class="trainer-card max-w-sm w-full p-6 text-center space-y-4 border-4 border-amber-400 rounded-2xl bg-gradient-to-b from-amber-950 to-black shadow-2xl animate-bounce">
            <h2 class="text-lg font-black text-amber-300 font-cinzel">✨ EVOLUÇÃO! ✨</h2>
            <p class="text-xs text-slate-300">O teu <span class="font-bold text-white">${oldName}</span> está a evoluir...</p>
            <div class="my-3 flex justify-center">
                <img src="${evoImgUrl}" alt="${evolvedMonster.name}" class="w-24 h-24 object-contain drop-shadow-[0_0_15px_rgba(255,215,0,0.8)]" onerror="this.src='https://api.iconify.design/noto:star.svg'">
            </div>
            <h3 class="text-xl font-black text-amber-400 uppercase tracking-wider">${evolvedMonster.name}!</h3>
            <p class="text-[10px] text-emerald-400 font-bold">Atributos melhorados: STR ${evolvedMonster.str} | HP ${evolvedMonster.maxHp}</p>
            <button onclick="document.getElementById('evolution-popup-modal').remove()" class="w-full bg-amber-500 hover:bg-amber-400 text-black font-black py-2.5 rounded-xl text-xs uppercase shadow transition-all cursor-pointer">
                Continuar Aventura
            </button>
        </div>
    `;
    evoModal.classList.remove('hidden');
}

function addExperienceToMonster(monster, amount) {
    monster.xp = (monster.xp || 0) + amount;
    if (monster.xp >= 100) {
        monster.xp -= 100;
        monster.level = (monster.level || 1) + 1;
        
        monster.maxHp = (monster.maxHp || 20) + 2;
        monster.currentHp = Math.min(monster.maxHp, (monster.currentHp || monster.maxHp) + 2);
        monster.str = (monster.str || 4) + 1;

        appendAdventureLog(`📈 ${monster.name} subiu para o Nível ${monster.level}! (HP +2, STR +1)`);
        checkMonsterEvolution(monster);
    }
    renderTeamCardSlots();
}

function handleDragStart(e, sourceArea, index) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ sourceArea, index }));
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e, targetArea, targetIndex) {
    e.preventDefault();
    const cp = getCurrentPlayer();
    const dataRaw = e.dataTransfer.getData('text/plain');
    if (!dataRaw) return;

    try {
        const data = JSON.parse(dataRaw);
        if (!data.sourceArea) return;
        if (!cp.activeTeam) cp.activeTeam = [];
        if (!cp.pcBox) cp.pcBox = [];

        const sourceList = data.sourceArea === 'team' ? cp.activeTeam : cp.pcBox;
        const targetList = targetArea === 'team' ? cp.activeTeam : cp.pcBox;
        const movedMonster = sourceList[data.index];
        if (!movedMonster) return;

        if (targetArea === 'team') {
            const tier = movedMonster.tier || 1;
            const badgeCount = Array.isArray(cp.badges) ? cp.badges.length : 0;

            if (tier === 3 && badgeCount < 1) {
                showCustomPopup("Portão de Insígnia", "⚠ Precisas de pelo menos 1 insígnia para colocar um Pokémon Tier 3 (Azul) na Equipa Ativa!", false);
                return;
            }
            if (tier === 4 && badgeCount < 3) {
                showCustomPopup("Portão de Insígnia", "⚠ Precisas de pelo menos 3 insígnias para colocar um Pokémon Tier 4 (Vermelho) na Equipa Ativa!", false);
                return;
            }
            if (tier === 5 && badgeCount < 4) {
                showCustomPopup("Portão de Insígnia", "⚠ Precisas de pelo menos 4 insígnias para colocar um Pokémon Tier 5 (Amarelo/Lendário) na Equipa Ativa!", false);
                return;
            }
        }

        sourceList.splice(data.index, 1);
        if (targetArea === 'team') targetList.push(movedMonster);
        else targetList.splice(targetIndex, 0, movedMonster);

        renderTeamCardSlots();
        renderBottomPanel();
    } catch (err) {}
}

function renderTeamCardSlots() {
    const cp = getCurrentPlayer();
    for (let i = 0; i < 6; i++) {
        const slotContainer = document.getElementById(`trainer-card-slot-${i}`);
        if (!slotContainer) continue;

        const monster = cp.activeTeam ? cp.activeTeam[i] : null;
        if (monster) {
            const activeImg = monster.isShiny && monster.shinyImage ? monster.shinyImage : monster.image;
            const visualContent = activeImg 
                ? `<img src="${activeImg}" alt="${monster.name}" class="w-full h-14 object-contain ${monster.currentHp <= 0 ? 'grayscale opacity-50' : ''}">`
                : `<span class="text-2xl">👾</span>`;

            const curHp = monster.currentHp !== undefined ? monster.currentHp : (monster.maxHp || 20);
            const maxHp = monster.maxHp || monster.hp || 20;
            const isFainted = curHp <= 0;
            const shinyMarker = monster.isShiny ? '<span class="absolute top-0.5 right-0.5 text-[7px] font-black bg-amber-400 text-black px-1 rounded animate-pulse">✨SHINY</span>' : '';
            const auraClass = monster.auraEffect || '';
            const tierCardBg = getTierColorClass(monster.tier || 1);

            slotContainer.innerHTML = `
                <div draggable="true" ondragstart="handleDragStart(event, 'team', ${i})" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'team', ${i})" onclick="event.stopPropagation(); openPokemonDetailModal('${monster.uniqueId}', 'team')" class="${tierCardBg} ${isFainted ? 'from-red-950 to-red-900 border-red-600 text-red-200' : ''} ${monster.isShiny ? 'border-amber-400 shiny-card-glow' : 'border-amber-600'} ${auraClass} border rounded p-1 flex flex-col justify-between h-full shadow cursor-pointer hover:brightness-105 transition-all relative text-white">
                    ${shinyMarker}
                    <div class="flex justify-between items-center text-[8px] font-bold">
                        <span class="truncate">${monster.name}</span>
                        <span>Nv.${monster.level || 1}</span>
                    </div>
                    <div class="my-auto bg-black/40 rounded border border-amber-400/50 flex items-center justify-center p-0.5 h-12 relative">
                        ${visualContent}
                        ${isFainted ? '<span class="absolute text-[8px] font-black bg-red-600 text-white px-1 rounded">DESMAIADO</span>' : ''}
                    </div>
                    <div class="text-[7px] text-center font-bold text-amber-300">
                        HP: ${curHp}/${maxHp} | STR: ${monster.str || 4}
                    </div>
                </div>
            `;
        } else {
            slotContainer.innerHTML = `
                <div ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'team', ${i})" class="border border-dashed border-amber-500/40 rounded bg-black/20 flex items-center justify-center text-[9px] text-amber-500/50 h-full">
                    Vazio
                </div>
            `;
        }
    }
}

window.switchBottomView = function(viewType) {
    gameState.currentBottomView = viewType;
    renderBottomPanel();
}

// --- PC BOX COM PAGINAÇÃO DINÂMICA (12 por página) ---
function renderBottomPanel() {
    const cp = getCurrentPlayer();
    const container = document.getElementById('bottom-dynamic-container');
    const titleElement = document.getElementById('bottom-panel-title');
    if (!container) return;
    container.innerHTML = '';

    if (gameState.currentBottomView === 'inventory') {
        if (titleElement) titleElement.innerText = 'Mochila (Itens & Orbes) - Clica num item para usar';
        if (cp.inventory) {
            cp.inventory.forEach((item) => {
                if (!item || item.count <= 0) return;
                
                const slot = document.createElement('div');
                slot.className = 'flex flex-col justify-between p-2 border border-amber-700 bg-black/80 rounded-xl h-24 shadow cursor-pointer hover:border-amber-400 transition-all text-white relative';
                slot.onclick = () => useInventoryItemMainScreen(item.id);
                
                const itemVisual = item.image 
                    ? `<img src="${item.image}" alt="${item.name}" class="w-10 h-10 object-contain drop-shadow" onerror="this.onerror=null; this.src='https://api.iconify.design/noto:package.svg'">`
                    : `<span class="text-2xl">${item.icon || '🎒'}</span>`;

                slot.innerHTML = `
                    <div class="flex justify-between items-center text-[10px] font-bold">
                        <span class="text-amber-300 truncate">${item.name}</span>
                        <span class="bg-amber-600 text-black font-black text-[9px] px-1.5 py-0.2 rounded-full">Qtd: ${item.count}</span>
                    </div>
                    <div class="flex justify-center items-center my-auto">
                        ${itemVisual}
                    </div>
                    <div class="text-[8px] text-slate-400 text-center truncate">
                        ${item.desc || ''}
                    </div>
                `;
                container.appendChild(slot);
            });
        }
    } else {
        const totalBoxes = cp.pcBox ? cp.pcBox.length : 0;
        const maxPages = Math.max(0, Math.ceil(totalBoxes / 12) - 1);
        if ((gameState.pcBoxCurrentPage || 0) > maxPages) gameState.pcBoxCurrentPage = maxPages;
        const currentPage = gameState.pcBoxCurrentPage || 0;

        if (titleElement) {
            titleElement.innerHTML = `
                <span>Banco PC Box (Página ${currentPage + 1} de ${maxPages + 1})</span>
                <div class="flex gap-2">
                    <button onclick="changePcBoxPage(-1)" class="bg-amber-600 hover:bg-amber-500 px-2 py-0.5 rounded text-[10px] text-black font-bold cursor-pointer">◀</button>
                    <button onclick="changePcBoxPage(1)" class="bg-amber-600 hover:bg-amber-500 px-2 py-0.5 rounded text-[10px] text-black font-bold cursor-pointer">▶</button>
                </div>
            `;
        }

        const pageSize = 12;
        const startIndex = currentPage * pageSize;

        for (let i = 0; i < pageSize; i++) {
            const realIndex = startIndex + i;
            const monster = cp.pcBox ? cp.pcBox[realIndex] : null;
            const slot = document.createElement('div');
            
            if (monster) {
                slot.draggable = true;
                slot.ondragstart = (e) => handleDragStart(e, 'pcbox', realIndex);
                slot.ondragover = handleDragOver;
                slot.ondrop = (e) => handleDrop(e, 'pcbox', realIndex);
                slot.onclick = () => openPokemonDetailModal(monster.uniqueId, 'pcbox');
                slot.className = "flex flex-col justify-between p-1 bg-slate-900 border border-sky-600 rounded h-20 cursor-pointer hover:brightness-110 shadow text-white";
                
                const curHp = monster.currentHp !== undefined ? monster.currentHp : monster.maxHp;
                const maxHp = monster.maxHp || monster.hp || 20;

                slot.innerHTML = `
                    <div class="text-[8px] text-sky-400 font-bold flex justify-between">
                        <span>${monster.name}</span>
                        <span>Nv.${monster.level}</span>
                    </div>
                    <div class="text-center my-auto text-xs">👾</div>
                    <div class="text-[7px] text-slate-300 text-center">HP: ${curHp}/${maxHp}</div>
                `;
            } else {
                slot.ondragover = handleDragOver;
                slot.ondrop = (e) => handleDrop(e, 'pcbox', realIndex);
                slot.className = "border border-dashed border-slate-700 rounded bg-slate-950/40 h-20 flex items-center justify-center text-slate-600 text-[9px]";
                slot.innerHTML = `<span>Livre</span>`;
            }
            container.appendChild(slot);
        }
    }
}

window.changePcBoxPage = function(direction) {
    const cp = getCurrentPlayer();
    const totalBoxes = cp.pcBox ? cp.pcBox.length : 0;
    const maxPages = Math.max(0, Math.ceil(totalBoxes / 12) - 1);
    
    gameState.pcBoxCurrentPage = (gameState.pcBoxCurrentPage || 0) + direction;
    if (gameState.pcBoxCurrentPage < 0) gameState.pcBoxCurrentPage = 0;
    if (gameState.pcBoxCurrentPage > maxPages) gameState.pcBoxCurrentPage = maxPages;
    renderBottomPanel();
};

// --- PASSAR A VEZ ---
function passTurnToNextPlayer() {
    gymAttemptedThisTurn = {};

    if (!gameState.players || !Array.isArray(gameState.players) || gameState.players.length <= 1) {
        if (typeof movementState !== 'undefined') {
            movementState.hasRolledThisTurn = false;
            movementState.isMoving = false;
        }
        showCustomPopup("🎲 Novo Turno", "Podes rolar o dado novamente para continuar a tua aventura a solo!", true);
        appendAdventureLog(`Novo turno iniciado para ${getCurrentPlayer().name}.`);
        return;
    }

    if (typeof movementState !== 'undefined') {
        movementState.hasRolledThisTurn = false;
        movementState.isMoving = false;
    }

    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    if (gameState.currentPlayerIndex === 0) {
        gameState.turn++;
    }

    const cp = getCurrentPlayer();
    
    if (typeof movementState !== 'undefined') {
        movementState.hasRolledThisTurn = false;
    }

    showCustomPopup("🔄 Mudança de Turno", `Agora é a vez do treinador:\n\n⭐ **${cp.name}** ⭐\n\nPrepare o dispositivo!`, true);
    
    initGameEngine();
    if (typeof moveTokenToWaypoint === 'function' && cp.currentZone) {
        moveTokenToWaypoint(cp.currentZone);
    }
    appendAdventureLog(`Turno passado para ${cp.name}.`);
}

function checkAndRenderPassTurnButton() {
    let btnContainer = document.getElementById('pass-turn-btn-container');
    if (!btnContainer) {
        const header = document.querySelector('header');
        if (header) {
            btnContainer = document.createElement('div');
            btnContainer.id = 'pass-turn-btn-container';
            header.appendChild(btnContainer);
        }
    }

    if (btnContainer) {
        const cp = getCurrentPlayer();
        const isSolo = (!gameState.players || !Array.isArray(gameState.players) || gameState.players.length <= 1);
        const buttonText = isSolo ? `🎲 Rolar / Novo Turno` : `🔄 Passar Vez (${cp.name})`;

        btnContainer.innerHTML = `
            <div class="flex items-center gap-2">
                <button onclick="rollDiceForMovement()" class="bg-amber-600 hover:bg-amber-500 text-black font-black px-3 py-2 rounded-xl text-xs shadow-lg flex items-center gap-1.5 border border-amber-300 animate-pulse cursor-pointer" title="Rolar o Dado para Mover">
                    <i class="fa-solid fa-dice-d20 text-sm"></i> Rolar Dado
                </button>
                <button onclick="passTurnToNextPlayer()" class="bg-purple-700 hover:bg-purple-600 text-white font-black px-3 py-2 rounded-xl text-xs shadow-lg border border-purple-400 cursor-pointer" title="Avançar Turno">
                    ${buttonText}
                </button>
            </div>
        `;
    }
}

function renderChatMessages() {
    const chatBox = document.getElementById('chat-messages-box');
    const lobbyChatBox = document.getElementById('lobby-chat-messages');
    
    const validMessages = (gameState && Array.isArray(gameState.chatMessages)) 
        ? gameState.chatMessages 
        : [{ sender: "Sistema", text: "Bem-vindo ao Pokémon Master Trainer HEX Edition!" }];

    let htmlContent = '';
    validMessages.forEach(msg => {
        htmlContent += `<p class="text-[9px] text-amber-300 my-0.5"><span class="font-bold text-amber-400">[${msg.sender || 'Sistema'}]:</span> ${msg.text || ''}</p>`;
    });

    if (chatBox) {
        chatBox.innerHTML = htmlContent;
        chatBox.scrollTop = chatBox.scrollHeight;
    }
    
    if (lobbyChatBox) {
        lobbyChatBox.innerHTML = htmlContent;
        lobbyChatBox.scrollTop = lobbyChatBox.scrollHeight;
    }
}

function updatePlayerUI() {
    const cp = getCurrentPlayer();
    const turnEl = document.getElementById('turn-counter');
    if (turnEl) turnEl.innerText = gameState.turn;

    const goldEl = document.getElementById('gold-counter');
    if (goldEl) goldEl.innerText = cp.gold;
    
    const badgeCount = Array.isArray(cp.badges) ? cp.badges.length : (typeof cp.badges === 'number' ? cp.badges : 0);
    const badgesEl = document.getElementById('badges-counter');
    if (badgesEl) badgesEl.innerText = `${badgeCount} / 6`;
    
    const avatarImg = document.getElementById('trainer-avatar-img');
    if (avatarImg) {
        avatarImg.src = `${SUPABASE_STORAGE_URL}player_0${cp.avatarId || 1}.png`;
    }

    const cardNameDisplay = document.getElementById('trainer-card-name-display');
    if (cardNameDisplay) {
        cardNameDisplay.innerText = cp.name;
    }
    
    const loc = document.getElementById('current-location');
    if (loc) {
        loc.innerText = (gameState.players && gameState.players.length > 1) ? `Vez de: ${cp.name} | Local: Zona #${cp.currentZone || 5}` : `Local: Zona #${cp.currentZone || 5}`;
    }
    checkAndRenderPassTurnButton();
}

function appendAdventureLog(text) {
    const box = document.getElementById('adventure-log-box');
    if (!box) return;
    const p = document.createElement('p');
    p.className = "text-[10px] text-slate-300 border-l-2 border-amber-500 pl-1 my-0.5";
    p.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;
    box.prepend(p);
}
// --- CONTROLO DE ZOOM DO MAPA ---
let currentMapZoom = 1.0;

window.zoomMap = function(action) {
    const wrapper = document.getElementById('map-zoom-wrapper');
    if (!wrapper) return;

    if (action === 'in') {
        currentMapZoom = Math.min(currentMapZoom + 0.15, 1.8);
    } else if (action === 'out') {
        currentMapZoom = Math.max(currentMapZoom - 0.15, 0.6);
    } else if (action === 'reset') {
        currentMapZoom = 1.0;
    }

    wrapper.style.transform = `scale(${currentMapZoom})`;
};

// --- BASE DE DADOS DOS LÍDERES DE GINÁSIO ---
const GYM_LEADERS_CATALOG = [
    { 
        city: "Pewter City", 
        leader: "Brock", 
        type: "Pedra", 
        badgeKey: "boulder",
        badgeName: "Insígnia da Rocha", 
        rewardGold: 300, 
        format: 1,
        pokemons: [
            { id: 'onix', name: "Onix", level: 3, str: 6, hp: 24, type: "Pedra/Terra", image: `${SUPABASE_STORAGE_URL}monsters/095.png` }
        ] 
    },
    { 
        city: "Cerulean City", 
        leader: "Misty", 
        type: "Água", 
        badgeKey: "cascade",
        badgeName: "Insígnia da Cascata", 
        rewardGold: 400, 
        format: 1,
        pokemons: [
            { id: 'starmie', name: "Starmie", level: 4, str: 7, hp: 28, type: "Água/Psíquico", image: `${SUPABASE_STORAGE_URL}monsters/121.png` }
        ] 
    },
    { 
        city: "Vermilion City", 
        leader: "Lt. Surge", 
        type: "Elétrico", 
        badgeKey: "thunder",
        badgeName: "Insígnia do Trovão", 
        rewardGold: 500, 
        format: 3,
        pokemons: [
            { id: 'voltorb', name: "Voltorb", level: 4, str: 7, hp: 26, type: "Elétrico", image: `${SUPABASE_STORAGE_URL}monsters/101.png` },
            { id: 'raichu', name: "Raichu", level: 5, str: 8, hp: 32, type: "Elétrico", image: `${SUPABASE_STORAGE_URL}monsters/026.png` }
        ] 
    },
    { 
        city: "Celadon City", 
        leader: "Erika", 
        type: "Grama", 
        badgeKey: "rainbow",
        badgeName: "Insígnia do Arco-Íris", 
        rewardGold: 600, 
        format: 3,
        pokemons: [
            { id: 'tangela', name: "Tangela", level: 5, str: 8, hp: 30, type: "Grama", image: `${SUPABASE_STORAGE_URL}monsters/114.png` },
            { id: 'vileplume', name: "Vileplume", level: 6, str: 9, hp: 36, type: "Grama/Veneno", image: `${SUPABASE_STORAGE_URL}monsters/045.png` }
        ] 
    },
    { 
        city: "Fuchsia City", 
        leader: "Koga", 
        type: "Veneno", 
        badgeKey: "soul",
        badgeName: "Insígnia da Alma", 
        rewardGold: 700, 
        format: 3,
        pokemons: [
            { id: 'koffing', name: "Koffing", level: 5, str: 8, hp: 30, type: "Veneno", image: `${SUPABASE_STORAGE_URL}monsters/109.png` },
            { id: 'weezing', name: "Weezing", level: 6, str: 9, hp: 38, type: "Veneno", image: `${SUPABASE_STORAGE_URL}monsters/110.png` }
        ] 
    },
    { 
        city: "Cinnabar Island", 
        leader: "Blaine", 
        type: "Fogo", 
        badgeKey: "volcano",
        badgeName: "Insígnia do Vulcão", 
        rewardGold: 850, 
        format: 3,
        pokemons: [
            { id: 'arcanine', name: "Arcanine", level: 6, str: 9, hp: 38, type: "Fogo", image: `${SUPABASE_STORAGE_URL}monsters/059.png` },
            { id: 'magmar', name: "Magmar", level: 6, str: 9, hp: 36, type: "Fogo", image: `${SUPABASE_STORAGE_URL}monsters/126.png` }
        ]
    },
    { 
        city: "Indigo Plateau", 
        leader: "Blue / Campeão", 
        type: "Variado", 
        badgeKey: "volcano",
        badgeName: "Insígnia da Liga", 
        rewardGold: 1000, 
        format: 3,
        pokemons: [
            { id: 'arcanine', name: "Arcanine", level: 6, str: 9, hp: 38, type: "Fogo", image: `${SUPABASE_STORAGE_URL}monsters/059.png` },
            { id: 'dragonite', name: "Dragonite", level: 7, str: 10, hp: 44, type: "Dragão/Voador", image: `${SUPABASE_STORAGE_URL}monsters/149.png` }
        ] 
    }
];

// --- SISTEMA DE POKÉDEX DO TREINADOR ---

window.openPokedexModal = function() {
    const cp = getCurrentPlayer();
    
    let capturedIds = new Set();
    if (cp.activeTeam) cp.activeTeam.forEach(m => capturedIds.add(m.id || m.name.toLowerCase()));
    if (cp.pcBox) cp.pcBox.forEach(m => capturedIds.add(m.id || m.name.toLowerCase()));

    let dexModal = document.getElementById('pokedex-modal');
    if (!dexModal) {
        dexModal = document.createElement('div');
        dexModal.id = 'pokedex-modal';
        dexModal.className = 'fixed inset-0 bg-black/90 z-[420] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(dexModal);
    }

    let gridHtml = '';
    if (typeof MONSTER_CATALOG !== 'undefined') {
        MONSTER_CATALOG.forEach((mon, index) => {
            const isCaptured = capturedIds.has(mon.id) || capturedIds.has(mon.name.toLowerCase());
            const dexNum = String(index + 1).padStart(3, '0');
            
            if (isCaptured) {
                gridHtml += `
                    <div onclick="openPokedexDetailCard('${mon.id}')" class="bg-gradient-to-b from-amber-950/80 to-black border-2 border-amber-500 rounded-2xl p-2.5 flex flex-col items-center justify-between cursor-pointer hover:scale-105 transition-all shadow-lg text-white">
                        <span class="text-[9px] font-bold text-amber-400">Nº ${dexNum}</span>
                        <img src="${mon.image}" class="w-12 h-12 object-contain drop-shadow" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                        <span class="text-[10px] font-black truncate w-full text-center">${mon.name}</span>
                    </div>
                `;
            } else {
                gridHtml += `
                    <div class="bg-black/40 border-2 border-slate-800 rounded-2xl p-2.5 flex flex-col items-center justify-between opacity-40 text-slate-600">
                        <span class="text-[9px] font-bold">Nº ${dexNum}</span>
                        <div class="w-12 h-12 flex items-center justify-center text-lg">❓</div>
                        <span class="text-[10px] font-bold truncate w-full text-center">Desconhecido</span>
                    </div>
                `;
            }
        });
    }

    dexModal.innerHTML = `
        <div class="trainer-card max-w-3xl w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <span class="text-xs font-black text-amber-400 font-cinzel">📖 POKÉDEX REGIONAL DE KANTO</span>
                <button onclick="document.getElementById('pokedex-modal').remove()" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800">✕ Fechar</button>
            </div>
            <div class="grid grid-cols-4 sm:grid-cols-6 gap-3 max-h-96 overflow-y-auto p-1">
                ${gridHtml}
            </div>
        </div>
    `;
    dexModal.classList.remove('hidden');
};

function getTypeEffectivenessInfo(typeString) {
    if (!typeString) return { strong: 'Nenhum', weak: 'Nenhum' };
    
    const primaryType = typeString.split('/')[0].trim().toLowerCase();
    
    const typeChart = {
        'fogo': { strong: 'Grama, Gelo, Inseto, Aço', weak: 'Água, Terra, Pedra' },
        'água': { strong: 'Fogo, Terra, Pedra', weak: 'Grama, Elétrico' },
        'grama': { strong: 'Água, Terra, Pedra', weak: 'Fogo, Gelo, Veneno, Voador, Inseto' },
        'elétrico': { strong: 'Água, Voador', weak: 'Terra' },
        'psíquico': { strong: 'Lutador, Veneno', weak: 'Inseto, Fantasma, Sombrio' },
        'gelo': { strong: 'Grama, Terra, Voador, Dragão', weak: 'Fogo, Lutador, Pedra, Aço' },
        'dragão': { strong: 'Dragão', weak: 'Gelo, Dragão, Fada' },
        'normal': { strong: 'Nenhum', weak: 'Lutador' },
        'lutador': { strong: 'Normal, Gelo, Pedra, Sombrio, Aço', weak: 'Voador, Psíquico, Fada' },
        'veneno': { strong: 'Grama, Fada', weak: 'Terra, Psíquico' },
        'terra': { strong: 'Fogo, Elétrico, Veneno, Pedra, Aço', weak: 'Água, Grama, Gelo' },
        'pedra': { strong: 'Fogo, Gelo, Voador, Inseto', weak: 'Água, Grama, Lutador, Terra, Aço' },
        'inseto': { strong: 'Grama, Psíquico, Sombrio', weak: 'Fogo, Voador, Pedra' },
        'fantasma': { strong: 'Psíquico, Fantasma', weak: 'Fantasma, Sombrio' },
        'aço': { strong: 'Gelo, Pedra, Fada', weak: 'Fogo, Lutador, Terra' }
    };

    return typeChart[primaryType] || { strong: 'Neutro', weak: 'Neutro' };
}

window.openPokedexDetailCard = function(monsterId) {
    if (typeof MONSTER_CATALOG === 'undefined') return;
    const baseMon = MONSTER_CATALOG.find(m => m.id === monsterId);
    if (!baseMon) return;

    const cp = getCurrentPlayer();
    let ownedMon = null;
    if (cp && cp.activeTeam) ownedMon = cp.activeTeam.find(m => (m.id === monsterId || m.name.toLowerCase() === baseMon.name.toLowerCase()));
    if (!ownedMon && cp && cp.pcBox) ownedMon = cp.pcBox.find(m => (m.id === monsterId || m.name.toLowerCase() === baseMon.name.toLowerCase()));

    const isShiny = ownedMon ? ownedMon.isShiny : false;
    const currentLevel = ownedMon ? (ownedMon.level || baseMon.level) : baseMon.level;
    const currentHp = ownedMon ? (ownedMon.maxHp || baseMon.hp) : baseMon.hp;
    const currentStr = ownedMon ? (ownedMon.str || baseMon.str) : baseMon.str;
    const monImage = (isShiny && baseMon.shinyImage) ? baseMon.shinyImage : baseMon.image;
    
    const typeInfo = getTypeEffectivenessInfo(baseMon.type);

    let detailModal = document.getElementById('pokedex-detail-modal');
    if (!detailModal) {
        detailModal = document.createElement('div');
        detailModal.id = 'pokedex-detail-modal';
        detailModal.className = 'fixed inset-0 bg-black/90 z-[450] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(detailModal);
    }

    const dexNumStr = String(baseMon.dexNumber || 1).padStart(3, '0');

    detailModal.innerHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 ${isShiny ? 'border-yellow-400 bg-gradient-to-b from-yellow-950/90 to-[#0a0705]' : 'border-amber-500 bg-gradient-to-b from-[#1c1410] to-[#0a0705]'} shadow-2xl text-white relative">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <span class="text-xs font-black text-amber-400 font-cinzel">📖 Nº ${dexNumStr} - ${baseMon.name} ${isShiny ? '✨ [SHINY]' : ''}</span>
                <button onclick="document.getElementById('pokedex-detail-modal').remove()" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800">✕</button>
            </div>

            <div class="flex flex-col items-center space-y-3">
                <div class="w-28 h-28 bg-black/60 border-2 ${isShiny ? 'border-yellow-400 shadow-[0_0_15px_rgba(255,215,0,0.5)]' : 'border-amber-600'} rounded-2xl flex items-center justify-center p-2 relative">
                    <img src="${monImage}" class="w-24 h-24 object-contain drop-shadow-xl" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    ${isShiny ? '<span class="absolute top-1 right-1 text-xs">✨</span>' : ''}
                </div>

                <div class="text-center">
                    <h3 class="text-base font-black text-amber-300">${baseMon.name}</h3>
                    <p class="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Tipo: ${baseMon.type} | Estágio: ${baseMon.stage || 'N/A'}</p>
                </div>

                <div class="grid grid-cols-2 gap-2 w-full bg-black/40 p-2.5 rounded-xl border border-amber-900/50 text-xs">
                    <div>❤ HP Base/Máx: <span class="font-bold text-emerald-400">${currentHp}</span></div>
                    <div>⚔ Força (STR): <span class="font-bold text-amber-400">${currentStr}</span></div>
                    <div>⭐ Raridade Tier: <span class="font-bold text-purple-400">${baseMon.rarity || 'Normal'}</span></div>
                    <div>📈 Nível: <span class="font-bold text-blue-400">Nv.${currentLevel}</span></div>
                </div>

                <div class="w-full bg-black/50 p-2.5 rounded-xl border border-amber-900/50 space-y-1 text-[10px]">
                    <div class="text-amber-400 font-bold border-b border-amber-900/40 pb-1">⚡ Bônus de Tipagem & Combate:</div>
                    <div>🟢 <span class="text-emerald-400 font-bold">Super Efetivo contra:</span> ${typeInfo.strong}</div>
                    <div>🔴 <span class="text-red-400 font-bold">Fraco contra:</span> ${typeInfo.weak}</div>
                </div>

                <div class="w-full text-center bg-amber-950/40 p-2 rounded-xl border border-amber-800/50 text-[10px] text-amber-200">
                    ${baseMon.evolvesTo ? `🔄 Evolui para: <span class="font-bold uppercase">${baseMon.evolvesTo}</span> (Nível ${baseMon.evolutionLevel || '?CH?'})` : '✨ Forma final de evolução!'}
                </div>
            </div>
        </div>
    `;
    detailModal.classList.remove('hidden');
};

// --- SISTEMA DE COFRE GLOBAL DE POKÉMON (VAULT / HERANÇA) ---

function saveMonsterToVault(uniqueId) {
    const cp = getCurrentPlayer();
    
    let monster = cp.activeTeam ? cp.activeTeam.find(m => m.uniqueId === uniqueId) : null;
    if (!monster && cp.pcBox) {
        monster = cp.pcBox.find(m => m.uniqueId === uniqueId);
    }
    
    if (!monster) {
        showCustomPopup("Erro", "Pokémon não encontrado para guardar no cofre.", false);
        return;
    }

    let vault = [];
    try {
        const rawVault = localStorage.getItem('pokemon_master_trainer_vault');
        if (rawVault) vault = JSON.parse(rawVault);
    } catch (e) {
        vault = [];
    }
    
    if (vault.some(m => m.uniqueId === monster.uniqueId)) {
        showCustomPopup("Aviso", "Este Pokémon já se encontra guardado no Cofre Global!", false);
        return;
    }

    const vaultMon = { ...monster, currentHp: monster.maxHp || monster.hp };
    vault.push(vaultMon);
    
    localStorage.setItem('pokemon_master_trainer_vault', JSON.stringify(vault));
    showCustomPopup("📦 Guardado no Cofre!", `O teu ${vaultMon.name} (Nv.${vaultMon.level || 1}) foi guardado com sucesso no Cofre Global! Podes resgatá-lo numa nova partida.`, true);
    appendAdventureLog(`Pokémon ${vaultMon.name} guardado no Cofre Global.`);
}

window.openVaultModal = function() {
    let vault = [];
    try {
        vault = JSON.parse(localStorage.getItem('pokemon_master_trainer_vault') || '[]');
    } catch (e) {
        vault = [];
    }

    let vaultModal = document.getElementById('vault-modal');
    if (!vaultModal) {
        vaultModal = document.createElement('div');
        vaultModal.id = 'vault-modal';
        vaultModal.className = 'fixed inset-0 bg-black/90 z-[430] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(vaultModal);
    }

    let listHtml = '';
    if (vault.length === 0) {
        listHtml = `<p class="text-xs text-slate-400 text-center col-span-full py-8">O cofre está vazio. Jogue, evolua e guarde os seus melhores Pokémon!</p>`;
    } else {
        vault.forEach((mon, index) => {
            const isShiny = mon.isShiny;
            const img = (isShiny && mon.shinyImage) ? mon.shinyImage : mon.image;
            listHtml += `
                <div class="bg-black/60 border-2 ${isShiny ? 'border-amber-400' : 'border-amber-700'} rounded-2xl p-3 flex flex-col justify-between items-center text-white space-y-2">
                    <span class="text-[10px] font-bold text-amber-300">${mon.name} ${isShiny ? '✨' : ''}</span>
                    <img src="${img}" class="w-12 h-12 object-contain" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    <div class="text-[9px] text-center text-slate-300">
                        Nv.${mon.level || 1} | STR: ${mon.str || 4}
                    </div>
                    <button onclick="withdrawMonsterFromVault(${index})" class="w-full bg-amber-600 hover:bg-amber-500 text-black font-black py-1 rounded text-[9px] uppercase shadow cursor-pointer">
                        Resgatar
                    </button>
                </div>
            `;
        });
    }

    vaultModal.innerHTML = `
        <div class="trainer-card max-w-2xl w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <span class="text-xs font-black text-amber-400 font-cinzel">📦 COFRE GLOBAL DE HERANÇA</span>
                <button onclick="document.getElementById('vault-modal').remove()" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800">✕ Fechar</button>
            </div>
            <div class="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-72 overflow-y-auto p-1">
                ${listHtml}
            </div>
        </div>
    `;
    vaultModal.classList.remove('hidden');
};

function withdrawMonsterFromVault(vaultIndex) {
    let vault = [];
    try {
        vault = JSON.parse(localStorage.getItem('pokemon_master_trainer_vault') || '[]');
    } catch (e) {
        vault = [];
    }

    const monToWithdraw = vault[vaultIndex];
    if (!monToWithdraw) return;

    const cp = getCurrentPlayer();
    if (!Array.isArray(cp.pcBox)) cp.pcBox = [];
    cp.pcBox.push(monToWithdraw);

    vault.splice(vaultIndex, 1);
    localStorage.setItem('pokemon_master_trainer_vault', JSON.stringify(vault));

    const modal = document.getElementById('vault-modal');
    if (modal) modal.remove();

    showCustomPopup("Resgatado!", `O ${monToWithdraw.name} foi transferido do cofre para a sua PC Box!`, true);
    renderBottomPanel();
}
// --- SISTEMA DE TROCAS E CONTAS ONLINE ---

(function () {
    'use strict';

    function getSocket() {
        try {
            return typeof socket !== 'undefined' && socket ? socket : null;
        } catch (error) {
            return null;
        }
    }

    function emitSocket(eventName, payload) {
        const currentSocket = getSocket();

        if (!currentSocket || typeof currentSocket.emit !== 'function') {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup(
                    'Conexão indisponível',
                    'Não foi possível conectar ao servidor online. Verifique a conexão e recarregue a página.',
                    false
                );
            }
            return false;
        }

        currentSocket.emit(eventName, payload);
        return true;
    }

    function escapeAccountHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizeEmail(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getAccountData(response) {
        if (!response || typeof response !== 'object') {
            return {};
        }

        const rawAccountData =
            response.accountData ??
            response.profile_data ??
            response.profileData ??
            response.account ??
            {};

        if (typeof rawAccountData === 'string') {
            try {
                const parsed = JSON.parse(rawAccountData);

                return parsed && typeof parsed === 'object'
                    ? parsed
                    : {};
            } catch (error) {
                console.warn(
                    'Não foi possível interpretar os dados da conta:',
                    error
                );

                return {};
            }
        }

        return rawAccountData &&
            typeof rawAccountData === 'object'
            ? rawAccountData
            : {};
    }

    function closeModalById(id) {
        const element = document.getElementById(id);
        if (element) element.remove();
    }

    function persistAfterChange() {
        try {
            if (typeof saveGameProgress === 'function') {
                saveGameProgress();
            }
        } catch (error) {
            console.warn('Não foi possível persistir a alteração:', error);
        }
    }

    function refreshGameInterface() {
        if (typeof ensureValidGameState === 'function') {
            ensureValidGameState();
        }

        if (typeof updatePlayerUI === 'function') {
            updatePlayerUI();
        }

        if (typeof renderTeamCardSlots === 'function') {
            renderTeamCardSlots();
        }

        if (typeof renderBottomPanel === 'function') {
            renderBottomPanel();
        }

        if (typeof renderBoardMap === 'function') {
            renderBoardMap();
        }
    }

    // --- SISTEMA DE TROCAS ---

    window.openTradeModal = function (playerAName, playerBName) {
        if (
            typeof gameState === 'undefined' ||
            !gameState ||
            !Array.isArray(gameState.players)
        ) {
            return;
        }

        const playerA = gameState.players.find(
            player => player && player.name === playerAName
        );

        const playerB = gameState.players.find(
            player => player && player.name === playerBName
        );

        if (!playerA || !playerB || playerA === playerB) {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup(
                    'Troca indisponível',
                    'Não foi possível localizar os dois treinadores para realizar a troca.',
                    false
                );
            }
            return;
        }

        if (!Array.isArray(playerA.activeTeam)) {
            playerA.activeTeam = [];
        }

        if (!Array.isArray(playerB.activeTeam)) {
            playerB.activeTeam = [];
        }

        let tradeModal = document.getElementById('trade-system-modal');

        if (!tradeModal) {
            tradeModal = document.createElement('div');
            tradeModal.id = 'trade-system-modal';
            tradeModal.className =
                'fixed inset-0 bg-black/90 z-[440] flex items-center justify-center p-4 backdrop-blur-md';
            document.body.appendChild(tradeModal);
        }

        const tradeState = {
            offeringGoldA: 0,
            offeringGoldB: 0,
            selectedMonIndexA: null,
            selectedMonIndexB: null
        };

        function renderTradeContent() {
            let teamOptionsA =
                '<option value="">-- Não oferecer Pokémon --</option>';

            playerA.activeTeam.forEach((monster, index) => {
                if (!monster) return;

                teamOptionsA += `
                    <option value="${index}">
                        ${escapeAccountHtml(monster.name || 'Anima')} 
                        (Nv.${Number(monster.level) || 1})
                    </option>
                `;
            });

            let teamOptionsB =
                '<option value="">-- Não oferecer Pokémon --</option>';

            playerB.activeTeam.forEach((monster, index) => {
                if (!monster) return;

                teamOptionsB += `
                    <option value="${index}">
                        ${escapeAccountHtml(monster.name || 'Anima')} 
                        (Nv.${Number(monster.level) || 1})
                    </option>
                `;
            });

            const safeNameA = escapeAccountHtml(playerA.name || 'Treinador A');
            const safeNameB = escapeAccountHtml(playerB.name || 'Treinador B');
            const goldA = Math.max(0, Number(playerA.gold) || 0);
            const goldB = Math.max(0, Number(playerB.gold) || 0);

            tradeModal.innerHTML = `
                <div class="trainer-card max-w-2xl w-full p-6 space-y-4 border-4 border-blue-500 rounded-3xl bg-gradient-to-b from-[#0f172a] to-[#020617] shadow-2xl text-white">
                    <div class="flex justify-between items-center border-b border-blue-900 pb-2">
                        <span class="text-xs font-black text-blue-400 font-cinzel">
                            🔄 CENTRO DE TROCAS DE KANTO
                        </span>

                        <button
                            type="button"
                            id="close-trade-modal-button"
                            class="text-blue-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-blue-800">
                            ✕ Fechar
                        </button>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="bg-black/50 p-3 rounded-2xl border border-blue-900/60 space-y-3">
                            <p class="text-xs font-bold text-amber-300 text-center">
                                ${safeNameA}
                            </p>

                            <p class="text-[10px] text-slate-400 text-center">
                                Ouro disponível: ${goldA} 🪙
                            </p>

                            <div class="space-y-1">
                                <label class="text-[9px] text-slate-300 font-bold">
                                    Oferecer Anima:
                                </label>

                                <select
                                    id="trade-select-mon-a"
                                    class="w-full bg-slate-900 border border-blue-900 rounded p-1.5 text-[10px] text-white">
                                    ${teamOptionsA}
                                </select>
                            </div>

                            <div class="space-y-1">
                                <label class="text-[9px] text-slate-300 font-bold">
                                    Oferecer Ouro:
                                </label>

                                <input
                                    type="number"
                                    id="trade-gold-a"
                                    value="0"
                                    min="0"
                                    max="${goldA}"
                                    class="w-full bg-slate-900 border border-blue-900 rounded p-1 text-[10px] text-white">
                            </div>
                        </div>

                        <div class="bg-black/50 p-3 rounded-2xl border border-blue-900/60 space-y-3">
                            <p class="text-xs font-bold text-amber-300 text-center">
                                ${safeNameB}
                            </p>

                            <p class="text-[10px] text-slate-400 text-center">
                                Ouro disponível: ${goldB} 🪙
                            </p>

                            <div class="space-y-1">
                                <label class="text-[9px] text-slate-300 font-bold">
                                    Oferecer Anima:
                                </label>

                                <select
                                    id="trade-select-mon-b"
                                    class="w-full bg-slate-900 border border-blue-900 rounded p-1.5 text-[10px] text-white">
                                    ${teamOptionsB}
                                </select>
                            </div>

                            <div class="space-y-1">
                                <label class="text-[9px] text-slate-300 font-bold">
                                    Oferecer Ouro:
                                </label>

                                <input
                                    type="number"
                                    id="trade-gold-b"
                                    value="0"
                                    min="0"
                                    max="${goldB}"
                                    class="w-full bg-slate-900 border border-blue-900 rounded p-1 text-[10px] text-white">
                            </div>
                        </div>
                    </div>

                    <p class="text-[10px] text-slate-400 text-center">
                        Pokémon retirados de uma equipe cheia serão enviados automaticamente para a PC Box.
                    </p>

                    <button
                        type="button"
                        id="execute-player-trade-button"
                        class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-xl text-xs uppercase shadow tracking-wider cursor-pointer transition-all">
                        🤝 Efetivar Troca entre Treinadores
                    </button>
                </div>
            `;

            const selectA = document.getElementById('trade-select-mon-a');
            const selectB = document.getElementById('trade-select-mon-b');
            const goldInputA = document.getElementById('trade-gold-a');
            const goldInputB = document.getElementById('trade-gold-b');
            const closeButton = document.getElementById('close-trade-modal-button');
            const executeButton = document.getElementById(
                'execute-player-trade-button'
            );

            if (selectA) {
                selectA.addEventListener('change', event => {
                    tradeState.selectedMonIndexA =
                        event.target.value === ''
                            ? null
                            : Number(event.target.value);
                });
            }

            if (selectB) {
                selectB.addEventListener('change', event => {
                    tradeState.selectedMonIndexB =
                        event.target.value === ''
                            ? null
                            : Number(event.target.value);
                });
            }

            if (goldInputA) {
                goldInputA.addEventListener('input', event => {
                    tradeState.offeringGoldA = Math.max(
                        0,
                        Math.floor(Number(event.target.value) || 0)
                    );
                });
            }

            if (goldInputB) {
                goldInputB.addEventListener('input', event => {
                    tradeState.offeringGoldB = Math.max(
                        0,
                        Math.floor(Number(event.target.value) || 0)
                    );
                });
            }

            if (closeButton) {
                closeButton.addEventListener('click', () => {
                    closeModalById('trade-system-modal');
                });
            }

            if (executeButton) {
                executeButton.addEventListener('click', () => {
                    window.executePlayerTrade(
                        playerA.name,
                        playerB.name,
                        tradeState
                    );
                });
            }
        }

        window._updateTradeSelection = function (field, value) {
            if (field === 'monA') {
                tradeState.selectedMonIndexA =
                    value === '' ? null : Number(value);
            }

            if (field === 'monB') {
                tradeState.selectedMonIndexB =
                    value === '' ? null : Number(value);
            }

            if (field === 'goldA') {
                tradeState.offeringGoldA = Math.max(
                    0,
                    Math.floor(Number(value) || 0)
                );
            }

            if (field === 'goldB') {
                tradeState.offeringGoldB = Math.max(
                    0,
                    Math.floor(Number(value) || 0)
                );
            }
        };

        window.executePlayerTrade = function (
            nameA,
            nameB,
            providedTradeState = null
        ) {
            const currentPlayerA = gameState.players.find(
                player => player && player.name === nameA
            );

            const currentPlayerB = gameState.players.find(
                player => player && player.name === nameB
            );

            if (!currentPlayerA || !currentPlayerB) {
                return;
            }

            const state = providedTradeState || tradeState;

            const goldA = Math.max(
                0,
                Math.floor(Number(state.offeringGoldA) || 0)
            );

            const goldB = Math.max(
                0,
                Math.floor(Number(state.offeringGoldB) || 0)
            );

            const playerAGold = Math.max(
                0,
                Math.floor(Number(currentPlayerA.gold) || 0)
            );

            const playerBGold = Math.max(
                0,
                Math.floor(Number(currentPlayerB.gold) || 0)
            );

            if (goldA > playerAGold || goldB > playerBGold) {
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup(
                        'Erro na Troca',
                        'Um dos jogadores não possui ouro suficiente para esta oferta.',
                        false
                    );
                }
                return;
            }

            if (!Array.isArray(currentPlayerA.activeTeam)) {
                currentPlayerA.activeTeam = [];
            }

            if (!Array.isArray(currentPlayerB.activeTeam)) {
                currentPlayerB.activeTeam = [];
            }

            if (!Array.isArray(currentPlayerA.pcBox)) {
                currentPlayerA.pcBox = [];
            }

            if (!Array.isArray(currentPlayerB.pcBox)) {
                currentPlayerB.pcBox = [];
            }

            const indexA =
                state.selectedMonIndexA === null ||
                state.selectedMonIndexA === undefined
                    ? null
                    : Number(state.selectedMonIndexA);

            const indexB =
                state.selectedMonIndexB === null ||
                state.selectedMonIndexB === undefined
                    ? null
                    : Number(state.selectedMonIndexB);

            const monsterA =
                Number.isInteger(indexA) &&
                indexA >= 0 &&
                indexA < currentPlayerA.activeTeam.length
                    ? currentPlayerA.activeTeam[indexA]
                    : null;

            const monsterB =
                Number.isInteger(indexB) &&
                indexB >= 0 &&
                indexB < currentPlayerB.activeTeam.length
                    ? currentPlayerB.activeTeam[indexB]
                    : null;

            if (
                !monsterA &&
                !monsterB &&
                goldA === 0 &&
                goldB === 0
            ) {
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup(
                        'Troca vazia',
                        'Selecione um Pokémon ou informe uma quantia de ouro antes de efetivar a troca.',
                        false
                    );
                }

                return;
            }

            if (monsterA && monsterB && currentPlayerA === currentPlayerB) {
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup(
                        'Troca indisponível',
                        'Os treinadores da troca precisam ser diferentes.',
                        false
                    );
                }

                return;
            }

            if (monsterA) {
                currentPlayerA.activeTeam.splice(indexA, 1);
            }

            if (monsterB) {
                currentPlayerB.activeTeam.splice(indexB, 1);
            }

            if (monsterA) {
                if (currentPlayerB.activeTeam.length < 6) {
                    currentPlayerB.activeTeam.push(monsterA);
                } else {
                    currentPlayerB.pcBox.push(monsterA);
                }
            }

            if (monsterB) {
                if (currentPlayerA.activeTeam.length < 6) {
                    currentPlayerA.activeTeam.push(monsterB);
                } else {
                    currentPlayerA.pcBox.push(monsterB);
                }
            }

            currentPlayerA.gold = playerAGold - goldA + goldB;
            currentPlayerB.gold = playerBGold - goldB + goldA;

            closeModalById('trade-system-modal');
            refreshGameInterface();
            persistAfterChange();

            if (typeof showCustomPopup === 'function') {
                const safeTradeNameA = escapeAccountHtml(
                    currentPlayerA.name || 'Treinador A'
                );

                const safeTradeNameB = escapeAccountHtml(
                    currentPlayerB.name || 'Treinador B'
                );

                showCustomPopup(
                    '🔄 Troca concluída',
                    `A troca entre ${safeTradeNameA} e ${safeTradeNameB} foi concluída com sucesso.`,
                    true
                );
            }

            if (typeof appendAdventureLog === 'function') {
                appendAdventureLog(
                    `Troca efetuada entre ${currentPlayerA.name} e ${currentPlayerB.name}.`
                );
            }
        };

        renderTradeContent();
        tradeModal.classList.remove('hidden');
    };

    // --- LOGIN E REGISTRO ---

    window.handleAccountLoginOrRegister = function () {
        const emailElement = document.getElementById('auth-email-input');
        const passwordElement = document.getElementById(
            'auth-password-input'
        );

        const email = normalizeEmail(emailElement?.value);
        const password = String(passwordElement?.value || '').trim();

        if (!email || !email.includes('@')) {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup(
                    'Erro de acesso',
                    'Digite um endereço de e-mail válido.',
                    false
                );
            }
            emailElement?.focus();
            return;
        }

        if (password.length < 6) {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup(
                    'Erro de acesso',
                    'A senha deve possuir pelo menos 6 caracteres.',
                    false
                );
            }
            passwordElement?.focus();
            return;
        }

        if (typeof currentAuthenticatedAccount !== 'undefined') {
            currentAuthenticatedAccount = email;
        }

        const sent = emitSocket('login_request', {
            email,
            password
        });

        if (!sent) return;

        const button = document.querySelector(
            '#auth-container button[onclick*="handleAccountLoginOrRegister"]'
        );

        if (button) {
            button.disabled = true;
            button.dataset.originalText = button.innerHTML;
            button.innerHTML = 'Conectando...';
        }

        setTimeout(() => {
            if (button && button.disabled) {
                button.disabled = false;
                button.innerHTML =
                    button.dataset.originalText || 'Entrar na Conta';
            }
        }, 10000);
    };

    function handleLoginResponse(response) {
        const loginButton = document.querySelector(
            '#auth-container button[onclick*="handleAccountLoginOrRegister"]'
        );

        if (loginButton) {
            loginButton.disabled = false;
            loginButton.innerHTML =
                loginButton.dataset.originalText || 'Entrar na Conta';
        }

        if (!response || response.success !== true) {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup(
                    'Erro de autenticação',
                    escapeAccountHtml(
                        response?.message ||
                            'Não foi possível entrar na conta.'
                    ),
                    false
                );
            }
            return;
        }

        const accountData = getAccountData(response);

        if (
            typeof currentAuthenticatedAccount !== 'undefined' &&
            (!currentAuthenticatedAccount || response.email)
        ) {
            currentAuthenticatedAccount = normalizeEmail(
                response.email ||
                    accountData.email ||
                    currentAuthenticatedAccount
            );
        }

        if (response.isNew || response.newAccount || response.created) {
            const authContainer = document.getElementById('auth-container');
            const characterCreation = document.getElementById(
                'character-creation-container'
            );

            if (authContainer) {
                authContainer.classList.add('hidden');
            }

            if (characterCreation) {
                characterCreation.classList.remove('hidden');
            }

            if (typeof showCustomPopup === 'function') {
                showCustomPopup(
                    'Conta criada',
                    'A conta foi autenticada. Agora configure o seu treinador.',
                    true
                );
            }

            return;
        }

        const remoteGameState =
            accountData.gameState ||
            accountData.game_state ||
            response.gameState ||
            response.game_state;

        const remoteBoard =
            accountData.boardPokemonCards ||
            accountData.board_pokemon_cards ||
            response.boardPokemonCards ||
            response.board_pokemon_cards;

        if (
            remoteGameState &&
            typeof remoteGameState === 'object' &&
            Array.isArray(remoteGameState.players)
        ) {
            if (typeof gameState !== 'undefined') {
                gameState = remoteGameState;
            }
        } else if (typeof gameState !== 'undefined') {
            const trainerName =
                accountData.trainerName ||
                accountData.trainer_name ||
                accountData.name ||
                'Treinador';

            gameState.players = [
                {
                    name: trainerName,
                    avatarId: Number(accountData.avatarId) || 1,
                    currentZone: 5,
                    level: 1,
                    gold: Number(accountData.gold) || 350,
                    badges: [],
                    activeTeam: [],
                    pcBox: [],
                    inventory: [],
                    equipmentSlots: [null, null]
                }
            ];

            gameState.currentPlayerIndex = 0;
            gameState.turn = 1;
        }

        if (
            typeof boardPokemonCards !== 'undefined' &&
            remoteBoard &&
            typeof remoteBoard === 'object'
        ) {
            boardPokemonCards = remoteBoard;
        }

        if (typeof ensureValidGameState === 'function') {
            ensureValidGameState();
        }

        if (typeof showPostLoginDashboard === 'function') {
            showPostLoginDashboard();
        }
    }

    const accountSocket = getSocket();

    if (accountSocket && typeof accountSocket.on === 'function') {
        accountSocket.on('login_response', handleLoginResponse);
    }

    // --- PAINEL PÓS-LOGIN ---

    window.showPostLoginDashboard = function () {
        if (typeof ensureValidGameState === 'function') {
            ensureValidGameState();
        }

        const authContainer = document.getElementById('auth-container');

        if (authContainer) {
            authContainer.classList.add('hidden');
        }

        let dashboard = document.getElementById('post-login-dashboard');

        if (!dashboard) {
            dashboard = document.createElement('div');
            dashboard.id = 'post-login-dashboard';
            dashboard.className =
                'fixed inset-0 bg-[#020617] z-[300] flex items-center justify-center p-4 backdrop-blur-md';
            document.body.appendChild(dashboard);
        }

        const currentPlayer =
            typeof getCurrentPlayer === 'function'
                ? getCurrentPlayer()
                : null;

        if (!currentPlayer) return;

        const trainerName = escapeAccountHtml(
            currentPlayer.name || 'Treinador'
        );

        const avatarId = Math.max(
            1,
            Math.min(8, Number(currentPlayer.avatarId) || 1)
        );

        const avatarBase =
            typeof SUPABASE_STORAGE_URL !== 'undefined'
                ? SUPABASE_STORAGE_URL
                : '';

        dashboard.innerHTML = `
            <div class="trainer-card max-w-md w-full p-6 space-y-5 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white text-center">
                <h2 class="text-base font-black text-amber-400 font-cinzel tracking-wider">
                    SESSÃO AUTENTICADA
                </h2>

                <p class="text-xs text-slate-300">
                    Bem-vindo de volta ao
                    <strong class="text-amber-300">Master Trainer HEX</strong>.
                </p>

                <div class="bg-black/70 border-2 border-amber-600/80 p-4 rounded-2xl flex items-center gap-4 text-left shadow-inner">
                    <img
                        src="${avatarBase}player_0${avatarId}.png"
                        class="w-16 h-16 object-contain"
                        alt="Avatar de ${trainerName}"
                        onerror="this.onerror=null;this.src='https://api.iconify.design/noto:boy.svg'">

                    <div>
                        <h3 class="text-sm font-black text-amber-300">
                            ${trainerName}
                        </h3>

                        <p class="text-[10px] text-slate-300">
                            Ouro:
                            <strong class="text-yellow-400">
                                ${Math.max(0, Number(currentPlayer.gold) || 0)} 🪙
                            </strong>
                        </p>

                        <p class="text-[10px] text-slate-300">
                            Zona atual:
                            <strong class="text-blue-400">
                                #${Number(currentPlayer.currentZone) || 5}
                            </strong>
                        </p>
                    </div>
                </div>

                <div class="space-y-3 pt-2">
                    <button
                        type="button"
                        onclick="resumeSavedGameFromDashboard()"
                        class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg transition-all cursor-pointer">
                        ▶ Continuar Partida Salva
                    </button>

                    <button
                        type="button"
                        onclick="openNewGameSetupFromDashboard()"
                        class="w-full bg-amber-600 hover:bg-amber-500 text-black font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg transition-all cursor-pointer">
                        ✨ Nova Partida
                    </button>

                    <button
                        type="button"
                        onclick="openVaultModal()"
                        class="w-full bg-purple-600 hover:bg-purple-500 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg transition-all cursor-pointer">
                        📦 Abrir Cofre Global
                    </button>
                </div>
            </div>
        `;

        dashboard.classList.remove('hidden');
    };

    window.resumeSavedGameFromDashboard = function () {
        closeModalById('post-login-dashboard');

        const setupScreen = document.getElementById('setup-screen');
        const mainLayout = document.getElementById('main-game-layout');

        if (setupScreen) {
            setupScreen.classList.add('hidden');
        }

        if (mainLayout) {
            mainLayout.classList.remove('hidden');
        }

        refreshGameInterface();
    };

    window.openNewGameSetupFromDashboard = function () {
        closeModalById('post-login-dashboard');

        const setupScreen = document.getElementById('setup-screen');
        const authContainer = document.getElementById('auth-container');
        const mainMenu = document.getElementById('trainer-main-menu');
        const characterCreation = document.getElementById(
            'character-creation-container'
        );

        if (setupScreen) {
            setupScreen.classList.remove('hidden');
        }

        if (authContainer) {
            authContainer.classList.add('hidden');
        }

        if (mainMenu) {
            mainMenu.classList.add('hidden');
        }

        if (characterCreation) {
            characterCreation.classList.remove('hidden');
        }

        if (typeof showCustomPopup === 'function') {
            showCustomPopup(
                'Nova partida',
                'Configure o novo treinador. O Cofre Global permanece disponível.',
                true
            );
        }
    };

    // --- LOBBY ONLINE ---

    window.createOnlineRoom = function () {
        const roomName = window.prompt(
            'Insira o nome da sala online:',
            'Sala de Kanto'
        );

        if (!roomName || !roomName.trim()) {
            return;
        }

        emitSocket('create_room', {
            roomName: roomName.trim(),
            host:
                typeof currentAuthenticatedAccount !== 'undefined' &&
                currentAuthenticatedAccount
                    ? currentAuthenticatedAccount
                    : 'Treinador'
        });
    };

    window.searchOnlineRooms = function () {
        if (emitSocket('get_rooms_list')) {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup(
                    'Procurando salas',
                    'Buscando salas online disponíveis.',
                    true
                );
            }
        }
    };

    window.refreshRoomsList = function () {
        if (emitSocket('get_rooms_list')) {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup(
                    'Salas atualizadas',
                    'A lista de salas foi solicitada ao servidor.',
                    true
                );
            }
        }
    };

    window.sendLobbyChatMessage = function () {
        const input = document.getElementById('lobby-chat-input');

        if (!input || !input.value.trim()) {
            return;
        }

        emitSocket('lobby_chat_message', {
            message: input.value.trim(),
            sender:
                typeof currentAuthenticatedAccount !== 'undefined' &&
                currentAuthenticatedAccount
                    ? currentAuthenticatedAccount
                    : 'Treinador'
        });

        input.value = '';
    };

    window.joinAndStartOnlineGame = function () {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup(
                'Modo online',
                'Selecione uma sala disponível para entrar na partida.',
                true
            );
        }
    };

    function renderRoomsList(rooms) {
        const container =
            document.getElementById('rooms-list-box') ||
            document.getElementById('online-rooms-list-container');

        if (!container) {
            return;
        }

        if (!Array.isArray(rooms) || rooms.length === 0) {
            container.innerHTML = `
                <p class="text-[10px] text-slate-500 text-center py-6">
                    Nenhuma sala encontrada. Crie uma sala para começar.
                </p>
            `;
            return;
        }

        container.innerHTML = rooms
            .map((room, index) => {
                const roomId = escapeAccountHtml(
                    room?.id || room?.roomId || `room-${index}`
                );

                const roomName = escapeAccountHtml(
                    room?.name || room?.roomName || 'Sala sem nome'
                );

                const host = escapeAccountHtml(
                    room?.host || 'Treinador'
                );

                const playerCount = Number(
                    room?.playerCount ?? room?.players?.length ?? 0
                );

                const maxPlayers = Number(room?.maxPlayers) || 4;

                return `
                    <div class="flex justify-between items-center gap-2 bg-black/60 p-2.5 rounded-xl border border-amber-600/50 text-white text-[10px] my-1">
                        <div class="min-w-0">
                            <p class="font-bold text-amber-300 truncate">
                                ${roomName}
                            </p>

                            <p class="text-slate-400 truncate">
                                Host: ${host} · ${playerCount}/${maxPlayers}
                            </p>
                        </div>

                        <button
                            type="button"
                            data-room-id="${roomId}"
                            class="join-online-room-button bg-amber-600 hover:bg-amber-500 text-black font-bold px-3 py-1 rounded cursor-pointer whitespace-nowrap">
                            Entrar
                        </button>
                    </div>
                `;
            })
            .join('');

        container
            .querySelectorAll('.join-online-room-button')
            .forEach(button => {
                button.addEventListener('click', () => {
                    const roomId = button.getAttribute('data-room-id');

                    if (roomId) {
                        emitSocket('join_room', { roomId });
                    }
                });
            });
    }

    if (
        accountSocket &&
        typeof accountSocket.on === 'function'
    ) {
        accountSocket.on('rooms_list_response', renderRoomsList);
        accountSocket.on('rooms_list', renderRoomsList);

        accountSocket.on('room_created', () => {
            if (typeof refreshRoomsList === 'function') {
                refreshRoomsList();
            }
        });

        accountSocket.on('room_joined', roomData => {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup(
                    'Sala online',
                    `Você entrou na sala ${roomData?.roomName || 'selecionada'}.`,
                    true
                );
            }
        });

        accountSocket.on('lobby_error', message => {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup(
                    'Erro no lobby',
                    escapeAccountHtml(
                        message ||
                            'Não foi possível concluir a ação na sala.'
                    ),
                    false
                );
            }
        });
    }

    // --- CRIAÇÃO DE PERSONAGEM ---

    window.finalizeCharacterCreation = function () {
        const nameInput = document.getElementById('setup-trainer-name');

        const trainerName =
            nameInput && nameInput.value.trim()
                ? nameInput.value.trim()
                : 'Treinador';

        if (typeof setupConfig !== 'undefined') {
            setupConfig.mode = 'solo';
        }

        if (typeof startMainGame === 'function') {
            startMainGame();
        } else {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup(
                    'Erro',
                    'A função de inicialização da partida não foi carregada.',
                    false
                );
            }
            return;
        }

        persistAfterChange();

        if (typeof showCustomPopup === 'function') {
            showCustomPopup(
                'Personagem criado',
                `Parabéns, ${trainerName}! A sua jornada foi inicializada.`,
                true
            );
        }
    };

    // --- PAINEL ADMINISTRATIVO ---

    let adminUsersListenerRegistered = false;

    function handleAdminUsersList(users) {
        const modal = document.getElementById('admin-panel-modal');

        if (modal) {
            renderAdminDashboard(modal, users);
        }
    }

    window.openAdminPanelModal = function () {
        const password = window.prompt(
            '🔐 Insira a senha de Administrador:',
            ''
        );

        if (password === null) {
            return;
        }

        if (password !== 'admin123' && password !== 'pokemonadmin') {
            window.alert('❌ Senha incorreta!');
            return;
        }

        let adminModal = document.getElementById('admin-panel-modal');

        if (!adminModal) {
            adminModal = document.createElement('div');
            adminModal.id = 'admin-panel-modal';
            adminModal.className =
                'fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 backdrop-blur-md';
            document.body.appendChild(adminModal);
        }

        adminModal.innerHTML = `
            <div class="trainer-card max-w-4xl w-full p-6 border-4 border-red-600 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white text-center">
                <p class="text-sm text-red-300 font-black">
                    Carregando contas...
                </p>
            </div>
        `;

        if (
            accountSocket &&
            typeof accountSocket.on === 'function' &&
            !adminUsersListenerRegistered
        ) {
            accountSocket.on('admin_users_list', handleAdminUsersList);
            adminUsersListenerRegistered = true;
        }

        emitSocket('admin_get_users');
    };

    function renderAdminDashboard(modalElement, users) {
        const safeUsers = Array.isArray(users) ? users : [];

        const rowsHtml =
            safeUsers.length === 0
                ? `
                    <tr>
                        <td colspan="5" class="text-center py-4 text-slate-400">
                            Nenhuma conta encontrada.
                        </td>
                    </tr>
                `
                : safeUsers
                      .map(user => {
                          const email = escapeAccountHtml(
                              user?.email || ''
                          );

                          const trainerName = escapeAccountHtml(
                              user?.trainerName ||
                                  user?.trainer_name ||
                                  user?.name ||
                                  'N/D'
                          );

                          const lastLogin = user?.lastLogin
                              ? escapeAccountHtml(
                                    new Date(
                                        user.lastLogin
                                    ).toLocaleString('pt-BR')
                                )
                              : 'Nunca';

                          const gold = Number(
                              user?.gold ||
                                  user?.profile_data?.gold ||
                                  0
                          );

                          return `
                            <tr class="border-b border-red-900/40 text-[10px] hover:bg-red-950/20">
                                <td class="p-2 font-bold text-amber-300">
                                    ${email}
                                </td>

                                <td class="p-2 text-slate-300">
                                    ${trainerName}
                                </td>

                                <td class="p-2 text-slate-400">
                                    ${lastLogin}
                                </td>

                                <td class="p-2 text-yellow-400 font-bold">
                                    ${gold} 🪙
                                </td>

                                <td class="p-2">
                                    <div class="flex gap-1 justify-end flex-wrap">
                                        <button
                                            type="button"
                                            data-admin-action="gold"
                                            data-admin-email="${email}"
                                            class="bg-amber-600 hover:bg-amber-500 text-black px-2 py-1 rounded font-bold cursor-pointer">
                                            🪙 Ouro
                                        </button>

                                        <button
                                            type="button"
                                            data-admin-action="password"
                                            data-admin-email="${email}"
                                            class="bg-blue-700 hover:bg-blue-600 text-white px-2 py-1 rounded font-bold cursor-pointer">
                                            🔑 Senha
                                        </button>

                                        <button
                                            type="button"
                                            data-admin-action="delete"
                                            data-admin-email="${email}"
                                            class="bg-red-700 hover:bg-red-600 text-white px-2 py-1 rounded font-bold cursor-pointer">
                                            🗑️ Apagar
                                        </button>
                                    </div>
                                </td>
                            </tr>
                          `;
                      })
                      .join('');

        modalElement.innerHTML = `
            <div class="trainer-card max-w-4xl w-full p-6 space-y-4 border-4 border-red-600 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
                <div class="flex justify-between items-center border-b border-red-900 pb-2">
                    <span class="text-xs font-black text-red-400 font-cinzel">
                        <i class="fa-solid fa-shield-halved"></i>
                        PAINEL DO ADMINISTRADOR
                    </span>

                    <button
                        type="button"
                        id="close-admin-panel-button"
                        class="text-red-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-red-800">
                        ✕ Fechar
                    </button>
                </div>

                <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-slate-300">
                        Total de contas:
                        <span class="text-amber-400">${safeUsers.length}</span>
                    </span>

                    <button
                        type="button"
                        id="refresh-admin-users-button"
                        class="bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1 rounded border border-red-700 cursor-pointer">
                        🔄 Atualizar
                    </button>
                </div>

                <div class="max-h-96 overflow-y-auto border border-red-900/60 rounded-xl bg-black/60 p-2">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-red-900 text-[10px] text-red-300 uppercase">
                                <th class="p-2">E-mail</th>
                                <th class="p-2">Treinador</th>
                                <th class="p-2">Último Login</th>
                                <th class="p-2">Ouro</th>
                                <th class="p-2 text-right">Ações</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        modalElement.classList.remove('hidden');

        document
            .getElementById('close-admin-panel-button')
            ?.addEventListener('click', () => {
                closeModalById('admin-panel-modal');
            });

        document
            .getElementById('refresh-admin-users-button')
            ?.addEventListener('click', () => {
                emitSocket('admin_get_users');
            });

        modalElement
            .querySelectorAll('[data-admin-action]')
            .forEach(button => {
                button.addEventListener('click', () => {
                    const action = button.dataset.adminAction;
                    const email = button.dataset.adminEmail;

                    if (action === 'gold') {
                        window.adminGiveGold(email);
                    }

                    if (action === 'password') {
                        window.adminResetPassword(email);
                    }

                    if (action === 'delete') {
                        window.adminDeleteAccount(email);
                    }
                });
            });
    }

    window.adminGiveGold = function (email) {
        const amountText = window.prompt(
            `Quantas moedas deseja adicionar à conta ${email}?`,
            '1000'
        );

        const amount = Math.floor(Number(amountText) || 0);

        if (amount <= 0) {
            return;
        }

        emitSocket('admin_action', {
            action: 'give_gold',
            email,
            amount
        });

        window.setTimeout(() => {
            emitSocket('admin_get_users');
        }, 500);
    };

    window.adminResetPassword = function (email) {
        const newPassword = window.prompt(
            `Insira a nova senha temporária para ${email}:`,
            ''
        );

        if (!newPassword || newPassword.length < 6) {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup(
                    'Senha inválida',
                    'A nova senha deve possuir pelo menos 6 caracteres.',
                    false
                );
            }
            return;
        }

        emitSocket('admin_action', {
            action: 'reset_password',
            email,
            newPass: newPassword,
            newPassword
        });
    };

    window.adminDeleteAccount = function (email) {
        const confirmed = window.confirm(
            `Tem certeza de que deseja apagar permanentemente a conta ${email}?`
        );

        if (!confirmed) {
            return;
        }

        emitSocket('admin_action', {
            action: 'delete_account',
            email
        });

        window.setTimeout(() => {
            emitSocket('admin_get_users');
        }, 500);
    };

    // --- NAVEGAÇÃO DO HUB ---

    window.resumeSavedGame = function () {
        if (typeof loadGameProgress === 'function') {
            loadGameProgress();
        }
    };

    window.openCharacterCreationMode = function () {
        const authContainer = document.getElementById('auth-container');
        const mainMenu = document.getElementById('trainer-main-menu');
        const characterCreation = document.getElementById(
            'character-creation-container'
        );

        authContainer?.classList.add('hidden');
        mainMenu?.classList.add('hidden');
        characterCreation?.classList.remove('hidden');
    };

    window.showOnlineLobbyView = function () {
        const authContainer = document.getElementById('auth-container');
        const mainMenu = document.getElementById('trainer-main-menu');
        const onlineLobby = document.getElementById(
            'online-lobby-container'
        );

        authContainer?.classList.add('hidden');
        mainMenu?.classList.add('hidden');
        onlineLobby?.classList.remove('hidden');

        emitSocket('get_rooms_list');
    };

    window.backToMainMenu = function () {
        const characterCreation = document.getElementById(
            'character-creation-container'
        );

        const onlineLobby = document.getElementById(
            'online-lobby-container'
        );

        const mainMenu = document.getElementById('trainer-main-menu');
        const authContainer = document.getElementById('auth-container');

        characterCreation?.classList.add('hidden');
        onlineLobby?.classList.add('hidden');
        authContainer?.classList.add('hidden');
        mainMenu?.classList.remove('hidden');
    };
})();
