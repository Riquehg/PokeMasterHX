// --- src/core/state.js ---

export let gameState = {
    gameMode: 'solo',
    playersCount: 1,
    currentPlayerIndex: 0,
    turnCounter: 1,
    players: [],
    player: null // Fallback para modo solo
};

export let setupConfig = {
    selectedAvatar: 1,
    selectedStarter: 'bulbasaur',
    trainerName: 'Ash Ketchum'
};

export let movementState = {
    isMoving: false,
    diceRolledValue: 0,
    hasRolledThisTurn: false,
    validDestinations: []
};

export let boardPokemonCards = {};
export let currentEncounterState = null;
export let selectedBallAura = null;

// Atalho seguro para obter o jogador da vez
export function getCurrentPlayer() {
    if (gameState && Array.isArray(gameState.players) && gameState.players.length > 0) {
        const index = gameState.currentPlayerIndex || 0;
        return gameState.players[index] || gameState.players[0];
    }
    if (gameState && gameState.player) {
        return gameState.player;
    }
    return null;
}

// Fallback de segurança para garantir que o estado nunca fique nulo
export function ensureValidGameState() {
    if (!gameState.players) gameState.players = [];
    if (gameState.players.length === 0) {
        gameState.players = [{
            name: setupConfig.trainerName || 'Treinador',
            avatarId: setupConfig.selectedAvatar || 1,
            gold: 350,
            badges: [],
            currentZone: 5,
            activeTeam: [],
            pcBox: [],
            inventory: []
        }];
    }
    gameState.currentPlayerIndex = gameState.currentPlayerIndex || 0;
}