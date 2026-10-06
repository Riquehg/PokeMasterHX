// --- SISTEMA DE DADOS E MOVIMENTO TRADICIONAL DE TABULEIRO (DICE.JS) ---

if (typeof SUPABASE_STORAGE_URL === 'undefined') {
    var SUPABASE_STORAGE_URL = "https://juowcnkjhfbfttnwge.supabase.co/storage/v1/object/public/sprites/";
}

let movementState = {
    isMoving: false,
    diceRolledValue: 0,
    hasRolledThisTurn: false,
    validDestinations: []
};

// Atalho seguro para obter a posição atual do jogador da vez
function getCurrentPlayerWaypointId() {
    const cp = (typeof getCurrentPlayer === 'function') ? getCurrentPlayer() : null;
    if (cp) {
        if (cp.currentZone === undefined) cp.currentZone = 5; // Pallet por defeito
        return cp.currentZone;
    }
    return 5;
}

function setCurrentPlayerWaypointId(newWaypointId) {
    const cp = (typeof getCurrentPlayer === 'function') ? getCurrentPlayer() : null;
    if (cp) {
        cp.currentZone = newWaypointId;
    }
}

// Ponto de entrada unificado para rolar o dado (Ligado ao Botão do HUD e map.js)
function rollDiceForMovement() {
    if (movementState.isMoving) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup("Aviso", "⚠ Termina o movimento atual antes de rolar o dado novamente!", false);
        }
        return;
    }

    if (movementState.hasRolledThisTurn) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup("Movimento Esgotado", "⚠️️ Já rodaste o dado e realizaste o teu movimento neste turno!\n\nPassa a vez ou termina as tuas ações.", false);
        }
        return;
    }

    const diceIcon = document.getElementById('dice-icon');
    if (diceIcon) diceIcon.classList.add('fa-spin');

    // Executa a animação visual padrão de dado
    if (typeof rollDiceWithAnimation === 'function') {
        rollDiceWithAnimation((diceResult) => {
            if (diceIcon) diceIcon.classList.remove('fa-spin');
            movementState.hasRolledThisTurn = true;
            startDirectMovementSession(diceResult);
        });
    } else {
        setTimeout(() => {
            if (diceIcon) diceIcon.classList.remove('fa-spin');
            const rollResult = Math.floor(Math.random() * 6) + 1;
            movementState.hasRolledThisTurn = true;
            startDirectMovementSession(rollResult);
        }, 800);
    }
}

// Mantido por compatibilidade caso algum módulo chame 'rollDice' diretamente
function rollDice() {
    rollDiceForMovement();
}

// Inicia a sessão de movimento direto ao destino final
function startDirectMovementSession(steps) {
    movementState.isMoving = true;
    movementState.diceRolledValue = steps;

    const currentId = getCurrentPlayerWaypointId();
    
    // Utiliza a função BFS do map.js para encontrar todas as casas exatamente a 'steps' de distância
    if (typeof getValidDestinations === 'function') {
        movementState.validDestinations = getValidDestinations(currentId, steps);
    } else {
        movementState.validDestinations = [];
    }

    const activePlayer = (typeof getCurrentPlayer === 'function') ? getCurrentPlayer() : (gameState.players ? gameState.players[0] : null);

    // Aplica as travas de tipo de Pokémon e Insígnias nos destinos finais
    movementState.validDestinations = movementState.validDestinations.filter(targetId => {
        const targetWp = BOARD_WAYPOINTS.find(wp => wp.id === targetId);
        if (!targetWp) return false;

        // Trava de Passagem por Tipo de Pokémon na Equipa
        if (targetWp.requiredType && targetWp.requiredType.trim() !== "") {
            const required = targetWp.requiredType.toLowerCase();
            const hasRequiredType = activePlayer && activePlayer.activeTeam.some(mon => {
                if (!mon.type) return false;
                return mon.type.toLowerCase().includes(required);
            });
            if (!hasRequiredType) return false;
        }

        // Trava de acesso à Indigo Plateau / Arena Final (Exige 6 insígnias)
        const isIndigoPlateauOrEnd = targetWp.name.toLowerCase().includes("indigo plateau") || 
                                   targetWp.name.toLowerCase().includes("liga pokémon") || 
                                   targetWp.name.toLowerCase().includes("arena final");

        if (isIndigoPlateauOrEnd && activePlayer) {
            const playerBadges = Array.isArray(activePlayer.badges) ? activePlayer.badges.length : 0;
            if (playerBadges < 6) return false;
        }

        return true;
    });

    if (movementState.validDestinations.length === 0) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup("Sem Saída", `Rolaste ${steps}, mas não existem caminhos válidos com este valor a partir daqui! O turno avança.`, false);
        }
        finishMovementSessionWithoutMoving();
        return;
    }

    updateMovementHUD(`Rolaste ${steps}! Clica na casa de destino final destacada.`);
    if (typeof renderBoardMapWithHighlights === 'function') {
        renderBoardMapWithHighlights(movementState.validDestinations);
    }
}

// Executado quando o jogador clica numa casa de destino final no mapa
function handleWaypointClick(targetWaypointId) {
    if (!movementState.isMoving) {
        return; 
    }

    const targetNum = Number(targetWaypointId);
    const validNormalized = (movementState.validDestinations || []).map(Number);

    if (!validNormalized.includes(targetNum)) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup("Destino Inválido", "🚫 Escolha uma das casas finais destacadas no mapa!", false);
        }
        return;
    }

    // Move o jogador diretamente para o destino final escolhido
    setCurrentPlayerWaypointId(targetNum);
    
    const activePlayer = (typeof getCurrentPlayer === 'function') ? getCurrentPlayer() : null;
    if (activePlayer) {
        activePlayer.currentZone = targetNum;
    }

    if (typeof moveTokenToWaypoint === 'function') {
        moveTokenToWaypoint(targetNum);
    }
    updatePlayerLocationUI(targetNum);

    finishMovementSession();
}

function finishMovementSession() {
    movementState.isMoving = false;
    movementState.validDestinations = [];
    
    if (typeof renderBoardMap === 'function') renderBoardMap();
    const finalId = getCurrentPlayerWaypointId();
    
    if (typeof moveTokenToWaypoint === 'function') {
        moveTokenToWaypoint(finalId);
    }

    const cp = getCurrentPlayer();
    updateMovementHUD(`Local: Zona #${finalId} (${cp.name})`);
    
    // Dispara o evento da casa final exatamente uma vez
    if (typeof triggerWaypointEvent === 'function') {
        triggerWaypointEvent(finalId);
    }
}

function finishMovementSessionWithoutMoving() {
    movementState.isMoving = false;
    movementState.validDestinations = [];
    if (typeof renderBoardMap === 'function') renderBoardMap();
}

function updateMovementHUD(text) {
    const locationText = document.getElementById('current-location');
    if (locationText) {
        locationText.innerText = text;
    }
}

function updatePlayerLocationUI(waypointId) {
    const waypoint = BOARD_WAYPOINTS.find(wp => wp.id === waypointId);
    if (waypoint) {
        const cp = getCurrentPlayer();
        if (typeof appendAdventureLog === 'function') {
            appendAdventureLog(`${cp ? cp.name : 'Treinador'} deslocou-se para ${waypoint.name}.`);
        }
    }
}

function triggerWaypointEvent(waypointId) {
    const waypoint = BOARD_WAYPOINTS.find(wp => wp.id === waypointId);
    if (!waypoint) return;

    const cp = getCurrentPlayer();
    cp.currentZone = waypointId;

    if (waypoint.type === 'pokemon') {
        const wildPokemon = (typeof boardPokemonCards !== 'undefined') ? boardPokemonCards[waypointId] : null;
        if (wildPokemon) {
            wildPokemon.revealed = true;
            if (typeof openEncounterModalWithPokemon === 'function') {
                openEncounterModalWithPokemon(wildPokemon);
            }
        }
    } else if (waypoint.type === 'city') {
        if (typeof openCityModal === 'function') {
            openCityModal(waypoint.name);
        }
    } else if (waypoint.type === 'event') {
        triggerRandomBoardEvent(waypoint.name);
    }
}

function triggerRandomBoardEvent(waypointName) {
    const randomRoll = Math.floor(Math.random() * 4) + 1;
    let title = "Carta de Evento";
    let message = "";
    let isPositive = true;

    const activePlayer = getCurrentPlayer();

    if (randomRoll === 1) {
        let goldGain = 100;
        activePlayer.gold += goldGain;
        title = "💰 Tesouro Encontrado!";
        message = `Encontraste uma bolsa perdida com ${goldGain} moedas de ouro em ${waypointName}!`;
    } else if (randomRoll === 2) {
        title = "🌿 Sorte na Natureza!";
        message = `O ar puro de ${waypointName} revigorou a tua equipa!`;
    } else if (randomRoll === 3) {
        title = "🎒 Achado na Rota!";
        if (activePlayer && activePlayer.inventory) {
            let potion = activePlayer.inventory.find(i => i.id === 'item_potion');
            if (potion) potion.count++;
        }
        message = `Encontraste uma Potion em ${waypointName}! Adicionada à Mochila.`;
    } else {
        title = "🌀 Imprevisto na Rota!";
        message = `Terreno difícil em ${waypointName}. Perdes tempo mas segues viagem.`;
        isPositive = false;
    }

    if (typeof updatePlayerUI === 'function') updatePlayerUI();
    if (typeof renderBottomPanel === 'function') renderBottomPanel();
    if (typeof showCustomPopup === 'function') {
        showCustomPopup(title, message, isPositive);
    }
}
