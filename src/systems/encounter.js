// --- src/systems/encounter.js ---
// Subsistema Unificado de Batalhas TCG Selvagens, Captura, XP, Evolução e Sincronização Cloud

import { gameState, getCurrentPlayer } from '../core/state.js';
import { renderTeamCardSlots, renderBottomPanel } from './pcbox.js';
import { SUPABASE_STORAGE_URL } from '../config/constants.js';
import { MONSTER_CATALOG } from '../config/cards-data.js';
import { saveGameProgress } from '../core/storage.js';
import { emitSocket } from '../core/socket.js';

export let currentEncounterState = {
    wildPokemon: null,
    itemBonus: 0,
    battlePowerBonus: 0,
    selectedTeamMemberIndex: 0,
    selectedCaptureBallId: null,
    hasAttemptedCapture: false,
    wildDefeated: false
};

function getTierColorClass(tier) {
    switch (Number(tier)) {
        case 1: return 'from-stone-800 via-stone-900 to-black border-stone-600';
        case 2: return 'from-emerald-950 via-stone-900 to-black border-emerald-600';
        case 3: return 'from-blue-950 via-stone-900 to-black border-blue-600';
        case 4: return 'from-purple-950 via-stone-900 to-black border-purple-600';
        case 5: return 'from-amber-950 via-yellow-950 to-black border-amber-500';
        default: return 'from-slate-900 to-black border-slate-700';
    }
}

// Detetora ultra-robusta e flexível para vantagem de tipagem em tipos compostos, strings ou arrays
function calculateTypeAdvantageMultiplier(attackerType, defenderType) {
    if (!attackerType || !defenderType) return 1.0;
    
    const parseTypes = (t) => {
        if (Array.isArray(t)) return t.flatMap(x => String(x).toLowerCase().split(/[\/\s,]+/)).filter(Boolean);
        return String(t).toLowerCase().split(/[\/\s,]+/).filter(Boolean);
    };

    const attackerTypes = parseTypes(attackerType);
    const defenderTypes = parseTypes(defenderType);
    
    // Tabela oficial/estendida de vantagens de Kanto/Geração clássica
    const advantages = {
        'fire': ['grass', 'bug', 'ice', 'steel'],
        'water': ['fire', 'ground', 'rock'],
        'grass': ['water', 'ground', 'rock'],
        'electric': ['water', 'flying'],
        'psychic': ['fighting', 'poison'],
        'fighting': ['normal', 'ice', 'rock', 'dark', 'steel'],
        'ice': ['grass', 'ground', 'flying', 'dragon'],
        'ground': ['fire', 'electric', 'poison', 'rock', 'steel'],
        'rock': ['fire', 'ice', 'flying', 'bug'],
        'flying': ['grass', 'fighting', 'bug'],
        'bug': ['grass', 'psychic', 'dark'],
        'poison': ['grass', 'fairy'],
        'ghost': ['psychic', 'ghost'],
        'dragon': ['dragon']
    };

    for (let a of attackerTypes) {
        for (let d of defenderTypes) {
            if (advantages[a] && advantages[a].includes(d)) {
                return 1.5; // Vantagem detetada!
            }
        }
    }
    return 1.0;
}

export function generateWildPokemonForWaypoint(waypointId, waypointColor = 'rosa') {
    if (!Array.isArray(MONSTER_CATALOG) || MONSTER_CATALOG.length === 0) return null;

    let targetTier = 1;
    const color = String(waypointColor).toLowerCase();
    if (color === 'verde') targetTier = 2;
    else if (color === 'azul') targetTier = 3;
    else if (color === 'vermelho') targetTier = 4;
    else if (color === 'amarelo') targetTier = 5;

    let tierFiltered = MONSTER_CATALOG.filter(m => Number(m.tier || 1) === targetTier);
    if (tierFiltered.length === 0) tierFiltered = MONSTER_CATALOG;

    const baseMon = tierFiltered[Math.floor(Math.random() * tierFiltered.length)];
    const tier = baseMon.tier || targetTier;

    let minLevel = 3, maxLevel = 6;
    if (tier === 2) { minLevel = 8; maxLevel = 12; }
    else if (tier === 3) { minLevel = 15; maxLevel = 22; }
    else if (tier === 4) { minLevel = 25; maxLevel = 35; }
    else if (tier === 5) { minLevel = 40; maxLevel = 50; }

    const level = Math.floor(Math.random() * (maxLevel - minLevel + 1)) + minLevel;
    const isShiny = Math.random() < 0.06; // 6% de chance
    
    const maxHp = 20 + (level * 4);
    const calculatedStr = 5 + Math.floor(level * 0.9);

    return {
        ...baseMon,
        uniqueId: 'wild_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        level: level,
        tier: tier,
        currentHp: maxHp,
        maxHp: maxHp,
        str: calculatedStr,
        isShiny: isShiny,
        waypointId: waypointId,
        weakened: false
    };
}

export function openEncounterModalWithPokemon(pokemon) {
    const cp = getCurrentPlayer();
    
    let modal = document.getElementById('wild-encounter-modal') || document.getElementById('encounter-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wild-encounter-modal';
        modal.className = 'fixed inset-0 bg-black/90 z-[500] flex items-center justify-center p-4 backdrop-blur-md hidden';
        document.body.appendChild(modal);
    }

    if (!cp.activeTeam || cp.activeTeam.length === 0) {
        showCustomPopup("Aviso", "🚫 Precisas de pelo menos um Pokémon na Equipa Ativa!", false);
        return;
    }

    let validIndex = cp.activeTeam.findIndex(m => (m.currentHp !== undefined ? m.currentHp : m.maxHp) > 0);
    if (validIndex === -1) {
        showCustomPopup("Equipa Desmaiada!", "⚠ Todos os Pokémon da tua Equipa Ativa estão desmaiados (HP 0)!", false);
        return;
    }

    currentEncounterState.wildPokemon = pokemon;
    currentEncounterState.itemBonus = 0;
    currentEncounterState.battlePowerBonus = 0;
    currentEncounterState.selectedTeamMemberIndex = validIndex;
    currentEncounterState.selectedCaptureBallId = null;
    currentEncounterState.hasAttemptedCapture = false;
    currentEncounterState.wildDefeated = (pokemon.currentHp <= 0);

    modal.innerHTML = `
        <div class="trainer-card max-w-4xl w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white relative">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <div class="flex items-center gap-2">
                    <span class="text-lg">⚔️</span>
                    <h2 class="text-xs font-black text-amber-400 font-cinzel tracking-wider">ARENA DE COMBATE TCG & CAPTURA</h2>
                </div>
                <button onclick="fleeEncounter()" class="text-amber-400 hover:text-white font-bold text-sm px-2.5 py-1 bg-black/60 rounded-lg border border-amber-800 cursor-pointer transition-all hover:bg-red-950">✕ Fechar</button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 justify-items-center items-center py-2">
                <div id="player-card-visual" class="w-72 h-[420px] bg-gradient-to-b from-amber-100 via-amber-50 to-amber-200 border-4 border-amber-600 rounded-3xl p-4 flex flex-col justify-between text-black shadow-2xl relative transition-all"></div>
                <div id="enc-card-visual" class="w-72 h-[420px] bg-gradient-to-b from-red-950 via-stone-900 to-black border-4 border-red-600 rounded-3xl p-4 flex flex-col justify-between text-white shadow-2xl relative transition-all"></div>
            </div>

            <div class="border-t border-amber-900/60 pt-3 bg-black/30 p-3 rounded-2xl">
                <p class="text-[10px] text-amber-300 font-bold mb-2 flex items-center gap-1"><span>🎒</span> Mochila de Combate (Seleciona uma Esfera para Capturar):</p>
                <div id="encounter-items-container" class="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-1"></div>
            </div>

            <div class="flex flex-wrap justify-center gap-3 pt-1" id="encounter-actions-container">
                <button id="btn-action-attack" onclick="resolveBattleAttempt()" class="bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white font-black px-6 py-2.5 rounded-xl text-xs uppercase shadow-lg cursor-pointer flex items-center gap-2 border border-blue-400 transition-all">
                    <span>⚔️</span> Atacar (Rolar Dado)
                </button>
                <button id="btn-action-capture" onclick="resolveCaptureAttempt()" class="bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-500 hover:to-green-600 text-white font-black px-6 py-2.5 rounded-xl text-xs uppercase shadow-lg cursor-pointer flex items-center gap-2 border border-emerald-400 transition-all ${currentEncounterState.wildDefeated ? '' : 'opacity-40 cursor-not-allowed'}">
                    <span>🔴</span> Tentar Capturar ${currentEncounterState.wildDefeated ? '(Disponível)' : '(Derrote o Selvagem Primeiro)'}
                </button>
                <button onclick="fleeEncounter()" class="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-5 py-2.5 rounded-xl text-xs cursor-pointer border border-slate-600 transition-all">
                    <span>🏃‍♂️</span> Fugir
                </button>
            </div>
        </div>
    `;

    updateEncounterUIInfo();
    renderEncounterItemsList();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function updateEncounterUIInfo() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;
    const activeMon = cp.activeTeam[currentEncounterState.selectedTeamMemberIndex] || cp.activeTeam[0];
    if (!wild || !activeMon) return;

    // Correção automática de segurança para status antigos desatualizados
    if (activeMon.level && (!activeMon.str || activeMon.str < (4 + activeMon.level))) {
        activeMon.str = 5 + Math.floor(activeMon.level * 0.9);
    }

    const activeHp = activeMon.currentHp !== undefined ? activeMon.currentHp : (activeMon.maxHp || 20);
    const activeMaxHp = activeMon.maxHp || activeMon.hp || 20;
    const wildHp = wild.currentHp !== undefined ? wild.currentHp : (wild.maxHp || 20);
    const wildMaxHp = wild.maxHp || wild.hp || 20;

    // Garante leitura correta dos tipos do jogador e do selvagem (seja string ou array)
    const pType = activeMon.types || activeMon.type;
    const wType = wild.types || wild.type;

    const typeMult = calculateTypeAdvantageMultiplier(pType, wType);
    let advantageBadgeHtml = '';
    if (typeMult > 1.0) {
        advantageBadgeHtml = `<span class="bg-emerald-500 text-black text-[9px] px-2 py-0.5 rounded font-black uppercase">⚡ Vantagem (1.5x)</span>`;
    } else if (typeMult < 1.0) {
        advantageBadgeHtml = `<span class="bg-red-700 text-white text-[9px] px-2 py-0.5 rounded font-black uppercase">⚠️ Desvantagem</span>`;
    }

    const baseStr = (activeMon.str || (5 + (activeMon.level * 0.9))) + currentEncounterState.battlePowerBonus;
    const estimatedPlayerPower = Math.round(baseStr * typeMult); 
    
    const isLegendary = (wild.tier === 5) || (wild.color && wild.color.toLowerCase() === 'amarelo');
    const weakenedBonus = 2;
    const totalCaptureBonusSoFar = currentEncounterState.itemBonus + weakenedBonus;

    let displayTarget = 4;
    const tier = wild.tier || 1;
    if (tier === 2) displayTarget = 5;
    else if (tier === 3 || tier === 4) displayTarget = 6;
    else if (isLegendary) displayTarget = 7;
    if (wild.isShiny) displayTarget += 1;

    const playerCardBg = getTierColorClass(activeMon.tier || 1);
    const enemyCardBg = getTierColorClass(wild.tier || 1);

    const playerVisual = document.getElementById('player-card-visual');
    if (playerVisual) {
        const activeMonTypeDisplay = Array.isArray(activeMon.types) ? activeMon.types.join('/') : (activeMon.type || 'Normal');
        playerVisual.className = `relative flex flex-col justify-between p-4 rounded-3xl border-4 ${playerCardBg} shadow-2xl w-72 h-[420px] text-white`;
        playerVisual.innerHTML = `
            <div class="flex justify-between items-center font-black text-xs border-b-2 border-amber-400 pb-2">
                <span class="text-amber-300 font-bold uppercase">NV. ${activeMon.level || 1} (EXP: ${activeMon.exp || 0})</span>
                ${advantageBadgeHtml}
                <span class="text-amber-900 bg-amber-200 px-2 py-0.5 rounded font-bold uppercase text-[10px] border border-amber-400">${activeMonTypeDisplay}</span>
            </div>
            
            <div class="flex flex-col items-center justify-center my-auto space-y-3">
                <h3 class="text-base font-black text-white text-center truncate w-full">${activeMon.name}</h3>
                <div class="flex items-center justify-center bg-black/60 w-36 h-36 rounded-2xl border-2 border-amber-400 shadow-inner p-3 relative">
                    <img src="${activeMon.isShiny && activeMon.shinyImage ? activeMon.shinyImage : (activeMon.image || '')}" alt="${activeMon.name}" class="max-h-32 max-w-full object-contain drop-shadow-md" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                </div>
            </div>

            <div class="w-full bg-black/90 text-amber-300 rounded-2xl p-3 text-center space-y-1.5 shadow-md border border-amber-500/40">
                <p class="text-xs font-bold tracking-wide">HP: ${activeHp} / ${activeMaxHp} &nbsp;|&nbsp; STR: ${activeMon.str || 5}</p>
                <p class="text-[11px] font-black text-emerald-400 bg-emerald-950/90 rounded-xl px-2.5 py-1 border border-emerald-600">🎲 Soma Base: ~${estimatedPlayerPower} + [Dado]</p>
            </div>
            
            <button onclick="cyclePlayerEncounterPokemon()" class="absolute -bottom-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-[10px] px-3.5 py-1.5 rounded-full shadow-lg border border-white uppercase tracking-wider cursor-pointer flex items-center gap-1 transition-transform hover:scale-105">
                <span>🔄</span> Trocar Anima (${currentEncounterState.selectedTeamMemberIndex + 1}/${cp.activeTeam.length})
            </button>
        `;
    }

    const encVisual = document.getElementById('enc-card-visual');
    if (encVisual) {
        const wildTypeDisplay = Array.isArray(wild.types) ? wild.types.join('/') : (wild.type || 'Normal');
        encVisual.className = `relative flex flex-col justify-between p-4 rounded-3xl border-4 ${enemyCardBg} shadow-2xl w-72 h-[420px] text-white ${wild.isShiny ? 'shiny-card-glow' : ''}`;
        const statusBadge = currentEncounterState.wildDefeated 
            ? `<span class="bg-emerald-600 text-white text-[9px] px-2 py-0.5 rounded-md font-bold shadow animate-bounce">🏆 DERROTADO (Pronto a Capturar!)</span>`
            : `<span class="bg-red-600 text-white text-[9px] px-2 py-0.5 rounded-md font-bold shadow">⚔️ Em Combate</span>`;
        const shinyWildBadge = wild.isShiny ? `<span class="bg-amber-400 text-black text-[9px] px-2 py-0.5 rounded-md font-black shadow animate-bounce">✨ SHINY</span>` : '';
        
        encVisual.innerHTML = `
            <div class="flex justify-between items-center font-black text-xs border-b-2 border-red-900 pb-2">
                <span class="text-red-400 font-bold uppercase">NV. ${wild.level || 1}</span>
                ${shinyWildBadge}
                <span class="text-red-300 bg-red-950 px-2 py-0.5 rounded font-bold uppercase text-[10px] border border-red-800">${wildTypeDisplay}</span>
            </div>

            <div class="flex flex-col items-center justify-center my-auto space-y-3">
                <h3 class="text-base font-black text-white text-center truncate w-full">${wild.name}</h3>
                <div class="flex items-center justify-center bg-black/60 w-36 h-36 rounded-2xl border-2 ${wild.isShiny ? 'border-amber-400 shiny-card-glow' : 'border-red-800'} shadow-inner p-3 relative">
                    <img src="${wild.isShiny && wild.shinyImage ? wild.shinyImage : (wild.image || '')}" alt="${wild.name}" class="max-h-32 max-w-full object-contain drop-shadow-md" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                </div>
            </div>

            <div class="w-full bg-black/90 text-red-300 rounded-2xl p-3 text-center space-y-1.5 shadow-md border border-red-600/40">
                <p class="text-xs font-bold tracking-wide">HP: ${wildHp} / ${wildMaxHp} &nbsp;|&nbsp; STR: ${wild.str || 3}</p>
                <p class="text-[11px] font-black text-amber-300 bg-amber-950/90 rounded-xl px-2.5 py-1 border border-emerald-600">🎯 Alvo Cap.: ${displayTarget}+ (Bónus: +${totalCaptureBonusSoFar})</p>
                ${statusBadge}
            </div>

            <div class="absolute -bottom-3.5 left-1/2 -translate-x-1/2 bg-red-900 text-amber-300 font-black text-[10px] px-3.5 py-1 rounded-full shadow border border-red-500 uppercase tracking-wider pointer-events-none">
                Inimigo Selvagem
            </div>
        `;
    }

    const btnCapture = document.getElementById('btn-action-capture');
    if (btnCapture) {
        if (currentEncounterState.wildDefeated) {
            btnCapture.className = "bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-500 hover:to-green-600 text-white font-black px-6 py-2.5 rounded-xl text-xs uppercase shadow-lg cursor-pointer flex items-center gap-2 border border-emerald-400 transition-all animate-pulse";
            btnCapture.innerHTML = `<span>🔴</span> Tentar Capturar (Disponível!)`;
        } else {
            btnCapture.className = "bg-gradient-to-r from-emerald-600 to-green-700 text-white font-black px-6 py-2.5 rounded-xl text-xs uppercase shadow-lg opacity-40 cursor-not-allowed flex items-center gap-2 border border-emerald-400 transition-all";
            btnCapture.innerHTML = `<span>🔴</span> Tentar Capturar (Derrote o Selvagem Primeiro)`;
        }
    }
}

export function cyclePlayerEncounterPokemon() {
    const cp = getCurrentPlayer();
    if (!cp || !Array.isArray(cp.activeTeam) || cp.activeTeam.length <= 1) {
        showCustomPopup("Aviso", "Só tens este Pokémon na equipa ativa!", false);
        return;
    }
    
    let startIndex = currentEncounterState.selectedTeamMemberIndex;
    let nextIndex = (startIndex + 1) % cp.activeTeam.length;
    
    while (nextIndex !== startIndex) {
        let mon = cp.activeTeam[nextIndex];
        let hp = mon.currentHp !== undefined ? mon.currentHp : (mon.maxHp || 20);
        if (hp > 0) break;
        nextIndex = (nextIndex + 1) % cp.activeTeam.length;
    }

    currentEncounterState.selectedTeamMemberIndex = nextIndex;
    const switchedMon = cp.activeTeam[nextIndex];
    showCustomPopup("Troca de Anima", `🔄 Enviaste para a frente de batalha o ${switchedMon.name}!`, true);
    
    // Força a atualização imediata da HUD de combate
    updateEncounterUIInfo();
}

export function renderEncounterItemsList() {
    const cp = getCurrentPlayer();
    const container = document.getElementById('encounter-items-container');
    if (!container) return;
    container.innerHTML = '';

    if (cp.inventory) {
        cp.inventory.forEach((item) => {
            const count = item.count !== undefined ? item.count : (item.quantity || 0);
            if (!item || count <= 0) return;
            const isSphere = item.type === 'sphere' || item.category === 'capture' || item.id.includes('ball') || item.type === 'evolution_stone';
            if (!isSphere) return;

            const btn = document.createElement('button');
            const isSelected = currentEncounterState.selectedCaptureBallId === item.id;
            btn.className = `px-3 py-1.5 rounded-xl border text-[10px] flex items-center gap-1.5 shadow cursor-pointer transition-all ${isSelected ? 'bg-emerald-800 border-emerald-400 text-white font-bold ring-2 ring-emerald-500' : 'bg-blue-950 hover:bg-blue-900 text-blue-200 border-blue-600'}`;
            const itemImg = item.image ? `<img src="${item.image}" class="w-4 h-4 object-contain">` : `<span>${item.icon || '🔴'}</span>`;
            btn.innerHTML = `${itemImg} <span>${item.name} (${count})</span> ${isSelected ? '✓' : ''}`;
            btn.onclick = () => selectCaptureBall(item);
            container.appendChild(btn);
        });
    }
}

export function selectCaptureBall(item) {
    const count = item.count !== undefined ? item.count : (item.quantity || 0);
    if (count <= 0) {
        showCustomPopup("Sem Esferas", "Não tens unidades suficientes desta Poké Ball!", false);
        return;
    }
    currentEncounterState.itemBonus = Number(item.value) || 1;
    currentEncounterState.selectedCaptureBallId = item.id;
    showCustomPopup("Esfera Selecionada", `🔴 Selecionaste ${item.name} (+${item.value} Bónus de Captura). Poca agora em 'Tentar Capturar'!`, true);
    renderEncounterItemsList();
    updateEncounterUIInfo();
}

function playDiceRollingAnimationOverlay(onComplete) {
    let overlay = document.getElementById('dice-roll-visual-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'dice-roll-visual-overlay';
        overlay.className = 'fixed inset-0 bg-black/80 z-[600] flex flex-col items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div class="trainer-card max-w-xs w-full p-6 text-center space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl animate-bounce">
            <h3 class="text-sm font-black text-amber-400 font-cinzel">🎲 A Rolar o Dado...</h3>
            <div class="text-6xl text-white font-black py-4 animate-spin">
                <i class="fa-solid fa-dice text-amber-400"></i>
            </div>
            <p class="text-xs text-slate-300">A calcular poder de combate...</p>
        </div>
    `;
    overlay.classList.remove('hidden');

    setTimeout(() => {
        overlay.remove();
        const finalRoll = Math.floor(Math.random() * 6) + 1;
        if (typeof onComplete === 'function') {
            onComplete(finalRoll);
        }
    }, 1000);
}

function playAttackAnimation() {
    const pCard = document.getElementById('player-card-visual');
    const eCard = document.getElementById('enc-card-visual');
    if (pCard && eCard) {
        pCard.classList.add('translate-x-4', 'scale-105');
        eCard.classList.add('-translate-x-4', 'brightness-125', 'animate-pulse');
        setTimeout(() => {
            pCard.classList.remove('translate-x-4', 'scale-105');
            eCard.classList.remove('-translate-x-4', 'brightness-125', 'animate-pulse');
        }, 500);
    }
}

function syncGameStateToCloud() {
    saveGameProgress();
    if (typeof emitSocket === 'function') {
        emitSocket('save_game_state', {
            gameState: gameState,
            trainerName: getCurrentPlayer()?.name || 'Treinador'
        });
    }
}

function addExperienceAndCheckEvolution(monster, expGain) {
    if (!monster) return;
    monster.exp = (monster.exp || 0) + expGain;
    const nextLevelExp = (monster.level || 1) * 100;

    if (monster.exp >= nextLevelExp) {
        monster.level = (monster.level || 1) + 1;
        monster.exp -= nextLevelExp;
        
        monster.maxHp = (monster.maxHp || 20) + 5;
        monster.currentHp = monster.maxHp;
        monster.str = (monster.str || 5) + 2;

        showCustomPopup("✨ SUBIDA DE NÍVEL!", `O teu ${monster.name} subiu para o Nível ${monster.level}!\nOs seus atributos melhoraram (STR +2, HP +5)!`, true);

        const baseCatalogItem = MONSTER_CATALOG.find(m => m.id === monster.catalogId || m.id === monster.id || m.name.toLowerCase() === monster.name.toLowerCase());
        
        if (baseCatalogItem && baseCatalogItem.evolvesTo && monster.level >= (baseCatalogItem.evolveLevel || 16)) {
            const evolvedData = MONSTER_CATALOG.find(m => m.id === baseCatalogItem.evolvesTo);
            if (evolvedData) {
                const oldName = monster.name;
                monster.name = evolvedData.name;
                monster.id = evolvedData.id;
                monster.catalogId = evolvedData.id;
                if (evolvedData.image) monster.image = evolvedData.image;
                if (evolvedData.types) monster.types = evolvedData.types;
                showCustomPopup("🧬 EVOLUÇÃO POR NÍVEL!", `Incrível! O teu ${oldName} evoluiu para ${monster.name}!`, true);
            }
        }
    }
    syncGameStateToCloud();
}

export function evolveMonsterWithStone(monster, stoneItemId) {
    if (!monster) return false;
    const baseCatalogItem = MONSTER_CATALOG.find(m => m.id === monster.catalogId || m.id === monster.id);
    if (!baseCatalogItem || !baseCatalogItem.evolvesTo) {
        showCustomPopup("Evolução Impossível", "Este Pokémon já está na sua forma final ou não possui evolução configurada.", false);
        return false;
    }

    const evolvedData = MONSTER_CATALOG.find(m => m.id === baseCatalogItem.evolvesTo);
    if (evolvedData) {
        const oldName = monster.name;
        monster.name = evolvedData.name;
        monster.id = evolvedData.id;
        monster.catalogId = evolvedData.id;
        if (evolvedData.image) monster.image = evolvedData.image;
        if (evolvedData.types) monster.types = evolvedData.types;
        showCustomPopup("🧬 EVOLUÇÃO POR ITEM!", `A pedra reage! O teu ${oldName} evoluiu para ${monster.name}!`, true);
        syncGameStateToCloud();
        return true;
    }
    return false;
}

export function resolveBattleAttempt() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;
    const activeMon = cp.activeTeam[currentEncounterState.selectedTeamMemberIndex];
    if (!wild || !activeMon) return;

    if (currentEncounterState.wildDefeated) {
        showCustomPopup("Pokémon Derrotado", "⚠ O Pokémon selvagem já foi derrotado! Usa a opção de Capturar ou foge.", false);
        return;
    }

    if ((activeMon.currentHp !== undefined ? activeMon.currentHp : activeMon.maxHp) <= 0) {
        showCustomPopup("Pokémon Desmaiado", "⚠ O teu Anima atual está com 0 de HP e não pode lutar! Troca de Pokémon.", false);
        return;
    }

    playDiceRollingAnimationOverlay((playerDice) => {
        playAttackAnimation();

        const wildDice = Math.floor(Math.random() * 6) + 1;
        const pType = activeMon.types || activeMon.type;
        const wType = wild.types || wild.type;
        const typeMult = calculateTypeAdvantageMultiplier(pType, wType);

        const playerPower = Math.round(((activeMon.str || (5 + (activeMon.level * 0.9))) + currentEncounterState.battlePowerBonus + playerDice) * typeMult);
        const wildPower = (wild.str || 4) + wildDice;

        if (playerPower >= wildPower) {
            const damageToWild = Math.max(12, playerPower - wildPower + 8);
            wild.currentHp = Math.max(0, (wild.currentHp !== undefined ? wild.currentHp : wild.maxHp) - damageToWild);

            if (wild.currentHp <= 0) {
                currentEncounterState.wildDefeated = true;
                addExperienceAndCheckEvolution(activeMon, 85);
                showCustomPopup("🏆 VITÓRIA NO COMBATE TCG!", `O teu ${activeMon.name} (Soma: ${playerPower} | Dado: ${playerDice}) derrotou o ${wild.name} (Soma: ${wildPower})!\n\n✨ Ganhou XP e o selvagem ficou enfraquecido!\n\n🔴 Podes agora clicar em 'Tentar Capturar'!`, true);
            } else {
                showCustomPopup("⚔️ ATAQUE EFICAZ!", `O teu ${activeMon.name} (Dado: ${playerDice}) causou ${damageToWild} de dano!\n\n(Ataque: ${playerPower} vs Defesa: ${wildPower})\nHP do Selvagem: ${wild.currentHp}/${wild.maxHp}`, true);
            }
            updateEncounterUIInfo();
        } else {
            const damageToPlayer = 10 + Math.floor(wild.level * 0.4);
            activeMon.currentHp = Math.max(0, (activeMon.currentHp || activeMon.maxHp) - damageToPlayer);
            
            if (activeMon.currentHp <= 0) {
                showCustomPopup("💀 O TEU POKÉMON DESMAIOU", `O ${wild.name} contra-atacou com força (Soma: ${wildPower} vs ${playerPower})!\n\n💔 ${activeMon.name} desmaiou. Troca para outro Pokémon na equipa se tiveres disponíveis.`, false);
                
                const healthyRemaining = cp.activeTeam.some(m => (m.currentHp !== undefined ? m.currentHp : m.maxHp) > 0);
                if (!healthyRemaining) {
                    showCustomPopup("Derrota Total", "⚠ Toda a tua equipa ativa desmaiou!", false);
                    closeEncounterModalUI();
                }
            } else {
                showCustomPopup("💥 CONTRA-ATAQUE SOFRIDO", `O ${wild.name} selvagem defendeu-se!\n\n💔 ${activeMon.name} sofreu ${damageToPlayer} de dano.\nHP Restante: ${activeMon.currentHp}/${activeMon.maxHp}`, false);
            }
            renderTeamCardSlots();
            updateEncounterUIInfo();
        }
        syncGameStateToCloud();
    });
}

export function resolveCaptureAttempt() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;
    if (!wild) return;

    if (!currentEncounterState.wildDefeated) {
        showCustomPopup("Ação Bloqueada", "⚠ Tens de derrotar (fazer o HP chegar a 0) o Pokémon selvagem em combate antes de o poderes capturar!", false);
        return;
    }

    if (!currentEncounterState.selectedCaptureBallId) {
        showCustomPopup("Esfera Necessária", "⚠ Deves selecionar primeiro uma Poké Ball na tua mochila de combate em baixo para tentar capturar!", false);
        return;
    }

    const sphereItem = cp.inventory.find(i => i.id === currentEncounterState.selectedCaptureBallId && (Number(i.count) || Number(i.quantity) || 0) > 0);
    if (!sphereItem) {
        showCustomPopup("Sem Esferas", "Não tens essa Poké Ball disponível na mochila!", false);
        return;
    }

    if (sphereItem.count !== undefined) sphereItem.count--;
    else if (sphereItem.quantity !== undefined) sphereItem.quantity--;

    playDiceRollingAnimationOverlay((roll) => {
        let requiredTarget = 4;
        const tier = wild.tier || 1;
        const isLegendary = tier === 5 || String(wild.color || '').toLowerCase() === 'amarelo';

        if (tier === 2) requiredTarget = 5;
        if (tier === 3 || tier === 4) requiredTarget = 6;
        if (isLegendary) requiredTarget = 7;
        if (wild.isShiny) requiredTarget++;

        const weakenedBonus = 2;
        const captureBonus = Number(currentEncounterState.itemBonus) || 0;
        const totalCaptureValue = roll + captureBonus + weakenedBonus;

        const encCard = document.getElementById('enc-card-visual');
        if (encCard) {
            encCard.classList.add('animate-bounce');
            setTimeout(() => encCard.classList.remove('animate-bounce'), 800);
        }

        if (totalCaptureValue >= requiredTarget || currentEncounterState.selectedCaptureBallId.includes('master')) {
            showCustomPopup(
                "🎉 CAPTURA BEM-SUCEDIDA!",
                `Capturaste com sucesso o ${wild.name} (Nv.${wild.level || 1})!\n[Dado: ${roll} + Bónus: ${captureBonus + weakenedBonus} = ${totalCaptureValue} / Alvo: ${requiredTarget}+]`,
                true
            );

            const caughtMonster = {
                ...wild,
                uniqueId: 'mon_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                catalogId: wild.id,
                currentHp: wild.maxHp || 20,
                exp: 0
            };

            if (!Array.isArray(cp.activeTeam)) cp.activeTeam = [];
            if (!Array.isArray(cp.pcBox)) cp.pcBox = [];

            if (cp.activeTeam.length < 6) {
                cp.activeTeam.push(caughtMonster);
            } else {
                cp.pcBox.push(caughtMonster);
                showCustomPopup("PC Box", `📦 Equipa cheia! O ${wild.name} foi enviado para a PC Box.`, true);
            }

            if (!Array.isArray(cp.pokedex)) cp.pokedex = [];
            if (!cp.pokedex.includes(wild.id)) cp.pokedex.push(wild.id);

            if (wild.waypointId && typeof boardPokemonCards !== 'undefined') {
                dispatchDeleteBoardCard(wild.waypointId);
            }

            closeEncounterModalUI();
            if (typeof renderBoardMap === 'function') renderBoardMap();
            if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
            if (typeof renderBottomPanel === 'function') renderBottomPanel();
            syncGameStateToCloud();
        } else {
            showCustomPopup(
                "❌ FALHA NA CAPTURA",
                `O ${wild.name} resistiu e escapou da esfera! [Dado: ${roll} + Bónus: ${captureBonus + weakenedBonus} = ${totalCaptureValue} / Alvo: ${requiredTarget}+].\n\nPodes tentar novamente com outra esfera.`,
                false
            );
            renderEncounterItemsList();
            updateEncounterUIInfo();
            syncGameStateToCloud();
        }
    });
}

export function fleeEncounter() {
    showCustomPopup("Fuga", "🏃‍♂️ Afastaste-te do Pokémon selvagem com sucesso!", true);
    closeEncounterModalUI();
    if (typeof renderBoardMap === 'function') renderBoardMap();
}

export function closeEncounterModalUI() {
    const modal = document.getElementById('wild-encounter-modal') || document.getElementById('encounter-modal');
    if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }
}

function showCustomPopup(title, message, isSuccess) {
    if (typeof window.showCustomPopup === 'function') {
        window.showCustomPopup(title, message, isSuccess);
    } else {
        alert(`${title}: ${message}`);
    }
}

// Exposição global das funções para interações no HTML e troca de Pokémon
window.openEncounterModalWithPokemon = openEncounterModalWithPokemon;
window.fleeEncounter = fleeEncounter;
window.resolveCaptureAttempt = resolveCaptureAttempt;
window.cyclePlayerEncounterPokemon = cyclePlayerEncounterPokemon;
window.selectCaptureBall = selectCaptureBall;
window.resolveBattleAttempt = resolveBattleAttempt;
