// --- src/core/state.js ---

export let gameState = {
    gameMode: 'solo',
    online: false, // Suporte para partidas online
    roomCode: null,
    myPlayerIndex: 0, // Índice local do jogador na sala online
    playersCount: 1,
    currentPlayerIndex: 0,
    turnCounter: 1,
    players: [],
    player: null, // Fallback para modo solo
    setupDone: false,
    turn: 1,
    currentEncounter: null,
    chatMessages: [
        { sender: "Sistema", text: "Bem-vindo ao Pokémon Master Trainer HEX Edition!" }
    ],
    currentBottomView: 'inventory',
    pcBoxCurrentPage: 0
};

export let setupConfig = {
    mode: 'solo',
    playersCount: 1,
    avatarId: 1,
    starterId: 'bulbasaur',
    playersData: [],
    selectedAvatar: 1,
    selectedStarter: 'bulbasaur',
    trainerName: 'Ash Ketchum'
};

export let setupWizardState = {
    currentConfiguringIndex: 0,
    collectedPlayers: []
};

export let movementState = {
    isMoving: false,
    diceRolledValue: 0,
    hasRolledThisTurn: false,
    validDestinations: []
};

export let boardPokemonCards = {};
export let currentEncounterState = {
    wildPokemon: null,
    selectedTeamMemberIndex: 0,
    itemBonus: 0,
    battlePowerBonus: 0,
    hasAttemptedCapture: false,
    selectedCaptureBallId: null
};

export let selectedBallAura = null;
export let currentAuthenticatedAccount = null;

export let dailyFeaturedPokemonConfig = {
    pokemonId: 'pikachu',
    pokemonName: 'Pikachu',
    bonusItem: 'item_rarecandy',
    bonusItemName: 'Rare Candy',
    activeDate: new Date().toDateString()
};

// Atalho seguro para obter o jogador do turno atual
export function getCurrentPlayer() {
    if (gameState && Array.isArray(gameState.players) && gameState.players.length > 0) {
        const index = Math.max(0, Math.min(gameState.players.length - 1, Number(gameState.currentPlayerIndex) || 0));
        return gameState.players[index] || gameState.players[0];
    }
    if (gameState && gameState.player) {
        return gameState.player;
    }
    return null;
}

// Retorna especificamente o jogador local da conta (essencial para modo online na HUD, Mochila e PC Box)
export function getMyPlayer() {
    ensureValidGameState();
    if (!gameState.online) {
        return getCurrentPlayer();
    }

    // 🛡️ Procura rigorosamente pelo e-mail autenticado ou socketId para nunca misturar os dados com outro jogador
    if (currentAuthenticatedAccount) {
        const foundByEmail = gameState.players.find(p => p && (p.email === currentAuthenticatedAccount || p.accountEmail === currentAuthenticatedAccount));
        if (foundByEmail) return foundByEmail;
    }

    const myIndex = Math.max(0, Math.min(gameState.players.length - 1, Number(gameState.myPlayerIndex) || 0));
    return gameState.players[myIndex] || gameState.players[0] || getCurrentPlayer();
}

// Função unificada de compatibilidade (prioriza o jogador local no online ou o atual no solo)
export function getCurrentOrMyPlayer() {
    return getMyPlayer();
}

// Fallback de segurança para garantir que o estado nunca fique nulo sem apagar dados existentes
export function ensureValidGameState() {
    if (!Array.isArray(gameState.players)) {
        gameState.players = [];
    }
    
    if (gameState.players.length === 0) {
        gameState.players = [{
            name: setupConfig.trainerName || 'Ash Ketchum',
            avatarId: setupConfig.selectedAvatar || setupConfig.avatarId || 1,
            gold: 350,
            badges: [],
            currentZone: 5,
            level: 1,
            activeTeam: [],
            pcBox: [],
            inventory: [],
            equipmentSlots: [null, null]
        }];
    }
    
    // Assegura que o índice atual e o local estão dentro dos limites válidos
    gameState.currentPlayerIndex = Math.max(0, Math.min(gameState.players.length - 1, Number(gameState.currentPlayerIndex) || 0));
    gameState.myPlayerIndex = Math.max(0, Math.min(gameState.players.length - 1, Number(gameState.myPlayerIndex) || 0));

    // Garante que o jogador atual possui as propriedades mínimas essenciais
    const cp = getCurrentPlayer();
    if (cp) {
        if (!Array.isArray(cp.activeTeam)) cp.activeTeam = [];
        if (!Array.isArray(cp.pcBox)) cp.pcBox = [];
        if (!Array.isArray(cp.inventory)) cp.inventory = [];
        if (!Array.isArray(cp.badges)) cp.badges = [];
        if (cp.currentZone === undefined || cp.currentZone === null) cp.currentZone = 5;
    }
}

// Exposição global opcional para depuração no console
window.gameState = gameState;
window.movementState = movementState;
window.getMyPlayer = getMyPlayer;
window.getCurrentOrMyPlayer = getCurrentOrMyPlayer;
