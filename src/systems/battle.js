// --- src/systems/battle.js ---
// Módulo de Batalhas Selvagens e Fluxo de Captura

import { SUPABASE_STORAGE_URL } from '../config/constants.js';
import { gameState, getCurrentPlayer, currentEncounterState, selectedBallAura } from '../core/state.js';
import { saveGameProgress } from '../core/storage.js';

// ------------------------------------------------------------
// TABELA DE VANTAGENS DE TIPO (HEX Edition TCG)
// ------------------------------------------------------------
const TYPE_ADVANTAGES = {
    "Fogo": { strongAgainst: ["Grama", "Inseto", "Gelo", "Aço"], weakAgainst: ["Água", "Fogo", "Pedra", "Dragão"] },
    "Água": { strongAgainst: ["Fogo", "Terra", "Pedra"], weakAgainst: ["Água", "Grama", "Dragão"] },
    "Grama": { strongAgainst: ["Água", "Terra", "Pedra"], weakAgainst: ["Fogo", "Grama", "Veneno", "Voador", "Inseto", "Dragão", "Aço"] },
    "Elétrico": { strongAgainst: ["Água", "Voador"], weakAgainst: ["Elétrico", "Grama", "Dragão"] },
    "Psíquico": { strongAgainst: ["Lutador", "Veneno"], weakAgainst: ["Psíquico", "Aço"] },
    "Lutador": { strongAgainst: ["Normal", "Gelo", "Pedra", "Sombrio", "Aço"], weakAgainst: ["Veneno", "Voador", "Psíquico", "Inseto"] }
};

export function calculateTypeAdvantageMultiplier(attackerType, defenderType) {
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

// ------------------------------------------------------------
// ABERTURA DE ENCONTRO SELVAGEM
// ------------------------------------------------------------
export function openEncounterModalWithPokemon(wildPokemon) {
    const cp = getCurrentPlayer();
    if (!cp || !wildPokemon) return;

    currentEncounterState.wildPokemon = wildPokemon;
    currentEncounterState.selectedTeamMemberIndex = 0;
    currentEncounterState.itemBonus = 0;
    currentEncounterState.battlePowerBonus = 0;
    currentEncounterState.hasAttemptedCapture = false;
    currentEncounterState.selectedCaptureBallId = null;

    let encounterModal = document.getElementById('wild-encounter-modal');
    if (!encounterModal) {
        encounterModal = document.createElement('div');
        encounterModal.id = 'wild-encounter-modal';
        encounterModal.className = 'fixed inset-0 bg-black/90 z-[500] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(encounterModal);
    }

    encounterModal.innerHTML = `
        <div class="trainer-card max-w-4xl w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <span class="text-xs font-black text-amber-400 font-cinzel tracking-wider">ENCONTRO SELVAGEM</span>
                <button onclick="document.getElementById('wild-encounter-modal').remove()" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800 cursor-pointer">✕</button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-center justify-items-center py-4">
                <div id="player-card-visual"></div>
                <div id="enc-card-visual"></div>
            </div>

            <div class="flex flex-wrap gap-3 justify-center pt-2 border-t border-amber-900/60">
                <button onclick="window.resolveBattleAttempt()" class="bg-red-700 hover:bg-red-600 text-white font-black px-6 py-2.5 rounded-xl text-xs uppercase shadow cursor-pointer">
                    Atacar / Enfrentar
                </button>
                <button onclick="window.triggerCaptureFlow(currentEncounterState.wildPokemon)" class="bg-emerald-700 hover:bg-emerald-600 text-white font-black px-6 py-2.5 rounded-xl text-xs uppercase shadow cursor-pointer">
                    Tentar Capturar
                </button>
                <button onclick="document.getElementById('wild-encounter-modal').remove()" class="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-6 py-2.5 rounded-xl text-xs cursor-pointer">
                    Fugir / Ignorar
                </button>
            </div>
        </div>
    `;

    encounterModal.classList.remove('hidden');
    updateEncounterUIInfo();
}

export function closeEncounterModalUI() {
    const modal = document.getElementById('wild-encounter-modal');
    if (modal) modal.remove();
}

// ------------------------------------------------------------
// ATUALIZAÇÃO DA INTERFACE DE COMBATE
// ------------------------------------------------------------
export function updateEncounterUIInfo() {
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
                <p class="text-xs font-bold tracking-wide">HP: ${activeHp} / ${activeMaxHp} | STR: ${activeMon.str || 4}</p>
                <p class="text-[11px] font-black text-emerald-400 bg-emerald-950/90 rounded-xl px-2.5 py-1 border border-emerald-600">Pré-Soma: ~${estimatedPlayerPower} + [🎲 1-6]</p>
            </div>
            
            <button onclick="window.cyclePlayerEncounterPokemon()" class="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-amber-600 hover:bg-amber-500 text-black font-black text-[10px] px-3 py-1 rounded-full shadow border border-amber-300 uppercase tracking-wider cursor-pointer">
                Trocar Anima
            </button>
        `;
    }

    const encVisual = document.getElementById('enc-card-visual');
    if (encVisual) {
        encVisual.className = `relative flex flex-col justify-between p-4 rounded-3xl border-4 ${enemyCardBg} shadow-2xl w-72 h-96 text-white ${wild.isShiny ? 'shiny-card-glow' : ''}`;
        const weakenedBadge = wild.weakened ? `<span class="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-md font-bold shadow">Enfraquecido (+1 Cap.)</span>` : '';
        const shinyWildBadge = wild.isShiny ? `<span class="bg-amber-400 text-black text-[10px] px-2 py-0.5 rounded-md font-black shadow animate-pulse">SHINY SELVAGEM</span>` : '';
        
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
                </div>
            </div>

            <div class="w-full bg-black/90 text-red-300 rounded-2xl p-3 text-center space-y-1.5 shadow-md">
                <p class="text-xs font-bold tracking-wide">HP: ${wild.currentHp || wild.hp || 15} | STR: ${wild.str || 3}</p>
                <p class="text-[11px] font-black text-amber-300 bg-amber-950/90 rounded-xl px-2.5 py-1 border border-amber-600">Alvo p/ Capturar: ${displayTarget}+ (Bónus: +${totalCaptureBonusSoFar})</p>
                ${weakenedBadge}
            </div>

            <div class="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-red-800 text-white font-black text-[10px] px-3 py-1 rounded-full shadow border border-red-600 uppercase tracking-wider pointer-events-none">
                Inimigo Selvagem
            </div>
        `;
    }
}

window.cyclePlayerEncounterPokemon = function() {
    const cp = getCurrentPlayer();
    if (!cp || !Array.isArray(cp.activeTeam) || cp.activeTeam.length <= 1) return;
    currentEncounterState.selectedTeamMemberIndex = (currentEncounterState.selectedTeamMemberIndex + 1) % cp.activeTeam.length;
    updateEncounterUIInfo();
};

// ------------------------------------------------------------
// RESOLUÇÃO DE TENTATIVA DE ATAQUE
// ------------------------------------------------------------
window.resolveBattleAttempt = function() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;
    const activeMon = cp.activeTeam[currentEncounterState.selectedTeamMemberIndex];
    if (!wild || !activeMon) return;

    if ((activeMon.currentHp !== undefined ? activeMon.currentHp : activeMon.maxHp) <= 0) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup("Pokémon Desmaiado", "O teu Anima atual está com 0 de HP e não pode lutar! Troca de Anima ou usa um Revive.", false);
        }
        return;
    }

    // Simula rolar dados (se houver animação ou fallback aleatório)
    const runBattleWithRolls = (playerDice, wildDice) => {
        const typeMult = calculateTypeAdvantageMultiplier(activeMon.type, wild.type);
        const playerPower = Math.round(((activeMon.str || 4) + currentEncounterState.battlePowerBonus + playerDice) * typeMult);
        const wildPower = (wild.str || 3) + wildDice;

        if (playerPower >= wildPower) {
            const damageToWild = Math.max(10, playerPower - wildPower + 10);
            wild.currentHp = Math.max(0, (wild.currentHp !== undefined ? wild.currentHp : wild.maxHp) - damageToWild);

            if (wild.currentHp <= 0) {
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup("POKÉMON SELVAGEM DERROTADO!", `O teu ${activeMon.name} venceu e desmaiou o ${wild.name} selvagem!\n\nPodes agora tentar capturá-lo.`, true);
                }
                wild.weakened = true;
                if (wild.waypointId && typeof boardPokemonCards !== 'undefined' && boardPokemonCards[wild.waypointId]) {
                    boardPokemonCards[wild.waypointId].weakened = true;
                    boardPokemonCards[wild.waypointId].currentHp = 0;
                }
                if (typeof addExperienceToMonster === 'function') {
                    addExperienceToMonster(activeMon, 50);
                }
                triggerCaptureFlow(wild);
            } else {
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup("ATAQUE BEM-SUCEDIDO!", `O teu ${activeMon.name} causou ${damageToWild} de dano ao ${wild.name}!\n\nHP Restante do Selvagem: ${wild.currentHp}/${wild.maxHp || wild.hp}`, true);
                }
            }
            updateEncounterUIInfo();
        } else {
            const damageToPlayer = 15;
            activeMon.currentHp = Math.max(0, (activeMon.currentHp || activeMon.maxHp) - damageToPlayer);
            
            if (activeMon.currentHp <= 0) {
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup("O TEU POKÉMON DESMAIOU", `O ${wild.name} selvagem desferiu um golpe crítico!\n\nO teu ${activeMon.name} desmaiou (HP 0). A batalha contra este selvagem está encerrada para este Anima. Deves fugir ou trocar!`, false);
                }
                closeEncounterModalUI();
            } else {
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup("CONTRA-ATAQUE SOFRIDO", `O ${wild.name} selvagem foi mais forte nesta ronda!\n\n${activeMon.name} sofreu ${damageToPlayer} de dano.`, false);
                }
            }
            if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
            updateEncounterUIInfo();
        }
    };

    if (typeof rollDiceWithAnimation === 'function') {
        rollDiceWithAnimation((pDice) => {
            const wDice = Math.floor(Math.random() * 6) + 1;
            runBattleWithRolls(pDice, wDice);
        });
    } else {
        const pDice = Math.floor(Math.random() * 6) + 1;
        const wDice = Math.floor(Math.random() * 6) + 1;
        runBattleWithRolls(pDice, wDice);
    }
};

// ------------------------------------------------------------
// FLUXO DE CAPTURA E ESCOLHA DE ESFERA
// ------------------------------------------------------------
export function triggerCaptureFlow(wildPokemon) {
    const cp = getCurrentPlayer();
    if (!cp.inventory) cp.inventory = [];

    const availableSpheres = cp.inventory.filter(i => i.type === 'sphere' && (Number(i.count) || Number(i.quantity) || 0) > 0);

    if (availableSpheres.length === 0) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup(
                "Sem Poké Balls!", 
                "Não tens nenhuma Poké Ball, Great Ball ou Ultra Ball na tua mochila!\n\nVisita o Poké Mart numa cidade para adquirir esferas antes de tentares capturar este Anima.", 
                false
            );
        }
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

        const itemCount = sphere.count !== undefined ? sphere.count : sphere.quantity;
        const sphereImg = sphere.image ? `<img src="${sphere.image}" class="w-6 h-6 object-contain inline-block mr-1">` : '';

        sphereButtonsHtml += `
            <button onclick="document.getElementById('capture-flow-modal').remove(); window.attemptCatchWithSpecificBall('${sphere.id}', '${wildPokemon.waypointId || 0}')" class="${btnColor} text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer flex items-center gap-1.5 shadow">
                ${sphereImg} <span>${sphere.name} (${itemCount})</span>
            </button>
        `;
    });

    captureModal.innerHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] text-white text-center">
            <h3 class="text-sm font-black text-amber-400 uppercase">TENTATIVA DE CAPTURA</h3>
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
    if (!cp || !Array.isArray(cp.inventory)) return;

    if (currentEncounterState.hasAttemptedCapture) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup("Tentativa já realizada", "Você já tentou capturar neste turno. Aguarde o próximo turno.", false);
        }
        return;
    }

    const sphereItem = cp.inventory.find(item => item && item.id === ballItemId && item.type === 'sphere' && (Number(item.count) || Number(item.quantity) || 0) > 0);

    if (!sphereItem) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup("Sem Poké Ball", "Você não possui essa Poké Ball em quantidade disponível.", false);
        }
        return;
    }

    if (sphereItem.count !== undefined) sphereItem.count--;
    else if (sphereItem.quantity !== undefined) sphereItem.quantity--;

    currentEncounterState.itemBonus = Number(sphereItem.value) || 0;
    currentEncounterState.selectedCaptureBallId = sphereItem.id;
    currentEncounterState.hasAttemptedCapture = true;

    if (sphereItem.aura) {
        // Atribui a aura temporária para o state global
        if (typeof window !== 'undefined') window.selectedBallAura = sphereItem.aura;
    }

    resolveCaptureAttempt();
    if (typeof renderBottomPanel === 'function') renderBottomPanel();
};

function resolveCaptureAttempt() {
    const wild = currentEncounterState.wildPokemon;
    if (!wild) return;

    const tier = wild.tier || 1;
    let targetNumber = 4;
    if (tier === 2) targetNumber = 5;
    else if (tier === 3 || tier === 4) targetNumber = 6;
    else if ((wild.tier === 5) || (wild.color && wild.color.toLowerCase() === 'amarelo')) targetNumber = 7;
    if (wild.isShiny) targetNumber += 1;

    const isLegendary = (wild.tier === 5) || (wild.color && wild.color.toLowerCase() === 'amarelo');
    const weakenedBonus = (wild.weakened && !isLegendary) ? 1 : 0;
    const totalBonus = currentEncounterState.itemBonus + weakenedBonus;

    const rollCapture = (diceVal) => {
        const finalScore = diceVal + totalBonus;
        if (finalScore >= targetNumber) {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup("CAPTURA BEM-SUCEDIDA!", `Parabéns! O dado rolou ${diceVal} + Bónus (${totalBonus}) = ${finalScore} (Alvo: ${targetNumber}).\n\nO ${wild.name} foi capturado com sucesso e enviado para a PC Box!`, true);
            }
            if (typeof addMonsterToPlayer === 'function') {
                addMonsterToPlayer(wild);
            }
            if (wild.waypointId && typeof boardPokemonCards !== 'undefined') {
                delete boardPokemonCards[wild.waypointId];
            }
            closeEncounterModalUI();
            if (typeof renderBoardMap === 'function') renderBoardMap();
            if (typeof saveGameProgress === 'function') saveGameProgress();
        } else {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup("FALHA NA CAPTURA!", `O ${wild.name} escapou da esfera! O dado rolou ${diceVal} + Bónus (${totalBonus}) = ${finalScore} (Alvo necessário: ${targetNumber}).`, false);
            }
            updateEncounterUIInfo();
        }
    };

    if (typeof rollDiceWithAnimation === 'function') {
        rollDiceWithAnimation(rollCapture);
    } else {
        const dVal = Math.floor(Math.random() * 6) + 1;
        rollCapture(dVal);
    }
}
