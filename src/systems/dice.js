// --- src/systems/dice.js ---
// Módulo de Dados, Movimento e Eventos do Tabuleiro

import { SUPABASE_STORAGE_URL } from '../config/constants.js';
import { gameState, getCurrentPlayer, movementState } from '../core/state.js';
import { saveGameProgress } from '../core/storage.js';
import { BOARD_WAYPOINTS, getValidDestinations, renderBoardMap, renderBoardMapWithHighlights, moveTokenToWaypoint } from './map.js';
import { openEncounterModalWithPokemon } from './encounter.js';
import { socket, emitSocket } from '../core/socket.js';

// ------------------------------------------------------------
// CONFIGURAÇÃO DE EVENTOS DA HUD (Vincula o clique do dado)
// ------------------------------------------------------------

export function setupDiceListeners() {
    const diceBtn = document.getElementById('roll-dice-btn') || document.getElementById('dice-container');
    if (diceBtn && !diceBtn.dataset.listenerAttached) {
        diceBtn.dataset.listenerAttached = "true";
        diceBtn.onclick = () => {
            rollDiceForMovement();
        };
    }

    const passTurnBtn = document.getElementById('pass-turn-btn');
    if (passTurnBtn && !passTurnBtn.dataset.listenerAttached) {
        passTurnBtn.dataset.listenerAttached = "true";
        passTurnBtn.onclick = () => {
            // 🛡️ TRAVA DE SEGURANÇA ONLINE: Apenas o dono do turno atual pode passá-lo
            if (gameState.online && gameState.currentPlayerIndex !== gameState.myPlayerIndex) {
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup("Ação Bloqueada", "Não pode passar o turno de outro jogador.", false);
                }
                return;
            }

            resetTurnDiceState();
            
            // Avança o índice do jogador atual
            if (typeof gameState !== 'undefined' && gameState.players && Array.isArray(gameState.players)) {
                gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
            }

            // Sincroniza a mudança de turno com os outros jogadores na sala online
            if (gameState.online) {
                emitSocket('update_game_state', {
                    type: 'pass_turn',
                    gameState: gameState
                });
            }

            if (typeof showCustomPopup === 'function') {
                showCustomPopup("Passagem de Turno", "🔄 O turno foi passado. O dado foi liberado para rolar novamente!", true);
            }
            if (typeof renderBoardMap === 'function') {
                renderBoardMap();
            }
            if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
            if (typeof renderBottomPanel === 'function') renderBottomPanel();
        };
    }
}

// ------------------------------------------------------------
// FUNÇÕES AUXILIARES
// ------------------------------------------------------------

function getSafeBoardWaypoints() {
    return Array.isArray(BOARD_WAYPOINTS) ? BOARD_WAYPOINTS : [];
}

function getWaypointById(waypointId) {
    const numericId = Number(waypointId);
    if (!Number.isFinite(numericId)) return null;

    return getSafeBoardWaypoints().find(
        waypoint => Number(waypoint.id) === numericId
    ) || null;
}

function getMovementPlayer() {
    if (typeof getCurrentPlayer === 'function') {
        return getCurrentPlayer();
    }

    if (
        typeof gameState === 'undefined' ||
        !gameState ||
        !Array.isArray(gameState.players) ||
        gameState.players.length === 0
    ) {
        return null;
    }

    const currentIndex = Number(gameState.currentPlayerIndex) || 0;
    return gameState.players[currentIndex] || gameState.players[0] || null;
}

function normalizeWaypointType(value) {
    const aliases = {
        rock: ['rock', 'pedra'],
        pedra: ['rock', 'pedra'],
        flying: ['flying', 'voador'],
        voador: ['flying', 'voador'],
        fire: ['fire', 'fogo'],
        fogo: ['fire', 'fogo'],
        grass: ['grass', 'grama'],
        grama: ['grass', 'grama'],
        water: ['water', 'água', 'agua'],
        agua: ['water', 'água', 'agua'],
        electric: ['electric', 'elétrico', 'eletrico'],
        elétrico: ['electric', 'elétrico', 'eletrico'],
        eletrico: ['electric', 'elétrico', 'eletrico']
    };

    const normalized = String(value || '').toLowerCase().trim();
    return aliases[normalized] || [normalized];
}

function playerHasRequiredType(player, requiredType) {
    if (!player || !requiredType) return true;

    const requiredAliases = normalizeWaypointType(requiredType);
    const activeTeam = Array.isArray(player.activeTeam) ? player.activeTeam : [];

    return activeTeam.some(monster => {
        if (!monster || !monster.type) return false;

        const monsterTypes = String(monster.type)
            .toLowerCase()
            .split('/')
            .map(type => type.trim());

        return monsterTypes.some(monsterType =>
            requiredAliases.includes(monsterType)
        );
    });
}

function playerCanAccessWaypoint(player, waypoint) {
    if (!player || !waypoint) return false;

    if (
        waypoint.requiredType &&
        !playerHasRequiredType(player, waypoint.requiredType)
    ) {
        return false;
    }

    const waypointName = String(waypoint.name || '').toLowerCase();
    const isFinalArea =
        waypointName.includes('indigo plateau') ||
        waypointName.includes('liga pokémon') ||
        waypointName.includes('liga pokemon') ||
        waypointName.includes('arena final');

    if (isFinalArea) {
        const badgeCount = Array.isArray(player.badges) ? player.badges.length : 0;
        if (badgeCount < 6) return false;
    }

    return true;
}

// ------------------------------------------------------------
// POSIÇÃO DO JOGADOR
// ------------------------------------------------------------

export function getCurrentPlayerWaypointId() {
    const player = getMovementPlayer();
    const defaultWaypoint = getWaypointById(5);

    if (!player) {
        return defaultWaypoint ? Number(defaultWaypoint.id) : 5;
    }

    const currentZone = Number(player.currentZone);
    if (Number.isFinite(currentZone) && getWaypointById(currentZone)) {
        return currentZone;
    }

    player.currentZone = defaultWaypoint ? Number(defaultWaypoint.id) : 5;
    return player.currentZone;
}

export function setCurrentPlayerWaypointId(newWaypointId) {
    const waypoint = getWaypointById(newWaypointId);
    if (!waypoint) return false;

    const player = getMovementPlayer();
    if (!player) return false;

    player.currentZone = Number(waypoint.id);
    return true;
}

// ------------------------------------------------------------
// RESETAR O ESTADO DO DADO (Ao passar o turno)
// ------------------------------------------------------------

export function resetTurnDiceState() {
    if (typeof movementState !== 'undefined') {
        movementState.hasRolledThisTurn = false;
        movementState.isMoving = false;
        movementState.validDestinations = [];
        movementState.diceRolledValue = 0;
    }
}

// ------------------------------------------------------------
// ROLAGEM DO DADO COM ANIMAÇÃO GRÁFICA CENTRAL
// ------------------------------------------------------------

export function rollDiceForMovement() {
    // 🛡️ TRAVA DE SEGURANÇA ONLINE: Impede jogar fora do turno
    if (gameState.online && gameState.currentPlayerIndex !== gameState.myPlayerIndex) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup("Não é o seu turno!", "Aguarde o outro jogador concluir a jogada.", false);
        }
        return;
    }

    if (movementState.isMoving) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup(
                'Movimento em andamento',
                '⚠️ Escolha primeiro uma das casas destacadas no mapa.',
                false
            );
        }
        return;
    }

    if (movementState.hasRolledThisTurn) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup(
                'Movimento esgotado',
                '⚠️ Você já rolou o dado neste turno. Escolha uma casa ou passe a vez.',
                false
            );
        }
        return;
    }

    const finishRoll = result => {
        const normalizedResult = Math.max(
            1,
            Math.min(6, Number(result) || 1)
        );

        movementState.hasRolledThisTurn = true;
        startDirectMovementSession(normalizedResult);
    };

    let diceOverlay = document.getElementById('epic-dice-overlay');
    if (!diceOverlay) {
        diceOverlay = document.createElement('div');
        diceOverlay.id = 'epic-dice-overlay';
        diceOverlay.className = 'fixed inset-0 bg-black/80 z-[600] flex flex-col items-center justify-center backdrop-blur-sm text-white';
        document.body.appendChild(diceOverlay);
    }

    diceOverlay.innerHTML = `
        <div class="trainer-card p-8 border-4 border-amber-400 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] text-center space-y-6 shadow-2xl animate-pulse">
            <h2 class="text-xl font-black text-amber-400 font-cinzel">🎲 A ROLAR O DADO...</h2>
            <div id="dice-cube-display" class="w-24 h-24 mx-auto bg-amber-500 rounded-2xl flex items-center justify-center text-black text-4xl font-black shadow-[0_0_25px_rgba(255,215,0,0.8)] animate-spin">
                🎲
            </div>
            <p class="text-xs text-slate-300">A sortear o valor do movimento...</p>
        </div>
    `;
    diceOverlay.classList.remove('hidden');

    let counter = 0;
    const interval = setInterval(() => {
        const tempVal = Math.floor(Math.random() * 6) + 1;
        const cube = document.getElementById('dice-cube-display');
        if (cube) cube.textContent = tempVal;
        counter++;
        if (counter > 8) {
            clearInterval(interval);
            const finalResult = Math.floor(Math.random() * 6) + 1;
            if (cube) {
                cube.classList.remove('animate-spin');
                cube.textContent = finalResult;
            }
            setTimeout(() => {
                diceOverlay.remove();
                finishRoll(finalResult);
            }, 600);
        }
    }, 100);
}

export function rollDice() {
    rollDiceForMovement();
}

// ------------------------------------------------------------
// INÍCIO DA SESSÃO DE MOVIMENTO
// ------------------------------------------------------------

export function startDirectMovementSession(steps) {
    const normalizedSteps = Math.max(1, Math.min(6, Number(steps) || 1));
    const player = getMovementPlayer();
    const currentWaypointId = getCurrentPlayerWaypointId();

    movementState.isMoving = true;
    movementState.diceRolledValue = normalizedSteps;
    movementState.validDestinations = [];

    if (typeof getValidDestinations === 'function') {
        const destinations = getValidDestinations(currentWaypointId, normalizedSteps);
        if (Array.isArray(destinations)) {
            movementState.validDestinations = destinations
                .map(Number)
                .filter(destinationId => Boolean(getWaypointById(destinationId)));
        }
    }

    movementState.validDestinations = movementState.validDestinations.filter(destinationId => {
        const waypoint = getWaypointById(destinationId);
        return playerCanAccessWaypoint(player, waypoint);
    });

    movementState.validDestinations = [...new Set(movementState.validDestinations)];

    if (movementState.validDestinations.length === 0) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup(
                'Sem caminho válido',
                `Você rolou ${normalizedSteps}, mas não existe um destino válido com essa distância a partir da casa atual. O movimento foi encerrado.`,
                false
            );
        }
        finishMovementSessionWithoutMoving();
        return;
    }

    updateMovementHUD(`Você rolou ${normalizedSteps}. Escolha uma casa destacada.`);

    if (typeof renderBoardMapWithHighlights === 'function') {
        renderBoardMapWithHighlights(movementState.validDestinations);
    } else if (typeof renderBoardMap === 'function') {
        renderBoardMap(movementState.validDestinations);
    }
}

// ------------------------------------------------------------
// CLIQUE EM UMA CASA DESTACADA
// ------------------------------------------------------------

export function handleWaypointClick(targetWaypointId) {
    if (!movementState.isMoving) return;

    const targetId = Number(targetWaypointId);
    const targetWaypoint = getWaypointById(targetId);

    if (!targetWaypoint) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup(
                'Destino inválido',
                '🚫 A casa selecionada não existe no mapa.',
                false
            );
        }
        return;
    }

    const validDestinations = movementState.validDestinations.map(Number);
    if (!validDestinations.includes(targetId)) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup(
                'Destino inválido',
                '🚫 Escolha uma das casas finais destacadas no mapa.',
                false
            );
        }
        return;
    }

    const player = getMovementPlayer();
    if (!playerCanAccessWaypoint(player, targetWaypoint)) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup(
                'Acesso bloqueado',
                '⚠️ Você ainda não atende aos requisitos para acessar essa casa.',
                false
            );
        }
        return;
    }

    if (!setCurrentPlayerWaypointId(targetId)) {
        finishMovementSessionWithoutMoving();
        return;
    }

    if (typeof moveTokenToWaypoint === 'function') {
        moveTokenToWaypoint(targetId);
    }

    updatePlayerLocationUI(targetId);
    finishMovementSession();
}

// ------------------------------------------------------------
// FINALIZAÇÃO DO MOVIMENTO
// ------------------------------------------------------------

export function finishMovementSession() {
    movementState.isMoving = false;
    movementState.validDestinations = [];

    const finalWaypointId = getCurrentPlayerWaypointId();

    if (typeof renderBoardMap === 'function') {
        renderBoardMap();
    }

    if (typeof moveTokenToWaypoint === 'function') {
        moveTokenToWaypoint(finalWaypointId);
    }

    const player = getMovementPlayer();
    updateMovementHUD(
        player
            ? `Local: Zona #${finalWaypointId} (${player.name || 'Treinador'})`
            : `Local: Zona #${finalWaypointId}`
    );

    if (gameState.online) {
        emitSocket('update_game_state', {
            type: 'player_movement_finished',
            gameState: typeof gameState !== 'undefined' ? gameState : null
        });
    }

    if (typeof triggerWaypointEvent === 'function') {
        triggerWaypointEvent(finalWaypointId);
    }
}

export function finishMovementSessionWithoutMoving() {
    movementState.isMoving = false;
    movementState.diceRolledValue = 0;
    movementState.validDestinations = [];

    if (typeof renderBoardMap === 'function') {
        renderBoardMap();
    }
}

// ------------------------------------------------------------
// HUD E REGISTRO DE LOCALIZAÇÃO
// ------------------------------------------------------------

function updateMovementHUD(text) {
    const locationElement = document.getElementById('current-location');
    if (locationElement) {
        locationElement.innerText = String(text || '');
    }
}

function updatePlayerLocationUI(waypointId) {
    const waypoint = getWaypointById(waypointId);
    if (!waypoint) return;

    const player = getMovementPlayer();
    if (typeof appendAdventureLog === 'function') {
        appendAdventureLog(
            `${player?.name || 'Treinador'} deslocou-se para ${waypoint.name || `Zona #${waypoint.id}`}.`
        );
    }
}

// ------------------------------------------------------------
// EVENTOS DA CASA DE DESTINO E POKÉMON SELVAGENS
// ------------------------------------------------------------

export function triggerWaypointEvent(waypointId) {
    const waypoint = getWaypointById(waypointId);
    const player = getMovementPlayer();

    if (!waypoint || !player) return;

    player.currentZone = Number(waypoint.id);

    if (waypoint.type === 'pokemon') {
        if (typeof boardPokemonCards === 'undefined') {
            window.boardPokemonCards = {};
        }

        if (!boardPokemonCards[waypointId]) {
            const catalog = typeof MONSTER_CATALOG !== 'undefined' ? MONSTER_CATALOG : [];
            if (catalog.length > 0) {
                const randomMon = catalog[Math.floor(Math.random() * catalog.length)];
                const tier = randomMon.tier || 1;
                const minLvl = tier === 1 ? 3 : tier === 2 ? 8 : tier === 3 ? 15 : 25;
                const level = Math.floor(Math.random() * 4) + minLvl;
                const isShiny = Math.random() < 0.06;

                boardPokemonCards[waypointId] = {
                    ...randomMon,
                    level: level,
                    tier: tier,
                    currentHp: 20 + (level * 2),
                    maxHp: 20 + (level * 2),
                    isShiny: isShiny,
                    waypointId: waypointId,
                    revealed: true,
                    weakened: false
                };
            }
        }

        const wildPokemon = boardPokemonCards[waypointId];
        if (wildPokemon && typeof openEncounterModalWithPokemon === 'function') {
            wildPokemon.revealed = true;
            openEncounterModalWithPokemon(wildPokemon);
        }
        return;
    }

    if (waypoint.type === 'city') {
        if (typeof openCityModal === 'function') {
            openCityModal(waypoint.name);
        }
        return;
    }

    if (waypoint.type === 'event') {
        if (typeof triggerRandomBoardEvent === 'function') {
            triggerRandomBoardEvent(waypoint.name);
        }
        return;
    }
}

// ------------------------------------------------------------
// EVENTOS ALEATÓRIOS
// ------------------------------------------------------------

function ensurePotionInInventory(player) {
    if (!player) return;

    if (!Array.isArray(player.inventory)) {
        player.inventory = [];
    }

    const potion = player.inventory.find(item => item && item.id === 'item_potion');

    if (potion) {
        potion.count = Math.max(0, Number(potion.count) || 0) + 1;
        return;
    }

    player.inventory.push({
        id: 'item_potion',
        name: 'Potion',
        type: 'heal',
        value: 20,
        icon: '💊',
        image: `${SUPABASE_STORAGE_URL}items/potion.png`,
        count: 1,
        cost: 50,
        desc: 'Restaura 20 HP de um Anima.'
    });
}

export function triggerRandomBoardEvent(waypointName) {
    const player = getMovementPlayer();
    if (!player) return;

    const roll = Math.floor(Math.random() * 4) + 1;
    let title = 'Carta de Evento';
    let message = '';
    let isPositive = true;

    const safeWaypointName = waypointName || 'esta rota';

    if (roll === 1) {
        const goldGain = 100;
        player.gold = Math.max(0, Number(player.gold) || 0) + goldGain;
        title = '💰 Tesouro encontrado!';
        message = `Você encontrou uma bolsa perdida com ${goldGain} moedas de ouro em ${safeWaypointName}.`;
    } else if (roll === 2) {
        title = '🌿 Sorte na natureza!';
        message = `O ar puro de ${safeWaypointName} revigorou a sua equipe.`;
    } else if (roll === 3) {
        ensurePotionInInventory(player);
        title = '🎒 Achado na rota!';
        message = `Você encontrou uma Potion em ${safeWaypointName}. O item foi adicionado à mochila.`;
    } else {
        title = '🌀 Imprevisto na rota!';
        message = `O terreno de ${safeWaypointName} era difícil. Você perdeu tempo, mas continuou a viagem.`;
        isPositive = false;
    }

    if (typeof updatePlayerUI === 'function') {
        updatePlayerUI();
    }

    if (typeof renderBottomPanel === 'function') {
        renderBottomPanel();
    }

    if (typeof saveGameProgress === 'function') {
        saveGameProgress();
    }

    if (typeof showCustomPopup === 'function') {
        showCustomPopup(title, message, isPositive);
    }
}

// Exposição Global Essencial para o HTML e outros scripts
window.rollDiceForMovement = rollDiceForMovement;
window.rollDice = rollDice;
window.handleWaypointClick = handleWaypointClick;
window.resetTurnDiceState = resetTurnDiceState;
