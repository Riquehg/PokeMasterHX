// --- MOTOR DO JOGO DIGITAL: POKÉMON MASTER TRAINER (HEX Edition) ---

if (typeof SUPABASE_STORAGE_URL === 'undefined') {
    var SUPABASE_STORAGE_URL = "https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/";
}

const socket = io('https://pokemasterhx.onrender.com');

let currentAuthenticatedAccount = null;

socket.on('sync_game_state', (remoteData) => {
    if (!remoteData || typeof remoteData !== 'object') return;

    if (remoteData.gameState && typeof remoteData.gameState === 'object') {
        gameState = remoteData.gameState;
        ensureValidGameState();
    }

    if (
        remoteData.boardPokemonCards &&
        typeof remoteData.boardPokemonCards === 'object'
    ) {
        boardPokemonCards = remoteData.boardPokemonCards;
    }

    if (typeof initGameEngine === 'function') {
        initGameEngine();
    }

    if (typeof renderBoardMap === 'function') {
        renderBoardMap();
    }
});

let gameState = {
    setupDone: false,
    players: [],
    currentPlayerIndex: 0,
    turn: 1,
    currentEncounter: null,
    chatMessages: [
        {
            sender: "Sistema",
            text: "Bem-vindo ao Pokémon Master Trainer HEX Edition!"
        }
    ],
    currentBottomView: 'inventory',
    pcBoxCurrentPage: 0
};

let setupConfig = {
    mode: 'solo',
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

let selectedBallAura = null;

function createDefaultPlayer(name = "Ash Ketchum") {
    return {
        name,
        avatarId: 1,
        currentZone: 5,
        level: 1,
        gold: 350,
        badges: [],
        activeTeam: [],
        pcBox: [],
        inventory: [],
        equipmentSlots: [null, null]
    };
}

function ensureValidGameState() {
    if (!gameState || typeof gameState !== 'object') {
        gameState = {};
    }

    if (!Array.isArray(gameState.players)) {
        gameState.players = [];
    }

    if (gameState.players.length === 0) {
        gameState.players.push(createDefaultPlayer());
    }

    gameState.players = gameState.players.map((player) => {
        const safePlayer = player && typeof player === 'object'
            ? player
            : createDefaultPlayer();

        if (!safePlayer.name) safePlayer.name = "Treinador";
        if (!Number.isFinite(Number(safePlayer.avatarId))) safePlayer.avatarId = 1;
        if (!Number.isFinite(Number(safePlayer.currentZone))) safePlayer.currentZone = 5;
        if (!Number.isFinite(Number(safePlayer.level))) safePlayer.level = 1;
        if (!Number.isFinite(Number(safePlayer.gold))) safePlayer.gold = 350;

        if (!Array.isArray(safePlayer.badges)) safePlayer.badges = [];
        if (!Array.isArray(safePlayer.activeTeam)) safePlayer.activeTeam = [];
        if (!Array.isArray(safePlayer.pcBox)) safePlayer.pcBox = [];
        if (!Array.isArray(safePlayer.inventory)) safePlayer.inventory = [];
        if (!Array.isArray(safePlayer.equipmentSlots)) {
            safePlayer.equipmentSlots = [null, null];
        }

        while (safePlayer.equipmentSlots.length < 2) {
            safePlayer.equipmentSlots.push(null);
        }

        if (safePlayer.equipmentSlots.length > 2) {
            safePlayer.equipmentSlots = safePlayer.equipmentSlots.slice(0, 2);
        }

        safePlayer.activeTeam = safePlayer.activeTeam
            .filter(monster => monster && typeof monster === 'object')
            .map(normalizeMonsterData);

        safePlayer.pcBox = safePlayer.pcBox
            .filter(monster => monster && typeof monster === 'object')
            .map(normalizeMonsterData);

        safePlayer.inventory = safePlayer.inventory
            .filter(item => item && typeof item === 'object')
            .map(normalizeInventoryItem);

        return safePlayer;
    });

    if (!Number.isFinite(Number(gameState.currentPlayerIndex))) {
        gameState.currentPlayerIndex = 0;
    }

    gameState.currentPlayerIndex = Math.max(
        0,
        Math.min(
            Math.floor(Number(gameState.currentPlayerIndex)),
            gameState.players.length - 1
        )
    );

    if (!Number.isFinite(Number(gameState.turn)) || Number(gameState.turn) < 1) {
        gameState.turn = 1;
    }

    gameState.turn = Math.floor(Number(gameState.turn));

    if (!gameState.currentBottomView) {
        gameState.currentBottomView = 'inventory';
    }

    if (!Number.isFinite(Number(gameState.pcBoxCurrentPage))) {
        gameState.pcBoxCurrentPage = 0;
    }

    if (!Array.isArray(gameState.chatMessages)) {
        gameState.chatMessages = [
            {
                sender: "Sistema",
                text: "Bem-vindo ao Pokémon Master Trainer HEX Edition!"
            }
        ];
    }

    if (typeof gameState.setupDone !== 'boolean') {
        gameState.setupDone = true;
    }

    return gameState;
}

function normalizeMonsterData(monster) {
    const normalized = { ...monster };

    if (!normalized.name && normalized.id) {
        normalized.name = String(normalized.id)
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, letter => letter.toUpperCase());
    }

    if (!normalized.name) normalized.name = 'Anima';
    if (!normalized.id) normalized.id = normalized.name.toLowerCase().replace(/\s+/g, '_');

    normalized.level = Number.isFinite(Number(normalized.level))
        ? Math.max(1, Number(normalized.level))
        : 1;

    normalized.xp = Number.isFinite(Number(normalized.xp))
        ? Math.max(0, Number(normalized.xp))
        : 0;

    normalized.str = Number.isFinite(Number(normalized.str))
        ? Math.max(0, Number(normalized.str))
        : 4;

    const baseHp = Number(
        normalized.maxHp ||
        normalized.hp ||
        20
    );

    normalized.maxHp = Number.isFinite(baseHp) && baseHp > 0
        ? baseHp
        : 20;

    normalized.currentHp = normalized.currentHp === undefined
        ? normalized.maxHp
        : Math.max(
            0,
            Math.min(
                Number(normalized.currentHp) || 0,
                normalized.maxHp
            )
        );

    if (!normalized.uniqueId) {
        normalized.uniqueId = `mon_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;
    }

    normalized.isShiny = Boolean(normalized.isShiny);

    return normalized;
}

function normalizeInventoryItem(item) {
    const normalized = { ...item };

    if (!normalized.id) {
        normalized.id = `item_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;
    }

    normalized.name = normalized.name || normalized.id;
    normalized.count = Number.isFinite(Number(normalized.count))
        ? Math.max(0, Math.floor(Number(normalized.count)))
        : 1;

    if (!normalized.type) normalized.type = 'common';
    if (!Number.isFinite(Number(normalized.value))) normalized.value = 0;

    return normalized;
}

function getCurrentPlayer() {
    ensureValidGameState();

    const index = Math.max(
        0,
        Math.min(
            Math.floor(Number(gameState.currentPlayerIndex) || 0),
            gameState.players.length - 1
        )
    );

    gameState.currentPlayerIndex = index;

    return gameState.players[index] || gameState.players[0];
}

function createSaveSnapshot() {
    ensureValidGameState();

    return {
        gameState: JSON.parse(JSON.stringify(gameState)),
        boardPokemonCards: JSON.parse(JSON.stringify(boardPokemonCards || {})),
        timestamp: new Date().toISOString()
    };
}

function saveGameProgress() {
    try {
        const cp = getCurrentPlayer();
        const saveData = createSaveSnapshot();

        localStorage.setItem(
            'pokemon_master_trainer_save',
            JSON.stringify(saveData)
        );

        if (currentAuthenticatedAccount) {
            socket.emit('save_game_state', {
                email: currentAuthenticatedAccount,
                trainerName: cp ? cp.name : "Treinador",
                gameState: saveData.gameState,
                boardPokemonCards: saveData.boardPokemonCards
            });
        }

        showCustomPopup(
            "💾 Jogo Salvo",
            "O progresso da aventura foi guardado com sucesso na nuvem do Supabase!",
            true
        );

        appendAdventureLog(
            "Progresso do jogo salvo com sucesso na nuvem."
        );
    } catch (error) {
        console.error('Erro ao salvar o jogo:', error);

        showCustomPopup(
            "Erro ao Salvar",
            "❌ Não foi possível guardar o jogo.",
            false
        );
    }
}

function applyLoadedSave(saveData) {
    if (!saveData || typeof saveData !== 'object') {
        throw new Error('Save inválido.');
    }

    if (!saveData.gameState || typeof saveData.gameState !== 'object') {
        throw new Error('Estado de jogo ausente.');
    }

    gameState = saveData.gameState;

    boardPokemonCards =
        saveData.boardPokemonCards &&
        typeof saveData.boardPokemonCards === 'object'
            ? saveData.boardPokemonCards
            : {};

    ensureValidGameState();
}

function showMainGameLayout() {
    const setupScreen = document.getElementById('setup-screen');
    const mainGameLayout = document.getElementById('main-game-layout');
    const postLoginDashboard = document.getElementById('post-login-dashboard');

    if (setupScreen) setupScreen.classList.add('hidden');
    if (postLoginDashboard) postLoginDashboard.classList.add('hidden');
    if (mainGameLayout) mainGameLayout.classList.remove('hidden');
}

function loadGameProgress() {
    try {
        const savedRaw = localStorage.getItem(
            'pokemon_master_trainer_save'
        );

        if (!savedRaw) {
            showCustomPopup(
                "Sem Save",
                "⚠ Não foi encontrado nenhum jogo guardado neste navegador.",
                false
            );

            return false;
        }

        const saveData = JSON.parse(savedRaw);
        applyLoadedSave(saveData);
        showMainGameLayout();

        initGameEngine();

        if (typeof renderBoardMap === 'function') {
            renderBoardMap();
        }

        showCustomPopup(
            "📂 Jogo Carregado",
            "Bem-vindo de volta à jornada!",
            true
        );

        appendAdventureLog(
            "Jogo anterior carregado com sucesso."
        );

        return true;
    } catch (error) {
        console.error('Erro ao carregar o jogo:', error);

        showCustomPopup(
            "Erro ao Carregar",
            "❌ O ficheiro de save está corrompido ou incompatível.",
            false
        );

        return false;
    }
}

function deleteGameSave() {
    if (!confirm(
        "⚠️ Tem a certeza absoluta de que deseja apagar o seu progresso guardado?"
    )) {
        return;
    }

    localStorage.removeItem('pokemon_master_trainer_save');

    showCustomPopup(
        "🗑 Save Apagado",
        "O progresso do jogo foi eliminado deste navegador.",
        true
    );

    appendAdventureLog(
        "Progresso local do jogo foi apagado."
    );
}

function exportSaveToFile() {
    const player = getCurrentPlayer();
    const saveData = createSaveSnapshot();

    saveData.exportDate = new Date().toISOString();

    const trainerName = String(
        player?.name || 'treinador'
    )
        .replace(/[^\wÀ-ÿ -]/g, '')
        .trim()
        .replace(/\s+/g, '_') || 'treinador';

    const dataStr =
        "data:application/json;charset=utf-8," +
        encodeURIComponent(JSON.stringify(saveData, null, 2));

    const downloadAnchor = document.createElement('a');

    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
        'download',
        `pokemon_trainer_save_${trainerName}.json`
    );

    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showCustomPopup(
        "💾 Backup Exportado",
        "O ficheiro de save foi descarregado com sucesso!",
        true
    );
}

function importSaveFromFile(event) {
    const file = event?.target?.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function(loadEvent) {
        try {
            const saveData = JSON.parse(loadEvent.target.result);

            applyLoadedSave(saveData);

            localStorage.setItem(
                'pokemon_master_trainer_save',
                JSON.stringify(createSaveSnapshot())
            );

            showMainGameLayout();
            initGameEngine();

            if (typeof renderBoardMap === 'function') {
                renderBoardMap();
            }

            showCustomPopup(
                "📂 Backup Carregado",
                "O jogo foi importado com sucesso!",
                true
            );

            appendAdventureLog(
                "Save importado via ficheiro externo."
            );
        } catch (error) {
            console.error('Erro ao importar save:', error);

            showCustomPopup(
                "Erro de Importação",
                "❌ O ficheiro selecionado não é um save válido.",
                false
            );
        } finally {
            if (event?.target) {
                event.target.value = '';
            }
        }
    };

    reader.onerror = function() {
        showCustomPopup(
            "Erro de Importação",
            "❌ Não foi possível ler o arquivo selecionado.",
            false
        );
    };

    reader.readAsText(file);
}

window.logoutToSetupScreen = function() {
    if (!confirm(
        "⚠ Deseja realmente sair da sessão atual? Certifique-se de que salvou o seu progresso!"
    )) {
        return;
    }

    const mainLayout = document.getElementById('main-game-layout');
    const setupScreen = document.getElementById('setup-screen');
    const authContainer = document.getElementById('auth-container');
    const onlineLobby = document.getElementById('online-lobby-container');
    const postLoginDashboard = document.getElementById('post-login-dashboard');
    const trainerMainMenu = document.getElementById('trainer-main-menu');
    const characterCreation = document.getElementById(
        'character-creation-container'
    );

    if (mainLayout) mainLayout.classList.add('hidden');
    if (setupScreen) setupScreen.classList.remove('hidden');
    if (authContainer) authContainer.classList.remove('hidden');
    if (onlineLobby) onlineLobby.classList.add('hidden');
    if (postLoginDashboard) postLoginDashboard.classList.add('hidden');
    if (trainerMainMenu) trainerMainMenu.classList.add('hidden');
    if (characterCreation) characterCreation.classList.add('hidden');

    currentAuthenticatedAccount = null;

    if (typeof movementState !== 'undefined') {
        movementState.isMoving = false;
        movementState.hasRolledThisTurn = false;
        movementState.diceRolledValue = 0;
        movementState.validDestinations = [];
    }

    currentEncounterState = {
        wildPokemon: null,
        selectedTeamMemberIndex: 0,
        itemBonus: 0,
        battlePowerBonus: 0,
        hasAttemptedCapture: false
    };

    selectedBallAura = null;
};

// --- TABELA DE VANTAGENS DE TIPO (HEX Edition TCG) ---

const TYPE_ADVANTAGES = {
    "Fogo": {
        strongAgainst: ["Grama", "Inseto", "Gelo", "Aço"],
        weakAgainst: ["Água", "Fogo", "Pedra", "Dragão"]
    },
    "Água": {
        strongAgainst: ["Fogo", "Terra", "Pedra"],
        weakAgainst: ["Água", "Grama", "Dragão"]
    },
    "Grama": {
        strongAgainst: ["Água", "Terra", "Pedra"],
        weakAgainst: [
            "Fogo",
            "Grama",
            "Veneno",
            "Voador",
            "Inseto",
            "Dragão",
            "Aço"
        ]
    },
    "Elétrico": {
        strongAgainst: ["Água", "Voador"],
        weakAgainst: ["Elétrico", "Grama", "Dragão"]
    },
    "Psíquico": {
        strongAgainst: ["Lutador", "Veneno"],
        weakAgainst: ["Psíquico", "Aço"]
    },
    "Lutador": {
        strongAgainst: [
            "Normal",
            "Gelo",
            "Pedra",
            "Sombrio",
            "Aço"
        ],
        weakAgainst: [
            "Veneno",
            "Voador",
            "Psíquico",
            "Inseto"
        ]
    }
};

function calculateTypeAdvantageMultiplier(attackerType, defenderType) {
    if (!attackerType || !defenderType) {
        return 1.0;
    }

    const cleanAtk = String(attackerType)
        .split('/')[0]
        .trim();

    const cleanDef = String(defenderType)
        .split('/')[0]
        .trim();

    const advantage = TYPE_ADVANTAGES[cleanAtk];

    if (!advantage) {
        return 1.0;
    }

    if (
        Array.isArray(advantage.strongAgainst) &&
        advantage.strongAgainst.includes(cleanDef)
    ) {
        return 1.3;
    }

    if (
        Array.isArray(advantage.weakAgainst) &&
        advantage.weakAgainst.includes(cleanDef)
    ) {
        return 0.8;
    }

    return 1.0;
}

function getTierColorClass(tierOrColor) {
    const value = String(tierOrColor).toLowerCase();

    if (value === '1' || value === 'rosa') {
        return 'bg-gradient-to-b from-pink-950 via-pink-900 to-black border-pink-500';
    }

    if (value === '2' || value === 'verde') {
        return 'bg-gradient-to-b from-emerald-950 via-emerald-900 to-black border-emerald-500';
    }

    if (value === '3' || value === 'azul') {
        return 'bg-gradient-to-b from-blue-950 via-blue-900 to-black border-blue-500';
    }

    if (value === '4' || value === 'vermelho') {
        return 'bg-gradient-to-b from-red-950 via-red-900 to-black border-red-500';
    }

    if (value === '5' || value === 'amarelo') {
        return 'bg-gradient-to-b from-amber-950 via-amber-900 to-black border-amber-400';
    }

    return 'bg-gradient-to-b from-amber-950 via-amber-900 to-black border-amber-600';
}

function updateTrainerCardBadges(cp) {
    if (!cp || typeof cp !== 'object') return;

    const badgesArray = Array.isArray(cp.badges)
        ? cp.badges
        : [];

    const allBadges = [
        'boulder',
        'cascade',
        'thunder',
        'rainbow',
        'soul',
        'volcano'
    ];

    allBadges.forEach(badgeKey => {
        const imageElement = document.getElementById(
            `badge-${badgeKey}`
        );

        if (!imageElement) return;

        if (badgesArray.includes(badgeKey)) {
            imageElement.classList.remove(
                'grayscale',
                'opacity-40'
            );

            imageElement.classList.add(
                'drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]',
                'scale-110'
            );
        } else {
            imageElement.classList.add(
                'grayscale',
                'opacity-40'
            );

            imageElement.classList.remove(
                'drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]',
                'scale-110'
            );
        }
    });
}

window.openSpecificTrainerCardModal = function(playerIndex) {
    ensureValidGameState();

    const safeIndex = Math.max(
        0,
        Math.min(
            Math.floor(Number(playerIndex) || 0),
            gameState.players.length - 1
        )
    );

    const cp = gameState.players[safeIndex] || gameState.players[0];
    const loggedPlayer = getCurrentPlayer();

    if (!cp) return;

    const areOnSameTile =
        loggedPlayer &&
        loggedPlayer.currentZone === cp.currentZone &&
        loggedPlayer.name !== cp.name;

    let cardModal = document.getElementById(
        'trainer-card-modal-full'
    );

    if (!cardModal) {
        cardModal = document.createElement('div');
        cardModal.id = 'trainer-card-modal-full';
        cardModal.className =
            'fixed inset-0 bg-black/85 z-[350] flex items-center justify-center p-4 backdrop-blur-sm';

        document.body.appendChild(cardModal);
    }

    const activeTeam = Array.isArray(cp.activeTeam)
        ? cp.activeTeam
        : [];

    let teamSlotsHtml = '';

    for (let i = 0; i < 6; i++) {
        const monster = activeTeam[i];

        if (monster) {
            const normalizedMonster = normalizeMonsterData(monster);
            const curHp = normalizedMonster.currentHp;
            const maxHp = normalizedMonster.maxHp;

            const shinyBadgeModal = normalizedMonster.isShiny
                ? '<span class="bg-amber-400 text-black font-black text-[7px] px-1 rounded-full animate-pulse">✨ SHINY</span>'
                : '';

            const tierColorBg = getTierColorClass(
                normalizedMonster.tier || 1
            );

            const auraClassModal =
                normalizedMonster.auraEffect || '';

            const monImgSrc =
                normalizedMonster.isShiny &&
                normalizedMonster.shinyImage
                    ? normalizedMonster.shinyImage
                    : normalizedMonster.image || '';

            teamSlotsHtml += `
                <div class="${tierColorBg} border-2 ${normalizedMonster.isShiny ? 'border-amber-400 shiny-card-glow' : ''} ${auraClassModal} rounded-xl p-2 flex flex-col justify-between h-28 text-white shadow relative">
                    <div class="flex justify-between items-center text-[9px] font-bold">
                        <span class="truncate">${normalizedMonster.name}</span>
                        ${shinyBadgeModal}
                        <span>Nv.${normalizedMonster.level}</span>
                    </div>
                    <div class="my-auto flex justify-center bg-black/40 rounded-lg p-1">
                        <img src="${monImgSrc}" class="w-10 h-10 object-contain drop-shadow" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    </div>
                    <div class="text-[8px] text-center font-black bg-black/60 text-amber-300 rounded p-0.5">
                        HP: ${curHp}/${maxHp} | STR: ${normalizedMonster.str}
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

    const badgeCount = Array.isArray(cp.badges)
        ? cp.badges.length
        : 0;

    const badgesArray = Array.isArray(cp.badges)
        ? cp.badges
        : [];

    const allBadgesDef = [
        { key: 'boulder', title: 'Insígnia da Rocha' },
        { key: 'cascade', title: 'Insígnia da Cascata' },
        { key: 'thunder', title: 'Insígnia do Trovão' },
        { key: 'rainbow', title: 'Insígnia do Arco-Íris' },
        { key: 'soul', title: 'Insígnia da Alma' },
        { key: 'volcano', title: 'Insígnia do Vulcão' }
    ];

    let badgesHtml = '';

    allBadgesDef.forEach(badge => {
        const hasBadge = badgesArray.includes(badge.key);

        const classes = hasBadge
            ? 'drop-shadow-[0_0_8px_rgba(255,215,0,0.8)] scale-110'
            : 'grayscale opacity-40';

        badgesHtml += `
            <img
                id="badge-${badge.key}"
                src="${SUPABASE_STORAGE_URL}badges/${badge.key}.png"
                class="w-7 h-7 object-contain transition-transform ${classes}"
                alt="${badge.key}"
                title="${badge.title}"
            >
        `;
    });

    let interactionButtonsHtml = '';

    if (areOnSameTile) {
        const playerIndexInState = gameState.players.findIndex(
            player => player === cp
        );

        interactionButtonsHtml = `
            <div class="bg-purple-950/40 border-2 border-purple-600/60 p-3 rounded-xl flex flex-wrap gap-2 items-center justify-between mt-3">
                <span class="text-[10px] text-purple-300 font-bold">📍 Estão na mesma casa! Ações disponíveis:</span>
                <div class="flex gap-2 w-full">
                    <button onclick="document.getElementById('trainer-card-modal-full').remove(); triggerPvPBattleArena(${JSON.stringify(cp.name)});" class="flex-1 bg-red-700 hover:bg-red-600 text-white font-black py-2 rounded-lg text-[10px] uppercase shadow">
                        ⚔ Desafiar PvP
                    </button>
                    <button onclick="document.getElementById('trainer-card-modal-full').remove(); openTradeModal(${JSON.stringify(loggedPlayer.name)}, ${JSON.stringify(cp.name)});" class="flex-1 bg-blue-700 hover:bg-blue-600 text-white font-black py-2 rounded-lg text-[10px] uppercase shadow">
                        🔄 Propor Troca
                    </button>
                </div>
                <button onclick="document.getElementById('trainer-card-modal-full').remove(); openSpecificTrainerCardModal(${playerIndexInState});" class="w-full bg-amber-700 hover:bg-amber-600 text-black font-black py-2 rounded-lg text-[10px] uppercase shadow">
                    📋 Ver Trainer Card novamente
                </button>
            </div>
        `;
    }

    cardModal.innerHTML = `
        <div class="max-w-4xl w-full p-6 bg-gradient-to-b from-[#0f172a] to-[#020617] border-4 border-blue-600 rounded-2xl shadow-2xl space-y-4 text-white relative">
            <div class="flex justify-between items-center border-b border-blue-900/60 pb-2">
                <span class="text-xs font-black text-blue-400 font-cinzel tracking-wider">
                    TRAINER'S CARD (${cp.name}) - Zona #${cp.currentZone}
                </span>
                <button onclick="document.getElementById('trainer-card-modal-full').remove()" class="text-blue-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-blue-950/60 rounded border border-blue-800">
                    ✕
                </button>
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
                <span class="text-xs font-bold text-slate-300">
                    LEAGUE BADGES:
                    (<span id="badges-count-text">${badgeCount}</span> / 6)
                </span>
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
    window.openSpecificTrainerCardModal(
        gameState.currentPlayerIndex || 0
    );
};

window.setGameMode = function(mode) {
    setupConfig.mode = mode;

    const btnSolo = document.getElementById('btn-mode-solo');
    const btnMulti = document.getElementById('btn-mode-multi');
    const multiWizard = document.getElementById(
        'multiplayer-wizard-container'
    );
    const soloNameBox = document.getElementById(
        'solo-trainer-name-box'
    );
    const soloAvatarBox = document.getElementById(
        'solo-avatar-box'
    );
    const soloStarterBox = document.getElementById(
        'solo-starter-box'
    );

    if (!btnSolo || !btnMulti) return;

    if (mode === 'solo') {
        setupConfig.playersCount = 1;

        btnSolo.className =
            "py-2.5 px-4 rounded-xl border-2 border-amber-600 bg-amber-950/60 text-amber-300 font-bold text-xs transition-all hover:bg-amber-900 flex items-center justify-center gap-2";

        btnMulti.className =
            "py-2.5 px-4 rounded-xl border-2 border-slate-700 bg-slate-900/60 text-slate-400 font-bold text-xs transition-all hover:bg-slate-800 flex items-center justify-center gap-2";

        if (multiWizard) multiWizard.classList.add('hidden');
        if (soloNameBox) soloNameBox.classList.remove('hidden');
        if (soloAvatarBox) soloAvatarBox.classList.remove('hidden');
        if (soloStarterBox) soloStarterBox.classList.remove('hidden');
    } else {
        setupConfig.playersCount = 2;
        setupWizardState.currentConfiguringIndex = 0;
        setupWizardState.collectedPlayers = [];

        btnMulti.className =
            "py-2.5 px-4 rounded-xl border-2 border-amber-600 bg-amber-950/60 text-amber-300 font-bold text-xs transition-all flex items-center justify-center gap-2";

        btnSolo.className =
            "py-2.5 px-4 rounded-xl border-2 border-slate-700 bg-slate-900/60 text-slate-400 font-bold text-xs transition-all flex items-center justify-center gap-2";

        if (multiWizard) multiWizard.classList.remove('hidden');

        updateWizardUI();
    }
};

window.setPlayersCount = function(count) {
    const parsedCount = Math.floor(Number(count));

    if (![2, 3, 4].includes(parsedCount)) {
        return;
    }

    setupConfig.playersCount = parsedCount;

    [2, 3, 4].forEach(number => {
        const button = document.getElementById(
            `btn-count-${number}`
        );

        if (!button) return;

        button.className = number === parsedCount
            ? "bg-amber-600 text-black px-2.5 py-1 rounded font-bold text-xs"
            : "bg-slate-800 text-slate-300 px-2.5 py-1 rounded font-bold text-xs hover:bg-slate-700";
    });

    setupWizardState.currentConfiguringIndex = 0;
    setupWizardState.collectedPlayers = [];

    updateWizardUI();
};

function updateWizardUI() {
    const titleElement = document.getElementById(
        'multi-wizard-title'
    );

    if (titleElement) {
        titleElement.innerText =
            `Configuração do Jogador ${setupWizardState.currentConfiguringIndex + 1} de ${setupConfig.playersCount}`;
    }

    const nameInput = document.getElementById(
        'setup-trainer-name'
    );

    if (nameInput) {
        nameInput.value =
            `Treinador ${setupWizardState.currentConfiguringIndex + 1}`;
    }
}

window.selectAvatar = function(id) {
    const avatarId = Math.max(
        1,
        Math.min(8, Math.floor(Number(id) || 1))
    );

    setupConfig.avatarId = avatarId;

    document.querySelectorAll('.avatar-option').forEach(element => {
        element.classList.remove(
            'border-amber-500',
            'bg-amber-950/40'
        );

        element.classList.add(
            'border-amber-900/60',
            'bg-black/50'
        );
    });

    const selected = document.querySelector(
        `[data-avatar="${avatarId}"]`
    );

    if (selected) {
        selected.classList.remove(
            'border-amber-900/60',
            'bg-black/50'
        );

        selected.classList.add(
            'border-amber-500',
            'bg-amber-950/40'
        );
    }
};

window.selectStarter = function(starterId) {
    if (!starterId) return;

    setupConfig.starterId = String(starterId);

    const possibleStarters = [
        'bulbasaur',
        'charmander',
        'squirtle',
        'pikachu',
        'chikorita',
        'cyndaquil',
        'totodile',
        'eevee'
    ];

    possibleStarters.forEach(id => {
        const element = document.getElementById(
            `starter-${id}`
        );

        if (!element) return;

        element.classList.remove(
            'border-amber-500',
            'bg-amber-950/40'
        );

        element.classList.add(
            'border-amber-900/60',
            'bg-black/40'
        );
    });

    const target = document.getElementById(
        `starter-${setupConfig.starterId}`
    );

    if (target) {
        target.classList.remove(
            'border-amber-900/60',
            'bg-black/40'
        );

        target.classList.add(
            'border-amber-500',
            'bg-amber-950/40'
        );
    }
};

function createStarterMonster(starterId) {
    const starter =
        typeof MONSTER_CATALOG !== 'undefined'
            ? MONSTER_CATALOG.find(monster => monster.id === starterId)
            : null;

    const baseMonster = starter || {
        id: starterId,
        name: String(starterId || 'bulbasaur')
            .charAt(0)
            .toUpperCase() +
            String(starterId || 'bulbasaur').slice(1),
        type: "Normal",
        level: 1,
        str: 4,
        hp: 20,
        tier: 1
    };

    const maxHp = Number(baseMonster.hp || 20);

    return normalizeMonsterData({
        ...baseMonster,
        level: 1,
        xp: 0,
        tier: 1,
        currentHp: maxHp,
        maxHp,
        uniqueId: `mon_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 8)}`,
        isShiny: false
    });
}

function createStartingInventory() {
    return [
        {
            id: 'poke_ball',
            name: 'Poké Ball',
            type: 'sphere',
            value: 0,
            icon: '🔴',
            image: `${SUPABASE_STORAGE_URL}items/poke_ball.png`,
            count: 5,
            cost: 50,
            desc: 'Esfera clássica.'
        },
        {
            id: 'ball_great',
            name: 'Great Ball',
            type: 'sphere',
            value: 1,
            icon: '🔵',
            image: `${SUPABASE_STORAGE_URL}items/great_ball.png`,
            count: 3,
            cost: 100,
            desc: 'Adiciona +1 na captura.'
        },
        {
            id: 'ball_ultra',
            name: 'Ultra Ball',
            type: 'sphere',
            value: 2,
            icon: '🟡',
            image: `${SUPABASE_STORAGE_URL}items/ultra_ball.png`,
            count: 2,
            cost: 200,
            desc: 'Adiciona +2 na captura.'
        },
        {
            id: 'item_rarecandy',
            name: 'Rare Candy',
            type: 'rarecandy',
            value: 100,
            icon: '🍬',
            image: `${SUPABASE_STORAGE_URL}items/rare_candy.png`,
            count: 2,
            cost: 300,
            desc: 'Dá 100 XP imediato.'
        },
        {
            id: 'evolution_stone',
            name: 'Evolution Stone',
            type: 'evolution',
            value: 1,
            icon: '💎',
            image: `${SUPABASE_STORAGE_URL}items/evolution_stone.png`,
            count: 1,
            cost: 500,
            desc: 'Evolve um Anima compatível.'
        },
        {
            id: 'item_vitamin',
            name: 'Vitamin',
            type: 'battle',
            value: 2,
            icon: '🧪',
            image: `${SUPABASE_STORAGE_URL}items/vitamin.png`,
            count: 2,
            cost: 150,
            desc: 'Aumenta o STR do Pokémon em +2.'
        },
        {
            id: 'item_potion',
            name: 'Potion',
            type: 'heal',
            value: 20,
            icon: '💊',
            image: `${SUPABASE_STORAGE_URL}items/potion.png`,
            count: 3,
            cost: 50,
            desc: 'Restaura 20 HP de um Anima.'
        },
        {
            id: 'item_revive',
            name: 'Revive',
            type: 'revive',
            value: 50,
            icon: '🌟',
            image: `${SUPABASE_STORAGE_URL}items/revive.png`,
            count: 1,
            cost: 250,
            desc: 'Revive um Anima desmaiado.'
        }
    ].map(normalizeInventoryItem);
}

function createNewPlayerData(name, avatarId, starterId) {
    return {
        name: name || 'Treinador',
        avatarId: avatarId || 1,
        currentZone: 5,
        level: 1,
        gold: 350,
        badges: [],
        activeTeam: [
            createStarterMonster(starterId)
        ],
        pcBox: [],
        inventory: createStartingInventory(),
        equipmentSlots: [null, null]
    };
}

window.startMainGame = function() {
    const nameInput = document.getElementById(
        'setup-trainer-name'
    );

    const trainerName =
        nameInput && nameInput.value.trim()
            ? nameInput.value.trim()
            : "Ash Ketchum";

    if (setupConfig.mode === 'solo') {
        gameState.players = [
            createNewPlayerData(
                trainerName,
                setupConfig.avatarId,
                setupConfig.starterId
            )
        ];

        gameState.currentPlayerIndex = 0;
        gameState.turn = 1;
        gameState.setupDone = true;

        launchGameSession();
        return;
    }

    setupWizardState.collectedPlayers.push({
        name: trainerName,
        avatarId: setupConfig.avatarId || 1,
        starterId: setupConfig.starterId || 'bulbasaur'
    });

    setupWizardState.currentConfiguringIndex++;

    if (
        setupWizardState.currentConfiguringIndex <
        setupConfig.playersCount
    ) {
        updateWizardUI();

        showCustomPopup(
            "Próximo Treinador",
            `Configuração do Jogador ${setupWizardState.currentConfiguringIndex} guardada!\n\nPasse o dispositivo para o Jogador ${setupWizardState.currentConfiguringIndex + 1}.`,
            true
        );

        return;
    }

    gameState.players = setupWizardState.collectedPlayers.map(
        playerData => createNewPlayerData(
            playerData.name,
            playerData.avatarId,
            playerData.starterId
        )
    );

    gameState.currentPlayerIndex = 0;
    gameState.turn = 1;
    gameState.setupDone = true;

    launchGameSession();
};

function launchGameSession() {
    ensureValidGameState();

    gameState.currentPlayerIndex = 0;
    gameState.turn = 1;
    gameState.setupDone = true;

    const setupScreen = document.getElementById(
        'setup-screen'
    );

    const mainGameLayout = document.getElementById(
        'main-game-layout'
    );

    const postLoginDashboard = document.getElementById(
        'post-login-dashboard'
    );

    if (setupScreen) setupScreen.classList.add('hidden');
    if (postLoginDashboard) postLoginDashboard.classList.add('hidden');
    if (mainGameLayout) mainGameLayout.classList.remove('hidden');

    if (typeof movementState !== 'undefined') {
        movementState.isMoving = false;
        movementState.hasRolledThisTurn = false;
        movementState.diceRolledValue = 0;
        movementState.validDestinations = [];
    }

    if (typeof checkAndRenderPassTurnButton === 'function') {
        checkAndRenderPassTurnButton();
    }

    initGameEngine();

    appendAdventureLog(
        `Partida iniciada com ${gameState.players.length} jogador(es)! Turno de ${getCurrentPlayer().name}.`
    );
}
// --- MOTOR DO JOGO PRINCIPAL ---

function initGameEngine() {
    ensureValidGameState();

    if (typeof initializeBoardPokemonCards === 'function') {
        initializeBoardPokemonCards();
    }

    if (typeof renderBoardMap === 'function') {
        renderBoardMap();
    }

    if (typeof renderTeamCardSlots === 'function') {
        renderTeamCardSlots();
    }

    if (typeof renderEquipmentSlots === 'function') {
        renderEquipmentSlots();
    }

    if (typeof renderBottomPanel === 'function') {
        renderBottomPanel();
    }

    if (typeof renderChatMessages === 'function') {
        renderChatMessages();
    }

    if (typeof updatePlayerUI === 'function') {
        updatePlayerUI();
    }
}

// --- 1. GERAÇÃO DE MONSTROS NO TABULEIRO ---

function initializeBoardPokemonCards() {
    if (
        typeof BOARD_WAYPOINTS === 'undefined' ||
        !Array.isArray(BOARD_WAYPOINTS) ||
        typeof MONSTER_CATALOG === 'undefined' ||
        !Array.isArray(MONSTER_CATALOG)
    ) {
        return;
    }

    if (!boardPokemonCards || typeof boardPokemonCards !== 'object') {
        boardPokemonCards = {};
    }

    BOARD_WAYPOINTS.forEach(waypoint => {
        if (!waypoint || waypoint.type !== 'pokemon') return;
        if (boardPokemonCards[waypoint.id]) return;

        const targetRarity = String(
            waypoint.color || 'rosa'
        ).toLowerCase();

        let targetTier = 1;

        if (targetRarity === 'verde') {
            targetTier = 2;
        } else if (targetRarity === 'azul') {
            targetTier = 3;
        } else if (targetRarity === 'vermelho') {
            targetTier = 4;
        } else if (targetRarity === 'amarelo') {
            targetTier = 5;
        }

        const availableMonsters = MONSTER_CATALOG.filter(
            monster => monster && Number(monster.tier) === targetTier
        );

        const randomMonster = availableMonsters.length > 0
            ? availableMonsters[
                Math.floor(Math.random() * availableMonsters.length)
            ]
            : MONSTER_CATALOG.find(Boolean);

        if (!randomMonster) return;

        let minAllowedLevel = 1;
        let maxAllowedLevel = 5;

        if (targetTier === 1) {
            minAllowedLevel = 1;
            maxAllowedLevel = 6;
        } else if (targetTier === 2) {
            minAllowedLevel = 6;
            maxAllowedLevel = 14;
        } else if (targetTier === 3) {
            minAllowedLevel = 14;
            maxAllowedLevel = 24;
        } else if (targetTier === 4) {
            minAllowedLevel = 24;
            maxAllowedLevel = 35;
        } else if (targetTier === 5) {
            minAllowedLevel = 35;
            maxAllowedLevel = 50;
        }

        const evolutionLevel = Number(randomMonster.evolutionLevel);

        if (
            Number.isFinite(evolutionLevel) &&
            evolutionLevel > minAllowedLevel &&
            maxAllowedLevel >= evolutionLevel
        ) {
            maxAllowedLevel = evolutionLevel - 1;
        }

        if (minAllowedLevel > maxAllowedLevel) {
            minAllowedLevel = Math.max(1, maxAllowedLevel - 3);
        }

        const levelRange = Math.max(
            1,
            maxAllowedLevel - minAllowedLevel + 1
        );

        const wildLevel =
            Math.floor(Math.random() * levelRange) + minAllowedLevel;

        const isShiny = Math.random() < 0.08;
        const shinyHpBonus = isShiny ? 6 : 0;
        const shinyStrBonus = isShiny ? 2 : 0;

        const baseHp = Number(randomMonster.hp) || 20;
        const baseStr = Number(randomMonster.str) || 3;

        const scaledHp =
            baseHp +
            Math.max(0, (wildLevel - 1) * 2) +
            shinyHpBonus;

        const scaledStr =
            baseStr +
            Math.floor(Math.max(0, wildLevel - 1) / 3) +
            shinyStrBonus;

        boardPokemonCards[waypoint.id] = {
            ...randomMonster,
            tier: targetTier,
            level: wildLevel,
            hp: scaledHp,
            str: scaledStr,
            waypointId: waypoint.id,
            currentHp: scaledHp,
            maxHp: scaledHp,
            revealed: false,
            weakened: false,
            isShiny,
            image: randomMonster.image || '',
            shinyImage: randomMonster.shinyImage || null,
            auraEffect: isShiny ? 'shiny-gold-aura' : null
        };
    });
}

// --- 2. CAPTURADOS VÃO DIRETO PARA A BOX ---

function addMonsterToPlayer(monster) {
    const cp = getCurrentPlayer();

    if (!cp || !monster || typeof monster !== 'object') {
        return null;
    }

    const maxHp = Number(
        monster.maxHp ||
        monster.hp ||
        20
    ) > 0
        ? Number(monster.maxHp || monster.hp || 20)
        : 20;

    const newMonster = typeof normalizeMonsterData === 'function'
        ? normalizeMonsterData({
            ...monster,
            level: monster.level || 1,
            xp: 0,
            currentHp: maxHp,
            maxHp,
            uniqueId: `mon_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,
            isShiny: Boolean(monster.isShiny),
            shinyImage: monster.shinyImage || null,
            auraEffect:
                selectedBallAura ||
                monster.auraEffect ||
                (monster.isShiny ? 'shiny-gold-aura' : null)
        })
        : {
            ...monster,
            level: monster.level || 1,
            xp: 0,
            currentHp: maxHp,
            maxHp,
            uniqueId: `mon_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,
            isShiny: Boolean(monster.isShiny),
            shinyImage: monster.shinyImage || null,
            auraEffect:
                selectedBallAura ||
                monster.auraEffect ||
                (monster.isShiny ? 'shiny-gold-aura' : null)
        };

    selectedBallAura = null;

    if (!Array.isArray(cp.pcBox)) {
        cp.pcBox = [];
    }

    cp.pcBox.push(newMonster);

    if (typeof appendAdventureLog === 'function') {
        appendAdventureLog(
            `${cp.name} capturou ${
                newMonster.isShiny ? '✨ Shiny ' : ''
            }${newMonster.name} (Nv. ${newMonster.level}) e foi enviado diretamente para a PC Box!`
        );
    }

    if (typeof renderTeamCardSlots === 'function') {
        renderTeamCardSlots();
    }

    if (typeof renderBottomPanel === 'function') {
        renderBottomPanel();
    }

    return newMonster;
}

function renderEquipmentSlots() {
    const cp = getCurrentPlayer();

    if (!cp) return;

    if (!Array.isArray(cp.equipmentSlots)) {
        cp.equipmentSlots = [null, null];
    }

    for (let index = 0; index < 2; index++) {
        const slotElement = document.getElementById(
            `equipment-slot-${index}`
        );

        if (!slotElement) continue;

        const item = cp.equipmentSlots[index];

        if (item) {
            slotElement.innerHTML =
                `<span title="${item.name || 'Equipamento'}">${item.icon || '🎒'}</span>`;

            slotElement.className =
                "h-8 bg-amber-950 border border-amber-500 rounded flex items-center justify-center cursor-pointer text-[12px] shadow";
        } else {
            slotElement.innerHTML =
                `<span class="text-[9px] text-amber-500/40">Slot ${index + 1}</span>`;

            slotElement.className =
                "h-8 bg-black/60 border border-amber-600/40 rounded flex items-center justify-center cursor-pointer text-[10px]";
        }
    }
}

// --- ATUALIZAÇÃO DA UI DA BATALHA SELVAGEM ---

function updateEncounterUIInfo() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState?.wildPokemon;

    if (!cp || !wild || !Array.isArray(cp.activeTeam)) {
        return;
    }

    const selectedIndex = Number(
        currentEncounterState.selectedTeamMemberIndex
    ) || 0;

    const activeMon =
        cp.activeTeam[selectedIndex] ||
        cp.activeTeam.find(mon => {
            const hp = mon.currentHp !== undefined
                ? Number(mon.currentHp)
                : Number(mon.maxHp || mon.hp || 0);

            return hp > 0;
        }) ||
        cp.activeTeam[0];

    if (!activeMon) return;

    const activeHp = Math.max(
        0,
        Number(
            activeMon.currentHp !== undefined
                ? activeMon.currentHp
                : activeMon.maxHp || activeMon.hp || 20
        ) || 0
    );

    const activeMaxHp = Math.max(
        1,
        Number(activeMon.maxHp || activeMon.hp || 20) || 20
    );

    const typeMult = calculateTypeAdvantageMultiplier(
        activeMon.type,
        wild.type
    );

    const battleBonus = Number(
        currentEncounterState.battlePowerBonus
    ) || 0;

    const itemBonus = Number(
        currentEncounterState.itemBonus
    ) || 0;

    const baseStr = (Number(activeMon.str) || 4) + battleBonus;
    const estimatedPlayerPower = Math.round(baseStr * typeMult);

    const isLegendary =
        Number(wild.tier) === 5 ||
        String(wild.color || '').toLowerCase() === 'amarelo';

    const weakenedBonus =
        wild.weakened && !isLegendary ? 1 : 0;

    const totalCaptureBonusSoFar =
        itemBonus + weakenedBonus;

    let displayTarget = 4;
    const tier = Number(wild.tier) || 1;

    if (tier === 2) {
        displayTarget = 5;
    } else if (tier === 3 || tier === 4) {
        displayTarget = 6;
    } else if (isLegendary) {
        displayTarget = 7;
    }

    if (wild.isShiny) {
        displayTarget += 1;
    }

    const playerCardBg = getTierColorClass(
        activeMon.tier || 1
    );

    const enemyCardBg = getTierColorClass(
        wild.tier || 1
    );

    const auraEncPlayerClass =
        activeMon.auraEffect || '';

    const playerVisual = document.getElementById(
        'player-card-visual'
    );

    if (playerVisual) {
        playerVisual.className =
            `relative flex flex-col justify-between p-4 rounded-3xl border-4 ${playerCardBg} ${auraEncPlayerClass} shadow-2xl w-72 h-96 text-white`;

        playerVisual.innerHTML = `
            <div class="flex justify-between items-center font-black text-xs border-b-2 border-amber-400 pb-2">
                <span class="text-amber-300 font-bold uppercase">
                    NV. ${activeMon.level || 1}
                </span>
                <span class="text-amber-900 bg-amber-200 px-2 py-0.5 rounded font-bold uppercase text-[10px] border border-amber-400">
                    ${activeMon.type || 'Normal'}
                </span>
            </div>

            <div class="flex flex-col items-center justify-center my-auto space-y-3">
                <h3 class="text-base font-black text-white text-center truncate w-full">
                    ${activeMon.name}
                </h3>

                <div class="flex items-center justify-center bg-black/60 w-36 h-36 rounded-2xl border-2 border-amber-400 shadow-inner p-3 relative">
                    <img
                        src="${activeMon.isShiny && activeMon.shinyImage
                            ? activeMon.shinyImage
                            : activeMon.image || ''}"
                        alt="${activeMon.name}"
                        class="max-h-32 max-w-full object-contain drop-shadow-md"
                        onerror="this.src='https://api.iconify.design/noto:video-game.svg'"
                    >
                </div>
            </div>

            <div class="w-full bg-black/90 text-amber-300 rounded-2xl p-3 text-center space-y-1.5 shadow-md">
                <p class="text-xs font-bold tracking-wide">
                    HP: ${activeHp} / ${activeMaxHp}
                    &nbsp;|&nbsp;
                    STR: ${activeMon.str || 4}
                </p>

                <p class="text-[11px] font-black text-emerald-400 bg-emerald-950/90 rounded-xl px-2.5 py-1 border border-emerald-600">
                    ⚡ Pré-Soma: ~${estimatedPlayerPower} + [🎲 1-6]
                </p>
            </div>

            <button
                onclick="cyclePlayerEncounterPokemon()"
                class="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-amber-600 hover:bg-amber-500 text-black font-black text-[10px] px-3 py-1 rounded-full shadow border border-amber-300 uppercase tracking-wider cursor-pointer"
            >
                🔄 Trocar Anima
            </button>
        `;
    }

    const encVisual = document.getElementById(
        'enc-card-visual'
    );

    if (encVisual) {
        encVisual.className =
            `relative flex flex-col justify-between p-4 rounded-3xl border-4 ${enemyCardBg} shadow-2xl w-72 h-96 text-white ${wild.isShiny ? 'shiny-card-glow' : ''}`;

        const weakenedBadge = wild.weakened
            ? '<span class="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-md font-bold shadow">🩹 Enfraquecido (+1 Cap.)</span>'
            : '';

        const shinyWildBadge = wild.isShiny
            ? '<span class="bg-amber-400 text-black text-[10px] px-2 py-0.5 rounded-md font-black shadow animate-pulse">✨ SHINY SELVAGEM</span>'
            : '';

        const wildCurrentHp = Math.max(
            0,
            Number(
                wild.currentHp !== undefined
                    ? wild.currentHp
                    : wild.maxHp || wild.hp || 15
            ) || 0
        );

        const wildMaxHp = Math.max(
            1,
            Number(wild.maxHp || wild.hp || 15) || 15
        );

        encVisual.innerHTML = `
            <div class="flex justify-between items-center font-black text-xs border-b-2 border-red-900 pb-2">
                <span class="text-red-400 font-bold uppercase">
                    NV. ${wild.level || 1}
                </span>
                ${shinyWildBadge}
                <span class="text-red-300 bg-red-950 px-2 py-0.5 rounded font-bold uppercase text-[10px] border border-red-800">
                    ${wild.type || 'Normal'}
                </span>
            </div>

            <div class="flex flex-col items-center justify-center my-auto space-y-3">
                <h3 class="text-base font-black text-white text-center truncate w-full">
                    ${wild.name || 'Pokémon Selvagem'}
                </h3>

                <div class="flex items-center justify-center bg-black/60 w-36 h-36 rounded-2xl border-2 ${wild.isShiny ? 'border-amber-400 shiny-card-glow' : 'border-red-800'} shadow-inner p-3 relative">
                    <img
                        src="${wild.isShiny && wild.shinyImage
                            ? wild.shinyImage
                            : wild.image || ''}"
                        alt="${wild.name || 'Pokémon Selvagem'}"
                        class="max-h-32 max-w-full object-contain drop-shadow-md"
                        onerror="this.src='https://api.iconify.design/noto:video-game.svg'"
                    >
                    ${wild.weakened
                        ? '<span class="absolute top-2 right-2 bg-red-500 text-xs px-2 py-0.5 rounded-md shadow">🩹</span>'
                        : ''}
                </div>
            </div>

            <div class="w-full bg-black/90 text-red-300 rounded-2xl p-3 text-center space-y-1.5 shadow-md">
                <p class="text-xs font-bold tracking-wide">
                    HP: ${wildCurrentHp} / ${wildMaxHp}
                    &nbsp;|&nbsp;
                    STR: ${wild.str || 3}
                </p>

                <p class="text-[11px] font-black text-amber-300 bg-amber-950/90 rounded-xl px-2.5 py-1 border border-amber-600">
                    🎯 Alvo p/ Capturar: ${displayTarget}+
                    (Bónus: +${totalCaptureBonusSoFar})
                </p>

                ${weakenedBadge}
            </div>

            <div class="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-red-800 text-white font-black text-[10px] px-3 py-1 rounded-full shadow border border-red-600 uppercase tracking-wider pointer-events-none">
                Inimigo Selvagem
            </div>
        `;
    }
}

// --- BATALHA CONTRA POKÉMON SELVAGEM ---

window.resolveBattleAttempt = function() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState?.wildPokemon;

    if (
        !cp ||
        !wild ||
        !Array.isArray(cp.activeTeam)
    ) {
        return;
    }

    const selectedIndex = Number(
        currentEncounterState.selectedTeamMemberIndex
    ) || 0;

    const activeMon = cp.activeTeam[selectedIndex];

    if (!activeMon) return;

    const activeHp = Number(
        activeMon.currentHp !== undefined
            ? activeMon.currentHp
            : activeMon.maxHp || activeMon.hp || 0
    ) || 0;

    if (activeHp <= 0) {
        showCustomPopup(
            "Pokémon Desmaiado",
            "⚠ O teu Anima atual está com 0 de HP e não pode lutar! Troca de Anima ou usa um Revive.",
            false
        );
        return;
    }

    rollDiceWithAnimation((playerDice, wildDice) => {
        const typeMult = calculateTypeAdvantageMultiplier(
            activeMon.type,
            wild.type
        );

        const battleBonus = Number(
            currentEncounterState.battlePowerBonus
        ) || 0;

        const playerPower = Math.round(
            ((Number(activeMon.str) || 4) +
                battleBonus +
                Number(playerDice || 0)) *
            typeMult
        );

        const wildPower =
            (Number(wild.str) || 3) +
            Number(wildDice || 0);

        if (playerPower >= wildPower) {
            const damageToWild = Math.max(
                10,
                playerPower - wildPower + 10
            );

            const currentWildHp = Number(
                wild.currentHp !== undefined
                    ? wild.currentHp
                    : wild.maxHp || wild.hp || 20
            ) || 0;

            wild.currentHp = Math.max(
                0,
                currentWildHp - damageToWild
            );

            if (wild.currentHp <= 0) {
                wild.weakened = true;

                if (
                    wild.waypointId &&
                    boardPokemonCards &&
                    boardPokemonCards[wild.waypointId]
                ) {
                    boardPokemonCards[wild.waypointId].weakened = true;
                    boardPokemonCards[wild.waypointId].currentHp = 0;
                }

                showCustomPopup(
                    "🏆 POKÉMON SELVAGEM DERROTADO!",
                    `O teu ${activeMon.name} venceu e desmaiou o ${wild.name} selvagem!\n\nPodes agora tentar capturá-lo.`,
                    true
                );

                addExperienceToMonster(activeMon, 50);
                triggerCaptureFlow(wild);
            } else {
                showCustomPopup(
                    "⚔️ ATAQUE BEM-SUCEDIDO!",
                    `O teu ${activeMon.name} causou ${damageToWild} de dano ao ${wild.name}!\n\nHP Restante do Selvagem: ${wild.currentHp}/${wild.maxHp || wild.hp}`,
                    true
                );
            }

            updateEncounterUIInfo();
            return;
        }

        const damageToPlayer = 15;

        activeMon.currentHp = Math.max(
            0,
            activeHp - damageToPlayer
        );

        if (activeMon.currentHp <= 0) {
            showCustomPopup(
                "💀 O TEU POKÉMON DESMAIOU",
                `O ${wild.name} selvagem desferiu um golpe crítico!\n\n💔 O teu ${activeMon.name} desmaiou (HP 0). A batalha contra este selvagem está encerrada para este Anima. Deves fugir ou trocar!`,
                false
            );

            closeEncounterModalUI();
        } else {
            showCustomPopup(
                "💥 CONTRA-ATAQUE SOFRIDO",
                `O ${wild.name} selvagem foi mais forte nesta ronda!\n\n💔 ${activeMon.name} sofreu ${damageToPlayer} de dano.`,
                false
            );
        }

        renderTeamCardSlots();
        updateEncounterUIInfo();
    });
};

// --- COFRE GLOBAL E DADOS DA CONTA ---

function safeReadLocalStorageArray(key) {
    try {
        const parsed = JSON.parse(
            localStorage.getItem(key) || '[]'
        );

        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn(`Não foi possível ler o armazenamento: ${key}`, error);
        return [];
    }
}

function saveGlobalTrainerAccountData(trainerName, avatarId) {
    const globalAccountData = {
        trainerName: trainerName || 'Treinador',
        avatarId: Number(avatarId) || 1,
        vault: safeReadLocalStorageArray(
            'pokemon_master_trainer_vault'
        ),
        pokedex: safeReadLocalStorageArray(
            'pokemon_master_trainer_pokedex'
        ),
        updatedAt: new Date().toISOString()
    };

    try {
        localStorage.setItem(
            'pokemon_master_trainer_account_profile',
            JSON.stringify(globalAccountData)
        );
    } catch (error) {
        console.error(
            'Não foi possível salvar o perfil global:',
            error
        );
    }

    return globalAccountData;
}

function loadGlobalTrainerAccountData() {
    try {
        const raw = localStorage.getItem(
            'pokemon_master_trainer_account_profile'
        );

        if (!raw) return null;

        const parsed = JSON.parse(raw);

        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        parsed.vault = Array.isArray(parsed.vault)
            ? parsed.vault
            : [];

        parsed.pokedex = Array.isArray(parsed.pokedex)
            ? parsed.pokedex
            : [];

        return parsed;
    } catch (error) {
        console.warn(
            'Não foi possível carregar o perfil global:',
            error
        );

        return null;
    }
}

// --- VALIDAÇÃO OBRIGATÓRIA DE POKÉ BALLS NA CAPTURA ---

function triggerCaptureFlow(wildPokemon) {
    const cp = getCurrentPlayer();

    if (
        !cp ||
        !wildPokemon ||
        typeof wildPokemon !== 'object'
    ) {
        return;
    }

    if (!Array.isArray(cp.inventory)) {
        cp.inventory = [];
    }

    const availableSpheres = cp.inventory.filter(item =>
        item &&
        item.type === 'sphere' &&
        Number(item.count) > 0
    );

    if (availableSpheres.length === 0) {
        showCustomPopup(
            "Sem Poké Balls!",
            "❌ Não tens nenhuma Poké Ball, Great Ball ou Ultra Ball na tua mochila!\n\nVisita o Poké Mart numa cidade para adquirir esferas antes de tentares capturar este Anima.",
            false
        );

        return;
    }

    let captureModal = document.getElementById(
        'capture-flow-modal'
    );

    if (!captureModal) {
        captureModal = document.createElement('div');
        captureModal.id = 'capture-flow-modal';
        captureModal.className =
            'fixed inset-0 bg-black/90 z-[600] flex items-center justify-center p-4 backdrop-blur-md';

        document.body.appendChild(captureModal);
    }

    let sphereButtonsHtml = '';

    availableSpheres.forEach(sphere => {
        let buttonColor =
            'bg-red-600 hover:bg-red-500';

        if (sphere.id === 'ball_great') {
            buttonColor =
                'bg-blue-600 hover:bg-blue-500';
        }

        if (sphere.id === 'ball_ultra') {
            buttonColor =
                'bg-amber-600 hover:bg-amber-500';
        }

        sphereButtonsHtml += `
            <button
                onclick="document.getElementById('capture-flow-modal').remove(); attemptCatchWithSpecificBall(${JSON.stringify(sphere.id)}, ${JSON.stringify(wildPokemon.waypointId || '')});"
                class="${buttonColor} text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer flex items-center gap-1.5 shadow"
            >
                <span>${sphere.icon || '🔴'}</span>
                ${sphere.name || sphere.id}
                (${Number(sphere.count) || 0})
            </button>
        `;
    });

    captureModal.innerHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] text-white text-center">
            <h3 class="text-sm font-black text-amber-400 uppercase">
                🎯 TENTATIVA DE CAPTURA
            </h3>

            <p class="text-xs text-slate-300">
                O ${wildPokemon.name || 'Pokémon selvagem'} está debilitado! Escolha uma esfera da sua mochila:
            </p>

            <div class="flex flex-wrap justify-center gap-3 my-4">
                ${sphereButtonsHtml}
            </div>

            <button
                onclick="document.getElementById('capture-flow-modal').remove()"
                class="text-xs text-slate-400 hover:text-white underline cursor-pointer"
            >
                Fugir / Ignorar
            </button>
        </div>
    `;

    captureModal.classList.remove('hidden');
}

window.attemptCatchWithSpecificBall = function(ballItemId, waypointId) {
    const cp = getCurrentPlayer();

    if (!cp || !Array.isArray(cp.inventory)) {
        return;
    }

    const sphereItem = cp.inventory.find(
        item =>
            item &&
            item.id === ballItemId &&
            Number(item.count) > 0
    );

    if (!sphereItem) {
        showCustomPopup(
            "Esfera Esgotada",
            "❌ Não tens unidades suficientes desta esfera!",
            false
        );

        return;
    }

    sphereItem.count = Math.max(
        0,
        Number(sphereItem.count) - 1
    );

    const bonus = Number(sphereItem.value) || 0;

    selectedBallAura = sphereItem.aura || null;
    currentEncounterState.itemBonus = bonus;

    resolveCaptureAttempt();

    if (typeof renderBottomPanel === 'function') {
        renderBottomPanel();
    }
};

window.attemptCatchWithBall = function(ballType, waypointId) {
    const cp = getCurrentPlayer();

    if (!cp || !Array.isArray(cp.inventory)) {
        return;
    }

    const normalizedBallType = String(
        ballType || ''
    ).toLowerCase();

    const ballIdMap = {
        pokeball: 'poke_ball',
        'poke_ball': 'poke_ball',
        greatball: 'ball_great',
        'ball_great': 'ball_great',
        ultraball: 'ball_ultra',
        'ball_ultra': 'ball_ultra'
    };

    const ballItemId =
        ballIdMap[normalizedBallType];

    if (ballItemId) {
        window.attemptCatchWithSpecificBall(
            ballItemId,
            waypointId
        );

        return;
    }

    let bonus = 0;

    if (normalizedBallType === 'great') {
        bonus = 1;
    } else if (normalizedBallType === 'ultra') {
        bonus = 2;
    }

    currentEncounterState.itemBonus = bonus;
    resolveCaptureAttempt();
};
// --- MODAL DETALHADO DO POKÉMON ---
/* [duplicata removida] */
;

// --- USO DE ITENS NA MOCHILA ---
/* [duplicata removida] */


// --- CIDADES, CENTRO POKÉMON E POKÉ MART ---

window.openCityModal = function(cityName) {
    let cityModal =
        document.getElementById('city-hub-modal');

    if (!cityModal) {
        cityModal = document.createElement('div');
        cityModal.id = 'city-hub-modal';
        cityModal.className =
            'fixed inset-0 bg-black/85 z-[350] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(cityModal);
    }

    const cp = getCurrentPlayer();
    if (!cp) return;

    const safeCityName = String(
        cityName || 'Cidade'
    );

    let gymInfo = null;

    if (
        typeof GYM_LEADERS_CATALOG !== 'undefined' &&
        Array.isArray(GYM_LEADERS_CATALOG)
    ) {
        const normalizeCityName = value =>
            String(value || '')
                .toLowerCase()
                .replace(/city/g, '')
                .replace(/island/g, '')
                .replace(/\s+/g, '')
                .trim();

        const normalizedSearch =
            normalizeCityName(safeCityName);

        gymInfo = GYM_LEADERS_CATALOG.find(gym => {
            if (!gym) return false;

            return normalizeCityName(gym.city) ===
                normalizedSearch;
        }) || null;
    }

    const badges =
        Array.isArray(cp.badges)
            ? cp.badges
            : [];

    const hasBadge =
        Boolean(
            gymInfo &&
            badges.includes(gymInfo.badgeKey)
        );

    let gymSectionHtml = `
        <p class="text-xs text-slate-400 text-center">
            Esta localidade não possui um ginásio oficial registado.
        </p>
    `;

    if (gymInfo) {
        let leaderFileName =
            gymInfo.leader || 'leader';

        if (leaderFileName === 'Misty') {
            leaderFileName = 'misty';
        }

        const leaderSpriteUrl =
            `${SUPABASE_STORAGE_URL}leaders/${encodeURIComponent(leaderFileName)}.png`;

        const leaderTeam =
            Array.isArray(gymInfo.pokemons) &&
            gymInfo.pokemons.length > 0
                ? gymInfo.pokemons
                : gymInfo.pokemon
                    ? [gymInfo.pokemon]
                    : [];

        let teamPokesHtml = '';

        leaderTeam.forEach(pokemon => {
            if (!pokemon) return;

            teamPokesHtml += `
                <div class="flex items-center gap-2 bg-black/40 p-1.5 rounded-xl border border-red-900/50">
                    <img
                        src="${pokemon.image || ''}"
                        class="w-10 h-10 object-contain drop-shadow"
                        onerror="this.onerror=null; this.src='https://api.iconify.design/noto:video-game.svg';"
                    >

                    <div class="text-[10px]">
                        <p class="font-bold text-white">
                            ${pokemon.name || 'Pokémon'}
                        </p>

                        <p class="text-amber-400">
                            Nv. ${pokemon.level || 1} |
                            ${pokemon.type || 'Normal'}
                        </p>
                    </div>
                </div>
            `;
        });

        gymSectionHtml = `
            <div class="bg-red-950/40 border-2 border-red-600/60 p-3 rounded-2xl space-y-2">
                <div class="flex justify-between items-center border-b border-red-900 pb-1">
                    <div class="flex items-center gap-2">
                        <img
                            src="${leaderSpriteUrl}"
                            class="w-10 h-10 object-contain rounded-full bg-black border border-amber-400 shadow"
                            onerror="this.onerror=null; this.src='https://api.iconify.design/noto:man-raising-hand.svg';"
                        >

                        <div>
                            <span class="text-xs font-black text-red-300">
                                Líder: ${gymInfo.leader || 'Desconhecido'}
                            </span>

                            <p class="text-[9px] text-slate-300">
                                Formato: ${gymInfo.format || 1}x${gymInfo.format || 1}
                            </p>
                        </div>
                    </div>

                    <div>
                        ${
                            hasBadge
                                ? `
                                    <span class="bg-emerald-600 text-white font-bold text-[9px] px-2 py-0.5 rounded-full shadow">
                                        ✔ Insígnia Conquistada
                                    </span>
                                `
                                : `
                                    <span class="bg-amber-500 text-black font-black text-[9px] px-2 py-0.5 rounded-full animate-pulse shadow">
                                        ⭐ Ginásio Pendente
                                    </span>
                                `
                        }
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    ${teamPokesHtml || '<p class="text-[10px] text-slate-400 col-span-2 text-center">Equipa não informada.</p>'}
                </div>

                <div class="flex justify-between items-center text-[10px] text-slate-300 pt-1 border-t border-red-900/40">
                    <span>
                        Prémio:
                        <strong class="text-amber-400">
                            ${Number(gymInfo.rewardGold) || 0} 🪙
                        </strong>
                    </span>

                    <span>
                        Insígnia:
                        <strong class="text-amber-300 uppercase">
                            ${gymInfo.badgeKey || 'N/D'}
                        </strong>
                    </span>
                </div>

                <button
                    onclick="document.getElementById('city-hub-modal').remove(); initiateGymSequence(${JSON.stringify(gymInfo.city || safeCityName)});"
                    class="w-full bg-amber-600 hover:bg-amber-500 text-black font-black py-2 rounded-xl text-xs uppercase shadow transition-all cursor-pointer"
                >
                    ⚔️ Desafiar Ginásio
                </button>
            </div>
        `;
    }

    cityModal.innerHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-amber-500 rounded-2xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <span class="text-xs font-black text-amber-400 font-cinzel tracking-wider">
                    🏙 CIDADE DE ${safeCityName.toUpperCase()}
                </span>

                <button
                    onclick="document.getElementById('city-hub-modal').remove()"
                    class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-amber-950/60 rounded border border-amber-800"
                >
                    ✕
                </button>
            </div>

            <div class="grid grid-cols-2 gap-2">
                <button
                    onclick="document.getElementById('city-hub-modal').remove(); openPokemonCenterModal();"
                    class="bg-emerald-700 hover:bg-emerald-600 text-white font-black py-2 px-3 rounded-xl text-[10px] uppercase shadow flex items-center justify-center gap-1.5 cursor-pointer"
                >
                    🏥 Centro Pokémon
                </button>

                <button
                    onclick="document.getElementById('city-hub-modal').remove(); openPokemartModal();"
                    class="bg-blue-700 hover:bg-blue-600 text-white font-black py-2 px-3 rounded-xl text-[10px] uppercase shadow flex items-center justify-center gap-1.5 cursor-pointer"
                >
                    🏪 Poké Mart
                </button>
            </div>

            ${gymSectionHtml}

            <button
                onclick="document.getElementById('city-hub-modal').remove()"
                class="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-xl text-xs cursor-pointer"
            >
                Continuar Viagem
            </button>
        </div>
    `;

    cityModal.classList.remove('hidden');
};

window.openPokemonCenterModal = function() {
    const cp = getCurrentPlayer();
    if (!cp) return;

    const healTeam = team => {
        if (!Array.isArray(team)) return;

        team.forEach(monster => {
            if (!monster) return;

            const maxHp = Math.max(
                1,
                Number(monster.maxHp || monster.hp || 20) || 20
            );

            monster.maxHp = maxHp;
            monster.currentHp = maxHp;
        });
    };

    healTeam(cp.activeTeam);
    healTeam(cp.pcBox);

    renderTeamCardSlots();
    renderBottomPanel();
    updatePlayerUI();

    showCustomPopup(
        "🏥 Centro Pokémon",
        `A enfermeira Joy cuidou da equipa de ${cp.name}!\n\n✨ Todos os Pokémon foram totalmente curados!`,
        true
    );

    appendAdventureLog(
        `${cp.name} visitou o Centro Pokémon: equipa totalmente curada.`
    );
};

window.openPokemartModal = function() {
    let martModal =
        document.getElementById('pokemart-modal');

    if (!martModal) {
        martModal = document.createElement('div');
        martModal.id = 'pokemart-modal';
        martModal.className =
            'fixed inset-0 bg-black/85 z-[350] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(martModal);
    }

    renderMartContent(martModal);
    martModal.classList.remove('hidden');
};

function renderMartContent(modalElement) {
    const cp = getCurrentPlayer();
    if (!cp) return;

    if (!Array.isArray(cp.inventory)) {
        cp.inventory = [];
    }

    const itemsForSale = [
        {
            id: 'poke_ball',
            name: 'Poké Ball',
            type: 'sphere',
            value: 0,
            cost: 50,
            icon: '🔴',
            image: `${SUPABASE_STORAGE_URL}items/poke_ball.png`,
            desc: 'Esfera clássica.'
        },
        {
            id: 'ball_great',
            name: 'Great Ball',
            type: 'sphere',
            value: 1,
            cost: 100,
            icon: '🔵',
            image: `${SUPABASE_STORAGE_URL}items/great_ball.png`,
            desc: '+1 na captura.'
        },
        {
            id: 'ball_ultra',
            name: 'Ultra Ball',
            type: 'sphere',
            value: 2,
            cost: 200,
            icon: '🟡',
            image: `${SUPABASE_STORAGE_URL}items/ultra_ball.png`,
            desc: '+2 na captura.'
        },
        {
            id: 'item_rarecandy',
            name: 'Rare Candy',
            type: 'rarecandy',
            value: 100,
            cost: 300,
            icon: '🍬',
            image: `${SUPABASE_STORAGE_URL}items/rare_candy.png`,
            desc: 'Dá 100 XP.'
        },
        {
            id: 'evolution_stone',
            name: 'Evolution Stone',
            type: 'evolution',
            value: 1,
            cost: 500,
            icon: '💎',
            image: `${SUPABASE_STORAGE_URL}items/evolution_stone.png`,
            desc: 'Evolui um Anima compatível.'
        },
        {
            id: 'item_potion',
            name: 'Potion',
            type: 'heal',
            value: 20,
            cost: 50,
            icon: '💊',
            image: `${SUPABASE_STORAGE_URL}items/potion.png`,
            desc: 'Restaura 20 HP.'
        },
        {
            id: 'item_revive',
            name: 'Revive',
            type: 'revive',
            value: 50,
            cost: 250,
            icon: '🌟',
            image: `${SUPABASE_STORAGE_URL}items/revive.png`,
            desc: 'Revive um Anima desmaiado.'
        },
        {
            id: 'item_vitamin',
            name: 'Vitamin',
            type: 'battle',
            value: 2,
            cost: 150,
            icon: '🧪',
            image: `${SUPABASE_STORAGE_URL}items/vitamin.png`,
            desc: '+2 STR na batalha.'
        }
    ];

    let shopHtml = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-blue-500 rounded-2xl bg-gradient-to-b from-[#0f172a] to-[#020617] shadow-2xl text-white">

            <div class="flex justify-between items-center border-b border-blue-900/60 pb-2">
                <span class="text-xs font-black text-blue-400 font-cinzel tracking-wider">
                    🏪 POKÉ MART
                </span>

                <span class="bg-amber-500 text-black font-black text-[10px] px-2 py-0.5 rounded">
                    Ouro: ${Number(cp.gold) || 0} 🪙
                </span>
            </div>

            <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
    `;

    itemsForSale.forEach(item => {
        const itemImage = item.image
            ? `
                <img
                    src="${item.image}"
                    class="w-8 h-8 object-contain"
                    onerror="this.onerror=null; this.src='https://api.iconify.design/noto:package.svg';"
                >
            `
            : `<span class="text-xl">${item.icon}</span>`;

        shopHtml += `
            <div class="flex items-center justify-between bg-black/50 p-2.5 rounded-xl border border-blue-900/50">
                <div class="flex items-center gap-2">
                    ${itemImage}

                    <div>
                        <p class="text-xs font-bold text-white">
                            ${item.name}
                        </p>

                        <p class="text-[9px] text-slate-400">
                            ${item.desc}
                        </p>
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <span class="text-xs font-black text-amber-400">
                        ${item.cost} 🪙
                    </span>

                    <button
                        onclick="buyItemFromMart(${JSON.stringify(item.id)}, ${Number(item.cost) || 0})"
                        class="bg-blue-600 hover:bg-blue-500 text-white font-black px-3 py-1 rounded-lg text-[10px] shadow cursor-pointer"
                    >
                        Comprar
                    </button>
                </div>
            </div>
        `;
    });

    shopHtml += `
            </div>

            <button
                onclick="document.getElementById('pokemart-modal').remove()"
                class="w-full bg-slate-700 hover:bg-slate-600 text-white font-black py-2 rounded-xl text-xs uppercase shadow cursor-pointer"
            >
                Sair da Loja
            </button>
        </div>
    `;

    modalElement.innerHTML = shopHtml;
}

window.buyItemFromMart = function(itemId, cost) {
    const cp = getCurrentPlayer();
    if (!cp) return;

    const itemCost = Math.max(
        0,
        Number(cost) || 0
    );

    if ((Number(cp.gold) || 0) < itemCost) {
        showCustomPopup(
            "Sem Ouro",
            "❌ Não tens ouro suficiente para comprar este item!",
            false
        );
        return;
    }

    const itemCatalog = {
        poke_ball: {
            id: 'poke_ball',
            name: 'Poké Ball',
            type: 'sphere',
            value: 0,
            icon: '🔴',
            image: `${SUPABASE_STORAGE_URL}items/poke_ball.png`,
            desc: 'Esfera clássica.'
        },

        ball_great: {
            id: 'ball_great',
            name: 'Great Ball',
            type: 'sphere',
            value: 1,
            icon: '🔵',
            image: `${SUPABASE_STORAGE_URL}items/great_ball.png`,
            desc: '+1 na captura.'
        },

        ball_ultra: {
            id: 'ball_ultra',
            name: 'Ultra Ball',
            type: 'sphere',
            value: 2,
            icon: '🟡',
            image: `${SUPABASE_STORAGE_URL}items/ultra_ball.png`,
            desc: '+2 na captura.'
        },

        item_rarecandy: {
            id: 'item_rarecandy',
            name: 'Rare Candy',
            type: 'rarecandy',
            value: 100,
            icon: '🍬',
            image: `${SUPABASE_STORAGE_URL}items/rare_candy.png`,
            desc: 'Dá 100 XP.'
        },

        evolution_stone: {
            id: 'evolution_stone',
            name: 'Evolution Stone',
            type: 'evolution',
            value: 1,
            icon: '💎',
            image: `${SUPABASE_STORAGE_URL}items/evolution_stone.png`,
            desc: 'Evolui um Anima compatível.'
        },

        item_potion: {
            id: 'item_potion',
            name: 'Potion',
            type: 'heal',
            value: 20,
            icon: '💊',
            image: `${SUPABASE_STORAGE_URL}items/potion.png`,
            desc: 'Restaura 20 HP.'
        },

        item_revive: {
            id: 'item_revive',
            name: 'Revive',
            type: 'revive',
            value: 50,
            icon: '🌟',
            image: `${SUPABASE_STORAGE_URL}items/revive.png`,
            desc: 'Revive um Anima desmaiado.'
        },

        item_vitamin: {
            id: 'item_vitamin',
            name: 'Vitamin',
            type: 'battle',
            value: 2,
            icon: '🧪',
            image: `${SUPABASE_STORAGE_URL}items/vitamin.png`,
            desc: '+2 STR na batalha.'
        }
    };

    const itemDefinition = itemCatalog[itemId];

    if (!itemDefinition) {
        showCustomPopup(
            "Erro",
            "❌ Este item não está disponível no catálogo da loja.",
            false
        );
        return;
    }

    if (!Array.isArray(cp.inventory)) {
        cp.inventory = [];
    }

    cp.gold = Math.max(
        0,
        (Number(cp.gold) || 0) - itemCost
    );

    const existingItem = cp.inventory.find(
        item => item && item.id === itemId
    );

    if (existingItem) {
        existingItem.count =
            Math.max(0, Number(existingItem.count) || 0) + 1;
    } else {
        cp.inventory.push({
            ...itemDefinition,
            count: 1
        });
    }

    updatePlayerUI();
    renderBottomPanel();

    showCustomPopup(
        "Compra Realizada",
        `🎉 ${itemDefinition.name} comprado com sucesso!`,
        true
    );

    const martModal =
        document.getElementById('pokemart-modal');

    if (martModal) {
        renderMartContent(martModal);
    }
};
// --- MODAL DETALHADO DO POKÉMON ---

window.openPokemonDetailModal = function(monsterIdOrUniqueId, fromArea = 'team') {
    const cp = getCurrentPlayer();
    if (!cp) return;

    if (!Array.isArray(cp.activeTeam)) cp.activeTeam = [];
    if (!Array.isArray(cp.pcBox)) cp.pcBox = [];

    let monster = null;
    const findMonster = list => list.find(mon => mon && (mon.uniqueId === monsterIdOrUniqueId || mon.id === monsterIdOrUniqueId));

    if (fromArea === 'team') monster = findMonster(cp.activeTeam);
    else if (fromArea === 'pcbox') monster = findMonster(cp.pcBox);
    else if (fromArea === 'board' && typeof boardPokemonCards !== 'undefined') monster = boardPokemonCards[monsterIdOrUniqueId];

    if (!monster) return;

    const level = Number(monster.level) || 1;
    const strength = Number(monster.str) || 4;
    const baseHp = Number(monster.hp) || 20;
    const maxHp = Math.max(1, Number(monster.maxHp) || baseHp);
    const currentHp = Math.max(0, Math.min(maxHp, Number(monster.currentHp !== undefined ? monster.currentHp : maxHp) || 0));
    const xpCurrent = Math.max(0, Number(monster.xp) || 0);
    const isFainted = currentHp <= 0;
    const isShiny = Boolean(monster.isShiny);
    const monsterName = monster.name || 'Pokémon';
    const monsterType = monster.type || 'Normal';
    const typeKey = monsterType.split('/')[0].trim();

    const typeInfo = typeof TYPE_ADVANTAGES !== 'undefined' && TYPE_ADVANTAGES[typeKey]
        ? TYPE_ADVANTAGES[typeKey]
        : { strongAgainst: [], weakAgainst: [] };

    const strongList = Array.isArray(typeInfo.strongAgainst) && typeInfo.strongAgainst.length
        ? typeInfo.strongAgainst.join(', ')
        : 'Nenhuma específica';

    const weakList = Array.isArray(typeInfo.weakAgainst) && typeInfo.weakAgainst.length
        ? typeInfo.weakAgainst.join(', ')
        : 'Nenhuma específica';

    const evolutionText = monster.evolvesTo
        ? `Evolui para ${monster.evolvesTo} no Nv. ${Number(monster.evolutionLevel) || 16}`
        : 'Forma final ou sem evolução cadastrada';

    const tierCardBg = typeof getTierColorClass === 'function'
        ? getTierColorClass(monster.tier || 1)
        : 'bg-gradient-to-b from-amber-950 via-amber-900 to-black border-amber-600';

    const monsterImage = isShiny && monster.shinyImage ? monster.shinyImage : (monster.image || '');
    const auraDetailClass = monster.auraEffect || '';

    const shinyBanner = isShiny
        ? '<div class="bg-amber-400 text-black font-black text-[9px] text-center rounded py-1 animate-pulse">✨ POKÉMON SHINY RARO ✨</div>'
        : '';

    const faintedBanner = isFainted
        ? '<div class="bg-red-950/80 border border-red-500 text-red-200 text-center py-1 rounded text-xs font-black animate-pulse">⚠ ANIMA DESMAIADO, HP 0</div>'
        : '';

    const showVaultButton = monster.uniqueId && (fromArea === 'team' || fromArea === 'pcbox')
        ? `<button onclick="saveMonsterToVault(${JSON.stringify(monster.uniqueId)}); const modal=document.getElementById('pokemon-detail-modal'); if(modal) modal.remove();" class="w-full bg-blue-700 hover:bg-blue-600 text-white font-black py-2 rounded-xl text-xs uppercase shadow transition-all cursor-pointer">📦 Guardar no Cofre Global</button>`
        : '';

    let detailModal = document.getElementById('pokemon-detail-modal');

    if (!detailModal) {
        detailModal = document.createElement('div');
        detailModal.id = 'pokemon-detail-modal';
        detailModal.className = 'fixed inset-0 bg-black/85 z-[350] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(detailModal);
    }

    detailModal.innerHTML = `
        <div class="trainer-card max-w-md w-full p-5 space-y-3 border-4 ${isFainted ? 'border-red-600' : isShiny ? 'border-amber-400 shiny-card-glow' : 'border-amber-500'} ${auraDetailClass} rounded-2xl ${tierCardBg} shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-1.5">
                <span class="text-xs font-black text-amber-400 font-cinzel tracking-wider">FICHA TÉCNICA DO ANIMA</span>
                <button onclick="const modal=document.getElementById('pokemon-detail-modal'); if(modal) modal.remove();" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800">✕</button>
            </div>

            ${shinyBanner}
            ${faintedBanner}

            <div class="grid grid-cols-2 gap-3 items-center">
                <div class="bg-black/60 border-2 border-amber-700/60 p-3 rounded-xl flex flex-col items-center justify-center h-32">
                    <img src="${monsterImage}" alt="${monsterName}" class="w-20 h-20 object-contain drop-shadow-[0_0_10px_rgba(255,215,0,0.6)] ${isFainted ? 'grayscale opacity-50' : ''}" onerror="this.onerror=null;this.src='https://api.iconify.design/noto:video-game.svg';">
                </div>
                <div class="space-y-1.5 text-xs">
                    <div>
                        <h3 class="text-base font-black text-white">${monsterName}</h3>
                        <p class="text-[10px] text-amber-400 font-bold uppercase">Tipo: ${monsterType}</p>
                    </div>
                    <div class="bg-black/40 p-2 rounded-lg border border-amber-900/40 space-y-0.5 text-[10px]">
                        <div class="flex justify-between"><span>Nível:</span><span class="font-bold text-amber-300">Nv. ${level}</span></div>
                        <div class="flex justify-between"><span>Força, STR:</span><span class="font-bold text-amber-300">${strength}</span></div>
                        <div class="flex justify-between"><span>Vida, HP:</span><span class="font-bold ${isFainted ? 'text-red-400' : 'text-emerald-400'}">${currentHp} / ${maxHp}</span></div>
                        <div class="flex justify-between"><span>Tier:</span><span class="font-bold text-purple-300">${monster.tier || 1}</span></div>
                    </div>
                </div>
            </div>

            <div class="bg-black/60 p-2.5 rounded-xl border border-amber-900/60 space-y-1.5 text-[10px]">
                <p class="text-amber-300 font-bold border-b border-amber-900/40 pb-0.5">⚡ Ecossistema de Tipos, TCG</p>
                <div class="text-emerald-400"><span class="font-bold">Vantagem, +30% Dano:</span> ${strongList}</div>
                <div class="text-red-400"><span class="font-bold">Desvantagem, -20% Dano:</span> ${weakList}</div>
            </div>

            <div class="space-y-1 bg-black/50 p-2.5 rounded-xl border border-amber-900/50">
                <div class="flex justify-between text-[10px] font-bold text-slate-300"><span>Experiência, XP:</span><span>${xpCurrent} / 100</span></div>
                <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-amber-900">
                    <div class="bg-gradient-to-r from-amber-500 to-yellow-400 h-full transition-all duration-300" style="width:${Math.min(100, xpCurrent)}%;"></div>
                </div>
                <p class="text-[9px] text-slate-400 text-right pt-0.5">✨ ${evolutionText}</p>
            </div>

            ${showVaultButton}

            <button onclick="const modal=document.getElementById('pokemon-detail-modal'); if(modal) modal.remove();" class="w-full bg-amber-600 hover:bg-amber-500 text-black font-black py-2 rounded-xl text-xs uppercase shadow transition-all cursor-pointer">Fechar Ficha</button>
        </div>
    `;

    detailModal.classList.remove('hidden');
};

// --- USO DE ITENS NA MOCHILA ---

function useInventoryItemMainScreen(itemId) {
    const cp = getCurrentPlayer();
    if (!cp) return;

    if (!Array.isArray(cp.inventory)) cp.inventory = [];
    if (!Array.isArray(cp.activeTeam)) cp.activeTeam = [];

    const item = cp.inventory.find(entry => entry && entry.id === itemId && Number(entry.count) > 0);

    if (!item) {
        showCustomPopup("Sem Itens", "❌ Não tens unidades deste item na mochila!", false);
        return;
    }

    const getHp = monster => Math.max(0, Number(monster.currentHp !== undefined ? monster.currentHp : monster.maxHp || monster.hp || 20) || 0);
    const getMaxHp = monster => Math.max(1, Number(monster.maxHp || monster.hp || 20) || 20);
    const consume = () => { item.count = Math.max(0, (Number(item.count) || 0) - 1); };

    if (item.type === 'heal') {
        const target = cp.activeTeam.find(monster => monster && getHp(monster) < getMaxHp(monster));

        if (!target) {
            showCustomPopup("Aviso", "✨ Todos os Pokémon da equipa ativa já estão com HP máximo!", false);
            return;
        }

        const maxHp = getMaxHp(target);
        const healValue = Math.max(1, Number(item.value) || 20);
        target.currentHp = Math.min(maxHp, getHp(target) + healValue);
        consume();

        showCustomPopup("Item Usado", `💊 ${item.name || 'Potion'} usada em ${target.name}!\nHP recuperado para ${target.currentHp}/${maxHp}.`, true);
        renderTeamCardSlots();
        renderBottomPanel();
        updatePlayerUI();
        return;
    }

    if (item.type === 'revive') {
        const target = cp.activeTeam.find(monster => monster && getHp(monster) <= 0);

        if (!target) {
            showCustomPopup("Aviso", "✨ Não há nenhum Pokémon desmaiado na equipa ativa!", false);
            return;
        }

        const maxHp = getMaxHp(target);
        target.currentHp = Math.max(1, Math.floor(maxHp / 2));
        consume();

        showCustomPopup("Item Usado", `🌟 ${item.name || 'Revive'} usado! ${target.name} foi revivido com ${target.currentHp} HP!`, true);
        renderTeamCardSlots();
        renderBottomPanel();
        updatePlayerUI();
        return;
    }

    if (item.type === 'rarecandy') {
        const target = cp.activeTeam.find(Boolean);

        if (!target) {
            showCustomPopup("Aviso", "⚠️ Não há nenhum Pokémon na equipa ativa.", false);
            return;
        }

        consume();
        addExperienceToMonster(target, 100);
        showCustomPopup("Doce Raro Usado", `🍬 ${item.name || 'Rare Candy'} dado a ${target.name}!\nO Anima recebeu 100 XP.`, true);
        renderBottomPanel();
        return;
    }

    if (item.type === 'evolution') {
        const target = cp.activeTeam.find(monster => monster && monster.evolvesTo);

        if (!target) {
            showCustomPopup("Aviso", "⚠️ Nenhum Pokémon da equipa ativa possui evolução disponível.", false);
            return;
        }

        if (typeof MONSTER_CATALOG === 'undefined' || !Array.isArray(MONSTER_CATALOG)) {
            showCustomPopup("Erro", "❌ O catálogo de Pokémon não está disponível.", false);
            return;
        }

        const nextEvolution = MONSTER_CATALOG.find(monster => monster && monster.id === target.evolvesTo);

        if (!nextEvolution) {
            showCustomPopup("Evolução Indisponível", "❌ A próxima forma evolutiva não foi encontrada no catálogo.", false);
            return;
        }

        const oldName = target.name || 'Pokémon';
        const previousMaxHp = getMaxHp(target);

        target.id = nextEvolution.id || target.id;
        target.name = nextEvolution.name || target.name;
        target.type = nextEvolution.type || target.type;
        target.tier = nextEvolution.tier || target.tier;
        target.rarity = nextEvolution.rarity || target.rarity;
        target.stage = nextEvolution.stage || target.stage;
        target.image = nextEvolution.image || target.image;
        target.shinyImage = nextEvolution.shinyImage || target.shinyImage || null;
        target.evolvesTo = nextEvolution.evolvesTo || null;
        target.evolutionLevel = nextEvolution.evolutionLevel || null;
        target.str = Math.max(Number(target.str) || 4, Number(nextEvolution.str) || 4);
        target.maxHp = Math.max(previousMaxHp + 10, Number(nextEvolution.hp) || previousMaxHp + 10);
        target.currentHp = target.maxHp;

        consume();
        showEvolutionModalUI(oldName, target);
        appendAdventureLog(`✨ ${cp.name} usou uma Evolution Stone: ${oldName} evoluiu para ${target.name}!`);
        renderTeamCardSlots();
        renderBottomPanel();
        updatePlayerUI();
        return;
    }

    showCustomPopup("Informação", `ℹ O item ${item.name || item.id} só pode ser aplicado durante uma batalha, encontro ou em uma área específica.`, true);
}

// --- FLUXO DE GINÁSIO INTEGRADO COM A ARENA TCG ---

let currentGymBattleSession = null;
let gymAttemptedThisTurn = {};

function initiateGymSequence(cityName) {
    const cp = getCurrentPlayer();
    if (!cp) return;

    const requestedCity = String(cityName || '').toLowerCase();
    const gymInfo = typeof GYM_LEADERS_CATALOG !== 'undefined' && Array.isArray(GYM_LEADERS_CATALOG)
        ? GYM_LEADERS_CATALOG.find(gym => gym && String(gym.city || '').toLowerCase() === requestedCity)
        : null;

    if (!gymInfo) {
        showCustomPopup("Aviso", "Este local não possui um ginásio oficial registado.", false);
        return;
    }

    const attemptKey = `${gameState.currentPlayerIndex || 0}_${gymInfo.city}`;
    if (gymAttemptedThisTurn[attemptKey]) {
        showCustomPopup("Tentativa Esgotada", "⚠ Já fizeste a tua tentativa neste ginásio durante este turno. Podes tentar novamente no próximo turno.", false);
        return;
    }

    currentGymBattleSession = {
        gym: gymInfo,
        format: Number(gymInfo.format) || 1,
        challengerTeam: []
    };

    if (typeof openBattleArena === 'function') {
        openBattleArena({
            type: 'gym',
            format: currentGymBattleSession.format,
            data: gymInfo
        });
    } else {
        showGymVsScreen(gymInfo);
    }
}

function showGymVsScreen(gymInfo) {
    if (!gymInfo) return;

    let vsModal = document.getElementById('gym-vs-modal');

    if (!vsModal) {
        vsModal = document.createElement('div');
        vsModal.id = 'gym-vs-modal';
        vsModal.className = 'fixed inset-0 bg-black/95 z-[450] flex flex-col items-center justify-center p-6 text-white backdrop-blur-md';
        document.body.appendChild(vsModal);
    }

    const leaderFileName = gymInfo.leader === 'Misty' ? 'misty' : (gymInfo.leader || 'leader');
    const leaderSpriteUrl = `${SUPABASE_STORAGE_URL}leaders/${encodeURIComponent(leaderFileName)}.png`;
    const leaderTeam = Array.isArray(gymInfo.pokemons) && gymInfo.pokemons.length ? gymInfo.pokemons : gymInfo.pokemon ? [gymInfo.pokemon] : [];

    const leaderPokemonsHtml = leaderTeam.map(pk => `
        <img src="${pk.image || ''}" class="w-12 h-12 object-contain bg-black/60 rounded-xl p-1.5 border border-red-600 shadow" title="${pk.name || 'Pokémon'} Nv.${pk.level || 1}" onerror="this.onerror=null;this.src='https://api.iconify.design/noto:video-game.svg';">
    `).join('');

    vsModal.innerHTML = `
        <div class="text-center space-y-2 mb-8">
            <span class="text-xs font-black text-amber-400 uppercase tracking-widest font-cinzel">Ginásio Oficial de ${gymInfo.city}</span>
            <h2 class="text-2xl font-black text-white font-cinzel tracking-wider">LÍDER ${(gymInfo.leader || 'DESCONHECIDO').toUpperCase()}</h2>
            <p class="text-xs text-amber-300 font-bold">Formato de Batalha: ${gymInfo.format || 1}x${gymInfo.format || 1}</p>
        </div>

        <div class="flex items-center justify-center gap-8 my-4 w-full max-w-2xl">
            <div class="flex flex-col items-center border-4 border-amber-500 rounded-3xl p-5 bg-gradient-to-b from-amber-950 to-black shadow-2xl w-48">
                <img src="${leaderSpriteUrl}" class="w-24 h-24 object-contain mb-2 drop-shadow-[0_0_10px_rgba(255,215,0,0.6)]" onerror="this.onerror=null;this.src='https://api.iconify.design/noto:man-raising-hand.svg';">
                <span class="text-xs font-black text-amber-300 uppercase">Líder</span>
            </div>
            <div class="text-3xl font-black text-red-500 animate-pulse font-cinzel">VS</div>
            <div class="flex flex-col items-center border-4 border-red-600 rounded-3xl p-5 bg-gradient-to-b from-red-950 to-black shadow-2xl w-48 space-y-2">
                <div class="flex flex-wrap justify-center gap-1.5 min-h-[48px]">${leaderPokemonsHtml}</div>
                <span class="text-xs font-black text-red-300 uppercase">Cartel Inimigo</span>
            </div>
        </div>

        <button onclick="document.getElementById('gym-vs-modal').remove();openTeamSelectionModalForGym();" class="mt-8 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-black px-8 py-3 rounded-2xl text-xs uppercase tracking-wider shadow-2xl transition-all cursor-pointer">
            Preparar Equipa e Aceitar Desafio <i class="fa-solid fa-arrow-right ml-1"></i>
        </button>
    `;

    vsModal.classList.remove('hidden');
}

function openTeamSelectionModalForGym() {
    const cp = getCurrentPlayer();
    if (!cp) return;

    const formatLimit = Math.max(1, Number(currentGymBattleSession && currentGymBattleSession.format) || 1);
    let selectedIndices = [];
    let selModal = document.getElementById('team-selection-modal');

    if (!selModal) {
        selModal = document.createElement('div');
        selModal.id = 'team-selection-modal';
        selModal.className = 'fixed inset-0 bg-black/90 z-[400] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(selModal);
    }

    function renderSelectionGrid() {
        const team = Array.isArray(cp.activeTeam) ? cp.activeTeam : [];

        const teamGridHtml = team.map((mon, idx) => {
            const currentHp = Number(mon.currentHp !== undefined ? mon.currentHp : mon.maxHp || mon.hp || 20) || 0;
            const maxHp = Number(mon.maxHp || mon.hp || 20) || 20;
            const isFainted = currentHp <= 0;
            const isSelected = selectedIndices.includes(idx);
            const tierCardBg = typeof getTierColorClass === 'function' ? getTierColorClass(mon.tier || 1) : '';
            const image = mon.isShiny && mon.shinyImage ? mon.shinyImage : (mon.image || '');

            return `
                <div onclick="${isFainted ? '' : `toggleGymTeamSelection(${idx})`}" class="${tierCardBg} ${mon.auraEffect || ''} p-3 rounded-2xl border-2 ${isSelected ? 'border-amber-400 bg-amber-950/80 scale-105' : 'border-amber-900/60'} ${isFainted ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-amber-500'} flex flex-col justify-between h-36 transition-all text-white">
                    <div class="flex justify-between items-center text-[10px] font-bold text-amber-300"><span>${mon.name || 'Pokémon'}</span><span>Nv.${mon.level || 1}</span></div>
                    <div class="my-auto flex justify-center bg-black/40 rounded p-1"><img src="${image}" class="w-14 h-14 object-contain" onerror="this.onerror=null;this.src='https://api.iconify.design/noto:video-game.svg';"></div>
                    <div class="text-[9px] text-center font-bold ${isFainted ? 'text-red-400' : 'text-emerald-400'}">${isFainted ? 'DESMAIADO' : `HP: ${currentHp}/${maxHp}`}</div>
                </div>
            `;
        }).join('');

        const canConfirm = selectedIndices.length === formatLimit;

        selModal.innerHTML = `
            <div class="trainer-card max-w-2xl w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
                <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                    <span class="text-xs font-black text-amber-400 font-cinzel">🛡 SELEÇÃO DE EQUIPA (${selectedIndices.length}/${formatLimit})</span>
                    <button onclick="document.getElementById('team-selection-modal').remove();" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800">✕ Cancelar</button>
                </div>
                <div class="grid grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1">${teamGridHtml || '<p class="col-span-3 text-center text-xs text-slate-400">A equipa está vazia.</p>'}</div>
                <div class="flex gap-2">
                    <button onclick="document.getElementById('team-selection-modal').remove();" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-xs uppercase">Voltar / Desistir</button>
                    <button onclick="confirmGymTeamSelection([${selectedIndices.join(',')}])" ${canConfirm ? '' : 'disabled'} class="flex-1 ${canConfirm ? 'bg-amber-500 hover:bg-amber-400 text-black cursor-pointer' : 'bg-slate-800 text-slate-500 cursor-not-allowed'} font-black py-3 rounded-xl text-xs uppercase">Confirmar e Iniciar</button>
                </div>
            </div>
        `;
    }

    window.toggleGymTeamSelection = function(idx) {
        const position = selectedIndices.indexOf(idx);

        if (position >= 0) selectedIndices.splice(position, 1);
        else if (selectedIndices.length < formatLimit) selectedIndices.push(idx);
        else showCustomPopup("Limite Atingido", `Este ginásio permite apenas ${formatLimit} Pokémon.`, false);

        renderSelectionGrid();
    };

    renderSelectionGrid();
    selModal.classList.remove('hidden');
}

window.confirmGymTeamSelection = function(chosenIndexes) {
    const modal = document.getElementById('team-selection-modal');
    if (modal) modal.remove();

    if (!currentGymBattleSession || !Array.isArray(chosenIndexes) || !chosenIndexes.length) return;

    currentGymBattleSession.challengerTeam = chosenIndexes.map(Number).filter(Number.isInteger);
    executeLockedGymBattleSequence();
};

function executeLockedGymBattleSequence() {
    const cp = getCurrentPlayer();
    if (!cp || !currentGymBattleSession || !currentGymBattleSession.gym) return;

    const gym = currentGymBattleSession.gym;
    const attemptKey = `${gameState.currentPlayerIndex || 0}_${gym.city}`;
    gymAttemptedThisTurn[attemptKey] = true;

    const activeMon = cp.activeTeam[currentGymBattleSession.challengerTeam[0]];
    const leaderTeam = Array.isArray(gym.pokemons) && gym.pokemons.length ? gym.pokemons : gym.pokemon ? [gym.pokemon] : [];
    const leaderPoke = leaderTeam[0];

    if (!activeMon || !leaderPoke) {
        showCustomPopup("Erro", "❌ Não foi possível montar o combate do ginásio.", false);
        return;
    }

    const activeHp = Number(activeMon.currentHp !== undefined ? activeMon.currentHp : activeMon.maxHp || activeMon.hp || 20) || 0;

    if (activeHp <= 0) {
        showCustomPopup("Derrota", "⚠️ O Pokémon escolhido está desmaiado.", false);
        return;
    }

    rollDiceWithAnimation((playerDice, leaderDice) => {
        const typeMult = typeof calculateTypeAdvantageMultiplier === 'function'
            ? calculateTypeAdvantageMultiplier(activeMon.type, leaderPoke.type)
            : 1;

        const playerPower = Math.round((Number(activeMon.str) || 4) * typeMult) + Number(playerDice || 0);
        const leaderPower = (Number(leaderPoke.str) || 5) + Number(leaderDice || 0);

        if (playerPower >= leaderPower) {
            if (!Array.isArray(cp.badges)) cp.badges = [];
            if (gym.badgeKey && !cp.badges.includes(gym.badgeKey)) cp.badges.push(gym.badgeKey);

            cp.gold = (Number(cp.gold) || 0) + (Number(gym.rewardGold) || 0);
            addExperienceToMonster(activeMon, 70);
            updatePlayerUI();
            renderTeamCardSlots();
            appendAdventureLog(`${cp.name} conquistou a insígnia de ${gym.city} contra o Líder ${gym.leader}!`);

            showCustomPopup(
                `🏆 VITÓRIA NO GINÁSIO DE ${String(gym.city).toUpperCase()}!`,
                `Derrotaste o Líder ${gym.leader}!\n\n✨ Ganhaste a Insígnia oficial!\n💰 Ouro: +${Number(gym.rewardGold) || 0}\n🎖️ Total de Insígnias: ${cp.badges.length} / 6`,
                true
            );
        } else {
            const damage = 20;
            const maxHp = Number(activeMon.maxHp || activeMon.hp || 20) || 20;
            const currentHp = Number(activeMon.currentHp !== undefined ? activeMon.currentHp : maxHp) || 0;
            activeMon.currentHp = Math.max(0, currentHp - damage);
            renderTeamCardSlots();

            showCustomPopup(
                `💥 DERROTA CONTRA ${String(gym.leader || 'LÍDER').toUpperCase()}`,
                `O ${leaderPoke.name || 'Pokémon do líder'} foi superior nesta ronda.\n\n💔 ${activeMon.name} sofreu ${damage} de dano!\n\n⚠ A tentativa do ginásio foi esgotada neste turno.`,
                false
            );
        }
    });
}

// --- INTERAÇÃO ENTRE JOGADORES NA MESMA CASA ---

function checkPlayerCellCollision(zoneId, movedPlayerIndex) {
    if (!gameState || !Array.isArray(gameState.players) || gameState.players.length <= 1) return;

    const currentMover = gameState.players[movedPlayerIndex];
    if (!currentMover) return;

    const cooccupant = gameState.players.find((player, index) =>
        index !== movedPlayerIndex && player && player.currentZone === zoneId
    );

    if (cooccupant) openMultiplayerInteractionModal(currentMover, cooccupant);
}

function openMultiplayerInteractionModal(playerA, playerB) {
    if (!playerA || !playerB) return;

    let interModal = document.getElementById('mp-interaction-modal');

    if (!interModal) {
        interModal = document.createElement('div');
        interModal.id = 'mp-interaction-modal';
        interModal.className = 'fixed inset-0 bg-black/85 z-[380] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(interModal);
    }

    const playerBIndex = Array.isArray(gameState.players)
        ? gameState.players.indexOf(playerB)
        : -1;

    interModal.innerHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-purple-500 rounded-2xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-purple-900 pb-2">
                <span class="text-xs font-black text-purple-400 font-cinzel">🤝 ENCONTRO DE TREINADORES</span>
                <button onclick="document.getElementById('mp-interaction-modal').remove()" class="text-purple-400 font-bold text-sm px-2 bg-purple-950 rounded cursor-pointer">✕</button>
            </div>

            <p class="text-xs text-slate-300 text-center">
                <span class="text-amber-300 font-bold">${playerA.name || 'Treinador'}</span> e
                <span class="text-amber-300 font-bold">${playerB.name || 'Treinador'}</span> pararam na mesma casa!
            </p>

            <div class="space-y-2.5">
                <button onclick="document.getElementById('mp-interaction-modal').remove();triggerPvPBattleArena(${JSON.stringify(playerB.name || '')});" class="w-full bg-red-700 hover:bg-red-600 text-white font-black py-2.5 rounded-xl text-xs uppercase shadow">⚔️ Desafiar para Batalha PvP</button>
                <button onclick="document.getElementById('mp-interaction-modal').remove();openTradeModal(${JSON.stringify(playerA.name || '')},${JSON.stringify(playerB.name || '')});" class="w-full bg-blue-700 hover:bg-blue-600 text-white font-black py-2.5 rounded-xl text-xs uppercase shadow">🔄 Propor Troca</button>
                <button onclick="document.getElementById('mp-interaction-modal').remove();openSpecificTrainerCardModal(${playerBIndex});" class="w-full bg-amber-700 hover:bg-amber-600 text-black font-black py-2.5 rounded-xl text-xs uppercase shadow">📋 Ver Trainer Card</button>
            </div>

            <button onclick="document.getElementById('mp-interaction-modal').remove()" class="w-full bg-slate-800 text-slate-300 font-bold py-2 rounded-xl text-xs">Continuar Viagem</button>
        </div>
    `;

    interModal.classList.remove('hidden');
}

function triggerPvPBattleArena(opponentName) {
    const opponent = Array.isArray(gameState.players)
        ? gameState.players.find(player => player && player.name === opponentName)
        : null;

    if (!opponent) {
        showCustomPopup("Erro", "❌ Jogador adversário não encontrado.", false);
        return;
    }

    if (typeof openBattleArena === 'function') {
        openBattleArena({ type: 'pvp', format: 1, opponent });
    } else {
        showCustomPopup("Erro", "Módulo da Arena de Batalha indisponível.", false);
    }
}

// --- SISTEMA DE ENCONTRO / BATALHA TCG ---

function openEncounterModalWithPokemon(pokemon) {
    const cp = getCurrentPlayer();
    const modal = document.getElementById('encounter-modal');

    if (!cp || !modal || !pokemon) return;
    if (!Array.isArray(cp.activeTeam)) cp.activeTeam = [];

    if (!cp.activeTeam.length) {
        showCustomPopup("Aviso", "🚫 Precisas de pelo menos um Pokémon na Equipa Ativa!", false);
        return;
    }

    const validIndex = cp.activeTeam.findIndex(mon => {
        if (!mon) return false;
        return Number(mon.currentHp !== undefined ? mon.currentHp : mon.maxHp || mon.hp || 20) > 0;
    });

    if (validIndex < 0) {
        showCustomPopup("Equipa Desmaiada!", "⚠ Todos os Pokémon da equipa ativa estão desmaiados.", false);
        return;
    }

    currentEncounterState.wildPokemon = pokemon;
    currentEncounterState.itemBonus = 0;
    currentEncounterState.battlePowerBonus = 0;
    currentEncounterState.selectedTeamMemberIndex = validIndex;
    currentEncounterState.hasAttemptedCapture = false;

    updateEncounterUIInfo();
    renderEncounterItemsList();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cyclePlayerEncounterPokemon() {
    const cp = getCurrentPlayer();
    if (!cp || !Array.isArray(cp.activeTeam) || cp.activeTeam.length <= 1) return;

    const startIndex = Number(currentEncounterState.selectedTeamMemberIndex) || 0;
    let nextIndex = (startIndex + 1) % cp.activeTeam.length;

    while (nextIndex !== startIndex) {
        const monster = cp.activeTeam[nextIndex];
        const hp = monster ? Number(monster.currentHp !== undefined ? monster.currentHp : monster.maxHp || monster.hp || 20) : 0;

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

    if (!cp || !Array.isArray(cp.inventory)) return;

    cp.inventory.forEach((item, index) => {
        if (!item || Number(item.count) <= 0) return;

        const button = document.createElement('button');
        button.className = 'bg-blue-900/60 hover:bg-blue-800 text-blue-200 px-2.5 py-1 rounded-lg border border-blue-600 text-[10px] flex items-center gap-1.5 shadow cursor-pointer';

        const itemImage = item.image
            ? `<img src="${item.image}" class="w-4 h-4 object-contain" onerror="this.onerror=null;this.src='https://api.iconify.design/noto:package.svg';">`
            : `<span>${item.icon || '🎒'}</span>`;

        button.innerHTML = `${itemImage}<span>${item.name || item.id} (${item.count})</span>`;
        button.onclick = () => useItemInEncounter(item, index);
        container.appendChild(button);
    });
}

function useItemInEncounter(item, itemIndex) {
    const cp = getCurrentPlayer();
    if (!cp || !item || !Array.isArray(cp.activeTeam)) return;

    const activeMon = cp.activeTeam[currentEncounterState.selectedTeamMemberIndex];
    if (!activeMon || Number(item.count) <= 0) return;

    const maxHp = Number(activeMon.maxHp || activeMon.hp || 20) || 20;
    const currentHp = Number(activeMon.currentHp !== undefined ? activeMon.currentHp : maxHp) || 0;

    if (item.type === 'sphere') {
        item.count--;
        currentEncounterState.itemBonus = Number(item.value) || 0;

        if (item.aura) selectedBallAura = item.aura;

        showCustomPopup("Poké Ball Lançada", `🔴 Lançaste uma ${item.name || 'Poké Ball'}!\nBónus aplicado: +${Number(item.value) || 0}`, true);
        renderEncounterItemsList();
        updateEncounterUIInfo();
        resolveCaptureAttempt();
        return;
    }

    if (item.type === 'battle') {
        item.count--;
        currentEncounterState.battlePowerBonus += Number(item.value) || 2;
        showCustomPopup("Item Usado", `⚔️ ${item.name || 'Item'} aplicada! Bónus de combate aumentado.`, true);
        renderEncounterItemsList();
        updateEncounterUIInfo();
        return;
    }

    if (item.type === 'heal') {
        if (currentHp >= maxHp) {
            showCustomPopup("Aviso", `${activeMon.name} já está com HP máximo!`, false);
            return;
        }

        item.count--;
        activeMon.currentHp = Math.min(maxHp, currentHp + (Number(item.value) || 20));
        showCustomPopup("Item Usado", `💊 Potion usada em ${activeMon.name}!`, true);
        renderEncounterItemsList();
        updateEncounterUIInfo();
        renderTeamCardSlots();
        return;
    }

    if (item.type === 'revive') {
        if (currentHp > 0) {
            showCustomPopup("Aviso", `${activeMon.name} não está desmaiado!`, false);
            return;
        }

        item.count--;
        activeMon.currentHp = Math.max(1, Math.floor(maxHp / 2));
        showCustomPopup("Item Usado", `🌟 Revive usado em ${activeMon.name}!`, true);
        renderEncounterItemsList();
        updateEncounterUIInfo();
        renderTeamCardSlots();
    }
}

// --- ROLAGEM DE DADO ---

function rollDiceWithAnimation(callback) {
    if (typeof callback !== 'function') return;

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
                <div class="text-7xl my-4 text-amber-400">${randomFace}</div>
                <p class="text-xs text-slate-300 font-bold">A sortear valor aleatório, 1 a 6</p>
            </div>
        `;

        diceOverlay.classList.remove('hidden');
        counter++;

        if (counter > 12) {
            clearInterval(interval);

            const playerRoll = Math.floor(Math.random() * 6) + 1;
            const enemyRoll = Math.floor(Math.random() * 6) + 1;

            diceOverlay.innerHTML = `
                <div class="trainer-card max-w-xs w-full p-8 text-center space-y-4 border-4 border-amber-400 rounded-3xl bg-gradient-to-b from-amber-950 to-black shadow-2xl animate-bounce">
                    <h3 class="text-lg font-black text-emerald-400 font-cinzel tracking-widest">DADO SORTEADO!</h3>
                    <div class="text-7xl my-4 text-amber-300">${diceFaces[playerRoll - 1]}</div>
                    <p class="text-sm font-black text-white bg-black/60 p-2 rounded-xl">Resultado: <span class="text-amber-400 text-lg">+${playerRoll}</span></p>
                </div>
            `;

            setTimeout(() => {
                if (diceOverlay && diceOverlay.parentNode) diceOverlay.remove();
                callback(playerRoll, enemyRoll);
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
            <div class="text-xs text-slate-200 whitespace-pre-line leading-relaxed bg-black/40 p-3 rounded-xl border border-amber-900/50">${message}</div>
            <button onclick="document.getElementById('game-custom-popup').remove()" class="w-full bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-400 text-black font-black py-2.5 rounded-xl text-xs uppercase shadow transition-all cursor-pointer">Continuar</button>
        </div>
    `;

    popupEl.classList.remove('hidden');
}

function resolveCaptureAttempt() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;

    if (!cp || !wild || !Array.isArray(cp.activeTeam)) return;

    const activeMon = cp.activeTeam[currentEncounterState.selectedTeamMemberIndex];

    let requiredTarget = 4;
    const tier = Number(wild.tier) || 1;
    const isLegendary = tier === 5 || String(wild.color || '').toLowerCase() === 'amarelo';

    if (tier === 2) requiredTarget = 5;
    else if (tier === 3 || tier === 4) requiredTarget = 6;
    else if (isLegendary) requiredTarget = 7;
    if (wild.isShiny) requiredTarget++;

    const weakenedBonus = wild.weakened && !isLegendary ? 1 : 0;

    rollDiceWithAnimation(roll => {
        const itemBonus = Number(currentEncounterState.itemBonus) || 0;
        const totalValue = roll + itemBonus + weakenedBonus;
        const success = totalValue >= requiredTarget;

        if (success) {
            showCustomPopup(
                "🔴🔵 CAPTURA BEM-SUCEDIDA!",
                `Capturaste o ${wild.isShiny ? '✨ Shiny ' : ''}${wild.name} (Nv. ${wild.level || 1})!\n\nDado: ${roll} + Bónus: ${itemBonus + weakenedBonus} = ${totalValue} vs Alvo ${requiredTarget}+`,
                true
            );

            addMonsterToPlayer(wild);

            if (wild.waypointId) {
                cp.currentZone = wild.waypointId;
                if (typeof boardPokemonCards !== 'undefined') delete boardPokemonCards[wild.waypointId];
            }

            if (typeof renderBoardMap === 'function') renderBoardMap();
            if (activeMon && Number(activeMon.currentHp) > 0) addExperienceToMonster(activeMon, 30);
            closeEncounterModalUI();
            return;
        }

        if (!isLegendary) {
            wild.weakened = true;
            if (wild.waypointId && typeof boardPokemonCards !== 'undefined' && boardPokemonCards[wild.waypointId]) {
                boardPokemonCards[wild.waypointId].weakened = true;
            }
        }

        if (wild.waypointId) cp.currentZone = wild.waypointId;
        if (typeof renderBoardMap === 'function') renderBoardMap();

        showCustomPopup(
            "❌ A CAPTURA FALHOU!",
            `O ${wild.name} libertou-se!\n\nDado: ${roll} + Bónus: ${itemBonus + weakenedBonus} = ${totalValue} | Necessário: ${requiredTarget}+${!isLegendary ? '\n\n🩹 O Pokémon ficou enfraquecido e recebeu +1 na próxima tentativa.' : ''}`,
            false
        );

        updateEncounterUIInfo();
    });
}

function fleeEncounter() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;

    if (cp && wild && wild.waypointId) cp.currentZone = wild.waypointId;

    showCustomPopup("Fuga", "🏃‍♂️ Afastaste-te do Pokémon com segurança!", true);
    closeEncounterModalUI();
    if (typeof renderBoardMap === 'function') renderBoardMap();
}

function closeEncounterModalUI() {
    const modal = document.getElementById('encounter-modal');
    if (!modal) return;

    modal.classList.remove('flex');
    modal.classList.add('hidden');
}

function checkMonsterEvolution(monster) {
    if (!monster || !monster.evolvesTo || typeof MONSTER_CATALOG === 'undefined') return;
    if ((Number(monster.level) || 1) < (Number(monster.evolutionLevel) || 16)) return;

    const nextEvolution = MONSTER_CATALOG.find(mon => mon && mon.id === monster.evolvesTo);
    if (!nextEvolution) return;

    const oldName = monster.name || 'Pokémon';

    monster.id = nextEvolution.id || monster.id;
    monster.name = nextEvolution.name || monster.name;
    monster.type = nextEvolution.type || monster.type;
    monster.tier = nextEvolution.tier || monster.tier;
    monster.rarity = nextEvolution.rarity || monster.rarity;
    monster.stage = nextEvolution.stage || monster.stage;
    monster.image = nextEvolution.image || monster.image;
    monster.shinyImage = nextEvolution.shinyImage || monster.shinyImage || null;
    monster.evolvesTo = nextEvolution.evolvesTo || null;
    monster.evolutionLevel = nextEvolution.evolutionLevel || null;
    monster.str = Math.max(Number(monster.str) || 4, Number(nextEvolution.str) || 4);

    const oldMaxHp = Number(monster.maxHp || monster.hp || 20) || 20;
    monster.maxHp = Math.max(oldMaxHp + 10, Number(nextEvolution.hp) || oldMaxHp + 10);
    monster.currentHp = monster.maxHp;

    appendAdventureLog(`✨ O ${oldName} evoluiu para ${monster.name}!`);
    showEvolutionModalUI(oldName, monster);
}

function showEvolutionModalUI(oldName, evolvedMonster) {
    if (!evolvedMonster) return;

    let evoModal = document.getElementById('evolution-popup-modal');

    if (!evoModal) {
        evoModal = document.createElement('div');
        evoModal.id = 'evolution-popup-modal';
        evoModal.className = 'fixed inset-0 bg-black/90 z-[300] flex items-center justify-center p-4';
        document.body.appendChild(evoModal);
    }

    const image = evolvedMonster.isShiny && evolvedMonster.shinyImage
        ? evolvedMonster.shinyImage
        : evolvedMonster.image || '';

    evoModal.innerHTML = `
        <div class="trainer-card max-w-sm w-full p-6 text-center space-y-4 border-4 border-amber-400 rounded-2xl bg-gradient-to-b from-amber-950 to-black shadow-2xl">
            <h2 class="text-lg font-black text-amber-300 font-cinzel">✨ EVOLUÇÃO! ✨</h2>
            <p class="text-xs text-slate-300">O teu <span class="font-bold text-white">${oldName}</span> está a evoluir...</p>
            <div class="my-3 flex justify-center"><img src="${image}" alt="${evolvedMonster.name}" class="w-24 h-24 object-contain" onerror="this.onerror=null;this.src='https://api.iconify.design/noto:star.svg';"></div>
            <h3 class="text-xl font-black text-amber-400 uppercase">${evolvedMonster.name}!</h3>
            <p class="text-[10px] text-emerald-400 font-bold">STR ${evolvedMonster.str} | HP ${evolvedMonster.maxHp}</p>
            <button onclick="document.getElementById('evolution-popup-modal').remove()" class="w-full bg-amber-500 hover:bg-amber-400 text-black font-black py-2.5 rounded-xl text-xs uppercase">Continuar Aventura</button>
        </div>
    `;

    evoModal.classList.remove('hidden');
}

function addExperienceToMonster(monster, amount) {
    if (!monster) return;

    monster.xp = Math.max(0, Number(monster.xp) || 0) + (Number(amount) || 0);

    while (monster.xp >= 100) {
        monster.xp -= 100;
        monster.level = (Number(monster.level) || 1) + 1;
        monster.maxHp = (Number(monster.maxHp || monster.hp || 20) || 20) + 2;
        monster.currentHp = Math.min(monster.maxHp, (Number(monster.currentHp) || monster.maxHp) + 2);
        monster.str = (Number(monster.str) || 4) + 1;

        appendAdventureLog(`📈 ${monster.name} subiu para o Nível ${monster.level}!`);
        checkMonsterEvolution(monster);
    }

    renderTeamCardSlots();
}

function handleDragStart(event, sourceArea, index) {
    if (!event || !event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', JSON.stringify({ sourceArea, index }));
}

function handleDragOver(event) {
    if (event) event.preventDefault();
}

function handleDrop(event, targetArea, targetIndex) {
    if (!event) return;
    event.preventDefault();

    const cp = getCurrentPlayer();
    if (!cp || !event.dataTransfer) return;

    const rawData = event.dataTransfer.getData('text/plain');
    if (!rawData) return;

    try {
        const data = JSON.parse(rawData);
        if (!data || !data.sourceArea) return;

        if (!Array.isArray(cp.activeTeam)) cp.activeTeam = [];
        if (!Array.isArray(cp.pcBox)) cp.pcBox = [];

        const sourceList = data.sourceArea === 'team' ? cp.activeTeam : cp.pcBox;
        const targetList = targetArea === 'team' ? cp.activeTeam : cp.pcBox;
        const sourceIndex = Number(data.index);
        const movedMonster = sourceList[sourceIndex];

        if (!movedMonster) return;

        if (targetArea === 'team') {
            if (targetList.length >= 6 && data.sourceArea !== 'team') {
                showCustomPopup("Equipa Cheia", "⚠️ A Equipa Ativa já possui seis Pokémon.", false);
                return;
            }

            const tier = Number(movedMonster.tier) || 1;
            const badgeCount = Array.isArray(cp.badges) ? cp.badges.length : 0;

            if (tier === 3 && badgeCount < 1) {
                showCustomPopup("Portão de Insígnia", "⚠️ Precisas de pelo menos uma insígnia para usar um Pokémon Tier 3.", false);
                return;
            }

            if (tier === 4 && badgeCount < 3) {
                showCustomPopup("Portão de Insígnia", "⚠️ Precisas de pelo menos três insígnias para usar um Pokémon Tier 4.", false);
                return;
            }

            if (tier === 5 && badgeCount < 4) {
                showCustomPopup("Portão de Insígnia", "⚠️ Precisas de pelo menos quatro insígnias para usar um Pokémon Tier 5.", false);
                return;
            }
        }

        sourceList.splice(sourceIndex, 1);

        if (targetArea === 'team') targetList.push(movedMonster);
        else targetList.splice(Math.max(0, Number(targetIndex) || 0), 0, movedMonster);

        renderTeamCardSlots();
        renderBottomPanel();
    } catch (error) {
        console.error('Erro ao mover Pokémon:', error);
    }
}

function renderTeamCardSlots() {
    const cp = getCurrentPlayer();
    if (!cp) return;

    if (!Array.isArray(cp.activeTeam)) cp.activeTeam = [];

    for (let i = 0; i < 6; i++) {
        const slotContainer = document.getElementById(`trainer-card-slot-${i}`);
        if (!slotContainer) continue;

        const monster = cp.activeTeam[i];

        if (!monster) {
            slotContainer.innerHTML = `<div ondragover="handleDragOver(event)" ondrop="handleDrop(event,'team',${i})" class="border border-dashed border-amber-500/40 rounded bg-black/20 flex items-center justify-center text-[9px] text-amber-500/50 h-full">Vazio</div>`;
            continue;
        }

        const currentHp = Number(monster.currentHp !== undefined ? monster.currentHp : monster.maxHp || monster.hp || 20) || 0;
        const maxHp = Number(monster.maxHp || monster.hp || 20) || 20;
        const isFainted = currentHp <= 0;
        const image = monster.isShiny && monster.shinyImage ? monster.shinyImage : monster.image || '';
        const tierCardBg = typeof getTierColorClass === 'function' ? getTierColorClass(monster.tier || 1) : '';
        const shinyMarker = monster.isShiny ? '<span class="absolute top-0.5 right-0.5 text-[7px] font-black bg-amber-400 text-black px-1 rounded animate-pulse">✨SHINY</span>' : '';

        slotContainer.innerHTML = `
            <div draggable="true" ondragstart="handleDragStart(event,'team',${i})" ondragover="handleDragOver(event)" ondrop="handleDrop(event,'team',${i})" onclick="event.stopPropagation();openPokemonDetailModal(${JSON.stringify(monster.uniqueId || monster.id)},'team')" class="${tierCardBg} ${isFainted ? 'from-red-950 to-red-900 border-red-600 text-red-200' : 'border-amber-600'} ${monster.isShiny ? 'shiny-card-glow' : ''} ${monster.auraEffect || ''} border rounded p-1 flex flex-col justify-between h-full shadow cursor-pointer relative text-white">
                ${shinyMarker}
                <div class="flex justify-between items-center text-[8px] font-bold"><span class="truncate">${monster.name || 'Pokémon'}</span><span>Nv.${monster.level || 1}</span></div>
                <div class="my-auto bg-black/40 rounded border border-amber-400/50 flex items-center justify-center p-0.5 h-12 relative">
                    <img src="${image}" alt="${monster.name || 'Pokémon'}" class="w-full h-14 object-contain ${isFainted ? 'grayscale opacity-50' : ''}" onerror="this.onerror=null;this.src='https://api.iconify.design/noto:video-game.svg';">
                    ${isFainted ? '<span class="absolute text-[8px] font-black bg-red-600 text-white px-1 rounded">DESMAIADO</span>' : ''}
                </div>
                <div class="text-[7px] text-center font-bold text-amber-300">HP: ${currentHp}/${maxHp} | STR: ${monster.str || 4}</div>
            </div>
        `;
    }
}

window.switchBottomView = function(viewType) {
    gameState.currentBottomView = viewType === 'pcbox' ? 'pcbox' : 'inventory';
    renderBottomPanel();
};
// --- PC BOX COM PAGINAÇÃO DINÂMICA (12 por página) ---
/* [duplicatas removidas] */
;
// --- PASSAR A VEZ ---
function passTurnToNextPlayer() {
    if (typeof gymAttemptedThisTurn !== 'undefined') {
        gymAttemptedThisTurn = {};
    }

    if (!gameState || typeof gameState !== 'object') return;
    if (!Array.isArray(gameState.players) || gameState.players.length === 0) return;

    if (typeof movementState !== 'undefined') {
        movementState.hasRolledThisTurn = false;
        movementState.isMoving = false;
        movementState.diceRolledValue = 0;
        movementState.validDestinations = [];
    }

    gameState.pcBoxCurrentPage = 0;

    const isSolo = gameState.players.length <= 1;

    if (isSolo) {
        gameState.currentPlayerIndex = 0;
        gameState.turn = Math.max(1, Number(gameState.turn) || 1) + 1;

        const cpSolo = getCurrentPlayer();

        if (typeof initGameEngine === 'function') {
            initGameEngine();
        } else if (typeof updatePlayerUI === 'function') {
            updatePlayerUI();
        }

        if (typeof showCustomPopup === 'function') {
            showCustomPopup(
                "🎲 Novo Turno",
                "Você pode rolar o dado novamente para continuar sua aventura solo!",
                true
            );
        }

        if (typeof appendAdventureLog === 'function') {
            appendAdventureLog(
                `Novo turno iniciado para ${cpSolo?.name || 'Treinador'}.`
            );
        }

        if (typeof persistCurrentGameState === 'function') {
            persistCurrentGameState();
        } else if (typeof saveGameProgress === 'function') {
            saveGameProgress();
        }

        return;
    }

    const currentIndex = Number(gameState.currentPlayerIndex) || 0;
    gameState.currentPlayerIndex =
        (currentIndex + 1) % gameState.players.length;

    if (gameState.currentPlayerIndex === 0) {
        gameState.turn = Math.max(1, Number(gameState.turn) || 1) + 1;
    }

    const cp = getCurrentPlayer();

    if (typeof showCustomPopup === 'function') {
        showCustomPopup(
            "🔄 Mudança de Turno",
            `Agora é a vez do treinador:\n\n⭐ ${cp?.name || 'Treinador'} ⭐\n\nPrepare o dispositivo!`,
            true
        );
    }

    if (typeof initGameEngine === 'function') {
        initGameEngine();
    }

    if (typeof moveTokenToWaypoint === 'function' && cp?.currentZone) {
        moveTokenToWaypoint(cp.currentZone);
    }

    if (typeof appendAdventureLog === 'function') {
        appendAdventureLog(
            `Turno passado para ${cp?.name || 'Treinador'}.`
        );
    }

    if (typeof persistCurrentGameState === 'function') {
        persistCurrentGameState();
    } else if (typeof saveGameProgress === 'function') {
        saveGameProgress();
    }
}
function renderChatMessages() {
    const chatBox = document.getElementById('chat-messages-box');
    const lobbyChatBox = document.getElementById('lobby-chat-messages');

    const validMessages = (
        gameState &&
        Array.isArray(gameState.chatMessages)
    )
        ? gameState.chatMessages
        : [{
            sender: 'Sistema',
            text: 'Bem-vindo ao Pokémon Master Trainer HEX Edition!'
        }];

    const renderInto = (container) => {
        if (!container) return;

        container.innerHTML = '';

        validMessages.forEach((msg) => {
            const paragraph = document.createElement('p');
            paragraph.className = 'text-[9px] text-amber-300 my-0.5';

            const sender = document.createElement('span');
            sender.className = 'font-bold text-amber-400';
            sender.textContent = `[${msg?.sender || 'Sistema'}]: `;

            paragraph.appendChild(sender);
            paragraph.appendChild(
                document.createTextNode(String(msg?.text || ''))
            );

            container.appendChild(paragraph);
        });

        container.scrollTop = container.scrollHeight;
    };

    renderInto(chatBox);
    renderInto(lobbyChatBox);
}
function updatePlayerUI() {
    const cp = getCurrentPlayer();
    if (!cp) return;

    if (!Array.isArray(cp.badges)) cp.badges = [];
    if (!Number.isFinite(Number(cp.gold))) cp.gold = 0;
    if (!Number.isFinite(Number(cp.currentZone))) cp.currentZone = 5;

    const turnEl = document.getElementById('turn-counter');
    if (turnEl) {
        turnEl.innerText = String(Math.max(1, Number(gameState.turn) || 1));
    }

    const goldEl = document.getElementById('gold-counter');
    if (goldEl) {
        goldEl.innerText = String(cp.gold);
    }

    const badgesEl = document.getElementById('badges-counter');
    if (badgesEl) {
        badgesEl.innerText = `${cp.badges.length} / 6`;
    }

    const avatarImg = document.getElementById('trainer-avatar-img');
    if (avatarImg) {
        const avatarId = Math.max(1, Math.min(8, Number(cp.avatarId) || 1));
        avatarImg.src = `${SUPABASE_STORAGE_URL}player_0${avatarId}.png`;
    }

    const cardNameDisplay = document.getElementById('trainer-card-name-display');
    if (cardNameDisplay) {
        cardNameDisplay.innerText = cp.name || 'Treinador';
    }

    const loc = document.getElementById('current-location');
    if (loc) {
        const players = Array.isArray(gameState.players)
            ? gameState.players
            : [];

        loc.innerText = players.length > 1
            ? `Vez de: ${cp.name || 'Treinador'} | Local: Zona #${cp.currentZone}`
            : `Local: Zona #${cp.currentZone}`;
    }

    if (typeof updateTrainerCardBadges === 'function') {
        updateTrainerCardBadges(cp);
    }

    if (typeof checkAndRenderPassTurnButton === 'function') {
        checkAndRenderPassTurnButton();
    }
}
window.zoomMap = function(action) {
    const wrapper =
        document.getElementById('map-zoom-wrapper') ||
        document.querySelector('#board-path .map-container');

    if (!wrapper) return;

    if (action === 'in') {
        currentMapZoom = Math.min(currentMapZoom + 0.15, 1.8);
    } else if (action === 'out') {
        currentMapZoom = Math.max(currentMapZoom - 0.15, 0.6);
    } else if (action === 'reset') {
        currentMapZoom = 1.0;
    } else {
        return;
    }

    wrapper.style.transform = `scale(${currentMapZoom})`;
    wrapper.style.transformOrigin = 'center center';
};
// --- PC BOX COM PAGINAÇÃO DINÂMICA (12 POR PÁGINA) ---
function renderBottomPanel() {
    const cp = typeof getCurrentPlayer === 'function' ? getCurrentPlayer() : null;
    const container = document.getElementById('bottom-dynamic-container');
    const titleElement = document.getElementById('bottom-panel-title');

    if (!container || !cp || !gameState || typeof gameState !== 'object') return;

    if (!Array.isArray(cp.inventory)) cp.inventory = [];
    if (!Array.isArray(cp.pcBox)) cp.pcBox = [];

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const getMonsterImage = (monster) => {
        if (!monster) return '';

        if (monster.isShiny && monster.shinyImage) {
            return monster.shinyImage;
        }

        if (monster.image) {
            return monster.image;
        }

        if (
            monster.dexNumber &&
            typeof SUPABASE_STORAGE_URL !== 'undefined' &&
            SUPABASE_STORAGE_URL
        ) {
            const dexNumber = String(monster.dexNumber).padStart(3, '0');

            if (monster.isShiny) {
                return `${SUPABASE_STORAGE_URL}monsters/shiny/${dexNumber}.png`;
            }

            return `${SUPABASE_STORAGE_URL}monsters/${dexNumber}.png`;
        }

        return '';
    };

    container.innerHTML = '';

    if (gameState.currentBottomView === 'inventory') {
        if (titleElement) {
            titleElement.innerText =
                'Mochila (Itens & Orbes) - Clique em um item para usar';
        }

        const validItems = cp.inventory.filter((item) => {
            if (!item) return false;

            const quantity = Number(item.count);
            return Number.isFinite(quantity) && quantity > 0;
        });

        if (validItems.length === 0) {
            container.innerHTML = `
                <p class="text-[10px] text-slate-400 col-span-4 text-center py-4">
                    A mochila está vazia.
                </p>
            `;
            return;
        }

        validItems.forEach((item) => {
            const quantity = Number(item.count);
            const itemName = escapeHtml(item.name || 'Item');
            const itemDescription = escapeHtml(item.desc || '');
            const itemIcon = escapeHtml(item.icon || '🎒');
            const itemImage = item.image ? escapeHtml(item.image) : '';

            const slot = document.createElement('div');
            slot.className =
                'flex flex-col justify-between p-2 border border-amber-700 bg-black/80 rounded-xl h-24 shadow cursor-pointer hover:border-amber-400 transition-all text-white relative';

            slot.setAttribute('role', 'button');
            slot.setAttribute('tabindex', '0');
            slot.setAttribute('aria-label', `Usar ${itemName}`);

            const useItem = () => {
                if (typeof useInventoryItemMainScreen === 'function') {
                    useInventoryItemMainScreen(item.id);
                }
            };

            slot.onclick = useItem;
            slot.onkeydown = (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    useItem();
                }
            };

            const itemVisual = itemImage
                ? `
                    <img
                        src="${itemImage}"
                        alt="${itemName}"
                        class="w-10 h-10 object-contain drop-shadow"
                        onerror="this.onerror=null; this.src='https://api.iconify.design/noto:package.svg'"
                    >
                `
                : `<span class="text-2xl">${itemIcon}</span>`;

            slot.innerHTML = `
                <div class="flex justify-between items-center text-[10px] font-bold gap-1">
                    <span class="text-amber-300 truncate">${itemName}</span>
                    <span class="bg-amber-600 text-black font-black text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        Qtd: ${quantity}
                    </span>
                </div>

                <div class="flex justify-center items-center my-auto">
                    ${itemVisual}
                </div>

                <div class="text-[8px] text-slate-400 text-center truncate">
                    ${itemDescription}
                </div>
            `;

            container.appendChild(slot);
        });

        return;
    }

    const pageSize = 12;
    const totalBoxes = cp.pcBox.length;
    const maxPages = Math.max(0, Math.ceil(totalBoxes / pageSize) - 1);

    let currentPage = Number(gameState.pcBoxCurrentPage);

    if (!Number.isFinite(currentPage)) {
        currentPage = 0;
    }

    currentPage = Math.max(0, Math.min(Math.floor(currentPage), maxPages));
    gameState.pcBoxCurrentPage = currentPage;

    if (titleElement) {
        const previousDisabled = currentPage <= 0;
        const nextDisabled = currentPage >= maxPages;

        titleElement.innerHTML = `
            <div class="flex items-center justify-between gap-2 w-full">
                <span>
                    Banco PC Box, Página ${currentPage + 1} de ${maxPages + 1}
                </span>

                <div class="flex gap-2">
                    <button
                        type="button"
                        onclick="changePcBoxPage(-1)"
                        class="bg-amber-600 hover:bg-amber-500 ${
                            previousDisabled ? 'opacity-40 cursor-not-allowed' : ''
                        } px-2 py-0.5 rounded text-[10px] text-black font-bold"
                        ${previousDisabled ? 'disabled' : ''}
                        aria-label="Página anterior">
                        ◀
                    </button>

                    <button
                        type="button"
                        onclick="changePcBoxPage(1)"
                        class="bg-amber-600 hover:bg-amber-500 ${
                            nextDisabled ? 'opacity-40 cursor-not-allowed' : ''
                        } px-2 py-0.5 rounded text-[10px] text-black font-bold"
                        ${nextDisabled ? 'disabled' : ''}
                        aria-label="Próxima página">
                        ▶
                    </button>
                </div>
            </div>
        `;
    }

    const startIndex = currentPage * pageSize;

    for (let i = 0; i < pageSize; i++) {
        const realIndex = startIndex + i;
        const monster = cp.pcBox[realIndex];
        const slot = document.createElement('div');

        if (monster) {
            const currentHpValue =
                monster.currentHp !== undefined
                    ? monster.currentHp
                    : (monster.maxHp ?? monster.hp ?? 20);

            const maxHpValue = monster.maxHp ?? monster.hp ?? 20;

            const currentHp = Number(currentHpValue);
            const maxHp = Number(maxHpValue);

            const safeCurrentHp =
                Number.isFinite(currentHp) ? Math.max(0, currentHp) : 0;

            const safeMaxHp =
                Number.isFinite(maxHp) && maxHp > 0 ? maxHp : 20;

            const level = Number(monster.level);
            const safeLevel = Number.isFinite(level) && level > 0 ? level : 1;

            const strength = Number(monster.str);
            const safeStrength =
                Number.isFinite(strength) ? strength : 4;

            const isFainted = safeCurrentHp <= 0;
            const imageUrl = escapeHtml(getMonsterImage(monster));
            const monsterName = escapeHtml(monster.name || 'Pokémon');

            const tierClass =
                typeof getTierColorClass === 'function'
                    ? getTierColorClass(monster.tier || 1)
                    : 'bg-slate-900 border-sky-600';

            const auraClass = escapeHtml(monster.auraEffect || '');
            const shinyClass = monster.isShiny
                ? 'border-amber-400 shiny-card-glow'
                : 'border-sky-600';

            slot.draggable = true;

            slot.ondragstart = (event) => {
                if (typeof handleDragStart === 'function') {
                    handleDragStart(event, 'pcbox', realIndex);
                }
            };

            slot.ondragover = (event) => {
                if (typeof handleDragOver === 'function') {
                    handleDragOver(event);
                }
            };

            slot.ondrop = (event) => {
                if (typeof handleDrop === 'function') {
                    handleDrop(event, 'pcbox', realIndex);
                }
            };

            slot.onclick = (event) => {
                event.stopPropagation();

                if (typeof openPokemonDetailModal === 'function') {
                    openPokemonDetailModal(
                        monster.uniqueId || monster.id,
                        'pcbox'
                    );
                }
            };

            slot.className = `
                ${tierClass}
                ${auraClass}
                flex flex-col justify-between p-1 rounded h-20
                cursor-pointer hover:brightness-110 shadow text-white
                relative ${shinyClass}
            `;

            slot.innerHTML = `
                ${
                    monster.isShiny
                        ? '<span class="absolute top-0.5 right-0.5 text-[7px] bg-amber-400 text-black px-1 rounded font-black">✨</span>'
                        : ''
                }

                <div class="text-[8px] text-sky-200 font-bold flex justify-between gap-1">
                    <span class="truncate">${monsterName}</span>
                    <span class="whitespace-nowrap">Nv.${safeLevel}</span>
                </div>

                <div class="flex justify-center items-center my-auto bg-black/40 rounded h-10">
                    ${
                        imageUrl
                            ? `
                                <img
                                    src="${imageUrl}"
                                    alt="${monsterName}"
                                    class="w-10 h-10 object-contain ${
                                        isFainted ? 'grayscale opacity-50' : ''
                                    }"
                                    onerror="this.onerror=null; this.src='https://api.iconify.design/noto:video-game.svg'"
                                >
                            `
                            : '<span class="text-xl">👾</span>'
                    }
                </div>

                <div class="text-[7px] text-center ${
                    isFainted ? 'text-red-400' : 'text-slate-200'
                }">
                    ${
                        isFainted
                            ? 'DESMAIADO'
                            : `HP: ${safeCurrentHp}/${safeMaxHp}`
                    }
                    | STR: ${safeStrength}
                </div>
            `;
        } else {
            slot.ondragover = (event) => {
                if (typeof handleDragOver === 'function') {
                    handleDragOver(event);
                }
            };

            slot.ondrop = (event) => {
                if (typeof handleDrop === 'function') {
                    handleDrop(event, 'pcbox', realIndex);
                }
            };

            slot.className =
                'border border-dashed border-slate-700 rounded bg-slate-950/40 h-20 flex items-center justify-center text-slate-600 text-[9px]';

            slot.innerHTML = '<span>Livre</span>';
        }

        container.appendChild(slot);
    }
}

window.changePcBoxPage = function(direction) {
    const cp = typeof getCurrentPlayer === 'function'
        ? getCurrentPlayer()
        : null;

    if (!cp || !gameState || typeof gameState !== 'object') return;

    if (!Array.isArray(cp.pcBox)) {
        cp.pcBox = [];
    }

    const pageSize = 12;
    const totalBoxes = cp.pcBox.length;
    const maxPages = Math.max(0, Math.ceil(totalBoxes / pageSize) - 1);

    const pageDirection = Number(direction);

    if (!Number.isFinite(pageDirection)) return;

    let currentPage = Number(gameState.pcBoxCurrentPage) || 0;
    currentPage += pageDirection;
    currentPage = Math.max(0, Math.min(Math.floor(currentPage), maxPages));

    gameState.pcBoxCurrentPage = currentPage;
    renderBottomPanel();
};
