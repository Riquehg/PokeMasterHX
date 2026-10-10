// --- src/core/state.js ---

export let gameState = {
    gameMode: 'solo',
    playersCount: 1,
    currentPlayerIndex: 0,
    myPlayerIndex: 0, // Índice do jogador local nas partidas online
    online: false,    // Flag de controle de modo online ativo
    roomId: null,     // ID da sala online atual
    turnCounter: 1,
    players: [],
    player: null, // Fallback para modo solo
    setupDone: false,
    turn: 1,
    currentEncounter: null,
    chatMessages: [
        { sender: "Sistema", text: "Bem-vindo ao Pokémon Master Trainer HEX Edition (Modo Nuvem / Servidor)!" }
    ],
    currentBottomView: 'inventory',
    pcBoxCurrentPage: 0,
    globalVault: [] // Cofre global de herança de Animas gerido no servidor
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

// Atalho seguro para obter o jogador da vez
export function getCurrentPlayer() {
    if (gameState && Array.isArray(gameState.players) && gameState.players.length > 0) {
        const index = Number.isFinite(gameState.currentPlayerIndex) ? gameState.currentPlayerIndex : 0;
        const safeIndex = Math.max(0, Math.min(index, gameState.players.length - 1));
        return gameState.players[safeIndex] || gameState.players[0];
    }
    if (gameState && gameState.player) {
        return gameState.player;
    }
    return null;
}

// Fallback de segurança para garantir integridade estrutural do estado gerido pelo servidor
export function ensureValidGameState() {
    if (!gameState) {
        return;
    }

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
    
    const cp = getCurrentPlayer();
    if (cp) {
        if (!Array.isArray(cp.activeTeam)) cp.activeTeam = [];
        if (!Array.isArray(cp.pcBox)) cp.pcBox = [];
        if (!Array.isArray(cp.inventory)) cp.inventory = [];
        if (!Array.isArray(cp.badges)) cp.badges = [];
        if (cp.currentZone === undefined || cp.currentZone === null) cp.currentZone = 5;
    }

    if (gameState.currentPlayerIndex === undefined || gameState.currentPlayerIndex === null || gameState.currentPlayerIndex >= gameState.players.length) {
        gameState.currentPlayerIndex = 0;
    }
}
