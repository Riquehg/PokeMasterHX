// --- src/systems/encounter.js ---
// Subsistema Unificado de Batalhas TCG Selvagens, Captura, XP e Evolução

import { gameState, getCurrentPlayer } from '../core/state.js';
import { renderTeamCardSlots, renderBottomPanel } from './pcbox.js';
import { SUPABASE_STORAGE_URL } from '../config/constants.js';
import { MONSTER_CATALOG } from '../config/cards-data.js';
import { saveGameProgress } from '../core/storage.js';

export let currentEncounterState = {
    wildPokemon: null,
    itemBonus: 0,
    battlePowerBonus: 0,
    selectedTeamMemberIndex: 0,
    selectedCaptureBallId: null,
    hasAttemptedCapture: false,
    hasAttemptedAttack: false
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

function calculateTypeAdvantageMultiplier(attackerType, defenderType) {
    if (!attackerType || !defenderType) return 1.0;
    const a = attackerType.toLowerCase();
    const d = defenderType.toLowerCase();
    
    const advantages = {
        'fire': ['grass', 'bug', 'ice', 'steel'],
        'water': ['fire', 'ground', 'rock'],
        'grass': ['water', 'ground', 'rock'],
        'electric': ['water', 'flying'],
        'psychic': ['fighting', 'poison'],
        'fighting': ['normal', 'ice', 'rock', 'dark', 'steel']
    };

    if (advantages[a] && advantages[a].includes(d)) return 1.5;
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
    const isShiny = Math.random() < 0.06;
    const maxHp = 20 + (level * 3);

    return {
        ...baseMon,
        uniqueId: 'wild_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        level: level,
        tier: tier,
        currentHp: maxHp,
        maxHp: maxHp,
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
    currentEncounterState.hasAttemptedAttack = false;

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

            <div class="flex flex-wrap justify-center gap-3 pt-1">
                <button onclick="resolveBattleAttempt()" class="bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white font-black px-6 py-2.5 rounded-xl text-xs uppercase shadow-lg cursor-pointer flex items-center gap-2 border border-blue-400 transition-all">
                    <span>⚔️</span> Atacar (Rolar Dado)
                </button>
                <button onclick="resolveCaptureAttempt()" class="bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-500 hover:to-green-600 text-white font-black px-6 py-2.5 rounded-xl text-xs uppercase shadow-lg cursor-pointer flex items-center gap-2 border border-emerald-400 transition-all">
                    <span>🔴</span> Tentar Capturar
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

    const activeHp = activeMon.currentHp !== undefined ? activeMon.currentHp : (activeMon.maxHp || 20);
    const activeMaxHp = activeMon.maxHp || activeMon.hp || 20;

    const typeMult = calculateTypeAdvantageMultiplier(activeMon.type, wild.type);
    let advantageBadgeHtml = '';
    if (typeMult > 1.0) {
        advantageBadgeHtml = `<span class="bg-emerald-500 text-black text-[9px] px-2 py-0.5 rounded font-black uppercase">⚡ Vantagem (1.5x)</span>`;
    } else if (typeMult < 1.0) {
        advantageBadgeHtml = `<span class="bg-red-700 text-white text-[9px] px-2 py-0.5 rounded font-black uppercase">⚠️ Desvantagem</span>`;
    }

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

    const playerVisual = document.getElementById('player-card-visual');
    if (playerVisual) {
        playerVisual.className = `relative flex flex-col justify-between p-4 rounded-3xl border-4 ${playerCardBg} shadow-2xl w-72 h-[420px] text-white`;
        playerVisual.innerHTML = `
            <div class="flex justify-between items-center font-black text-xs border-b-2 border-amber-400 pb-2">
                <span class="text-amber-300 font-bold uppercase">NV. ${activeMon.level || 1}</span>
                ${advantageBadgeHtml}
                <span class="text-amber-900 bg-amber-200 px-2 py-0.5 rounded font-bold uppercase text-[10px] border border-amber-400">${activeMon.type || 'Normal'}</span>
            </div>
            
            <div class="flex flex-col items-center justify-center my-auto space-y-3">
                <h3 class="text-base font-black text-white text-center truncate w-full">${activeMon.name}</h3>
                <div class="flex items-center justify-center bg-black/60 w-36 h-36 rounded-2xl border-2 border-amber-400 shadow-inner p-3 relative">
                    <img src="${activeMon.isShiny && activeMon.shinyImage ? activeMon.shinyImage : (activeMon.image || '')}" alt="${activeMon.name}" class="max-h-32 max-w-full object-contain drop-shadow-md" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                </div>
            </div>

            <div class="w-full bg-black/90 text-amber-300 rounded-2xl p-3 text-center space-y-1.5 shadow-md border border-amber-500/40">
                <p class="text-xs font-bold tracking-wide">HP: ${activeHp} / ${activeMaxHp} &nbsp;|&nbsp; STR: ${activeMon.str || 4}</p>
                <p class="text-[11px] font-black text-emerald-400 bg-emerald-950/90 rounded-xl px-2.5 py-1 border border-emerald-600">🎲 Soma Base: ~${estimatedPlayerPower} + [Dado]</p>
            </div>
            
            <button onclick="cyclePlayerEncounterPokemon()" class="absolute -bottom-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-[10px] px-3.5 py-1.5 rounded-full shadow-lg border border-white uppercase tracking-wider cursor-pointer flex items-center gap-1 transition-transform hover:scale-105">
                <span>🔄</span> Trocar Anima (${currentEncounterState.selectedTeamMemberIndex + 1}/${cp.activeTeam.length})
            </button>
        `;
    }

    const encVisual = document.getElementById('enc-card-visual');
    if (encVisual) {
        encVisual.className = `relative flex flex-col justify-between p-4 rounded-3xl border-4 ${enemyCardBg} shadow-2xl w-72 h-[420px] text-white ${wild.isShiny ? 'shiny-card-glow' : ''}`;
        const weakenedBadge = wild.weakened ? `<span class="bg-red-600 text-white text-[9px] px-2 py-0.5 rounded-md font-bold shadow animate-pulse">🩹 Enfraquecido (+1 Cap.)</span>` : '';
        const shinyWildBadge = wild.isShiny ? `<span class="bg-amber-400 text-black text-[9px] px-2 py-0.5 rounded-md font-black shadow animate-bounce">✨ SHINY</span>` : '';
        
        encVisual.innerHTML = `
            <div class="flex justify-between items-center font-black text-xs border-b-2 border-red-900 pb-2">
                <span class="text-red-400 font-bold uppercase">NV. ${wild.level || 1}</span>
                ${shinyWildBadge}
                <span class="text-red-300 bg-red-950 px-2 py-0.5 rounded font-bold uppercase text-[10px] border border-red-800">${wild.type || 'Normal'}</span>
            </div>

            <div class="flex flex-col items-center justify-center my-auto space-y-3">
                <h3 class="text-base font-black text-white text-center truncate w-full">${wild.name}</h3>
                <div class="flex items-center justify-center bg-black/60 w-36 h-36 rounded-2xl border-2 ${wild.isShiny ? 'border-amber-400 shiny-card-glow' : 'border-red-800'} shadow-inner p-3 relative">
                    <img src="${wild.isShiny && wild.shinyImage ? wild.shinyImage : (wild.image || '')}" alt="${wild.name}" class="max-h-32 max-w-full object-contain drop-shadow-md" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                </div>
            </div>

            <div class="w-full bg-black/90 text-red-300 rounded-2xl p-3 text-center space-y-1.5 shadow-md border border-red-600/40">
                <p class="text-xs font-bold tracking-wide">HP: ${wild.currentHp || wild.hp || 15} / ${wild.maxHp || 20} &nbsp;|&nbsp; STR: ${wild.str || 3}</p>
                <p class="text-[11px] font-black text-amber-300 bg-amber-950/90 rounded-xl px-2.5 py-1 border border-amber-600">🎯 Alvo Cap.: ${displayTarget}+ (Bónus: +${totalCaptureBonusSoFar})</p>
                ${weakenedBadge}
            </div>

            <div class="absolute -bottom-3.5 left-1/2 -translate-x-1/2 bg-red-900 text-amber-300 font-black text-[10px] px-3.5 py-1 rounded-full shadow border border-red-500 uppercase tracking-wider pointer-events-none">
                Inimigo Selvagem
            </div>
        `;
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
    updateEncounterUIInfo();
}

export function renderEncounterItemsList() {
    const cp = getCurrentPlayer();
    const container = document.getElementById('encounter-items-container');
    if (!container) return;
    container.innerHTML = '';

    if (cp.inventory) {
        cp.inventory.forEach((item, index) => {
            const count = item.count !== undefined ? item.count : (item.quantity || 0);
            if (!item || count <= 0) return;
            const isSphere = item.type === 'sphere' || item.category === 'capture' || item.id.includes('ball');
            if (!isSphere) return; // Mostra apenas esferas no painel de combate para captura

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

// Sistema de Experiência e Evolução Automática
function addExperienceAndCheckEvolution(monster, expGain) {
    if (!monster) return;
    monster.exp = (monster.exp || 0) + expGain;
    const nextLevelExp = (monster.level || 1) * 100;

    if (monster.exp >= nextLevelExp) {
        monster.level = (monster.level || 1) + 1;
        monster.exp -= nextLevelExp;
        monster.maxHp = (monster.maxHp || 20) + 5;
        monster.currentHp = monster.maxHp;
        monster.str = (monster.str || 4) + 2;

        showCustomPopup("✨ SUBIDA DE NÍVEL!", `O teu ${monster.name} subiu para o Nível ${monster.level}!\nOs seus atributos melhoraram!`, true);

        // Verificação simples de evolução por nível (exemplo padrão do catálogo)
        const baseCatalogItem = MONSTER_CATALOG.find(m => m.id === monster.id || m.name.toLowerCase() === monster.name.toLowerCase());
        if (baseCatalogItem && baseCatalogItem.evolvesTo && monster.level >= (baseCatalogItem.evolveLevel || 16)) {
            const evolvedData = MONSTER_CATALOG.find(m => m.id === baseCatalogItem.evolvesTo);
            if (evolvedData) {
                const oldName = monster.name;
                monster.name = evolvedData.name;
                monster.id = evolvedData.id;
                if (evolvedData.image) monster.image = evolvedData.image;
                if (evolvedData.types) monster.types = evolvedData.types;
                showCustomPopup("🧬 EVOLUÇÃO!", `Incrível! O teu ${oldName} evoluiu para ${monster.name}!`, true);
            }
        }
    }
}

window.resolveBattleAttempt = function() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;
    const activeMon = cp.activeTeam[currentEncounterState.selectedTeamMemberIndex];
    if (!wild || !activeMon) return;

    if ((activeMon.currentHp !== undefined ? activeMon.currentHp : activeMon.maxHp) <= 0) {
        showCustomPopup("Pokémon Desmaiado", "⚠ O teu Anima atual está com 0 de HP e não pode lutar!", false);
        return;
    }

    if (currentEncounterState.hasAttemptedAttack) {
        showCustomPopup("Ação Esgotada", "⚠ Já realizaste uma ação de ataque nesta ronda. Passa o turno ou tenta capturar.", false);
        return;
    }

    // Garante animação do dado antes de atacar (igual ao movimento do tabuleiro)
    if (typeof window.rollDiceWithAnimation === 'function') {
        window.rollDiceWithAnimation((playerDice) => {
            currentEncounterState.hasAttemptedAttack = true;
            playAttackAnimation();

            const wildDice = Math.floor(Math.random() * 6) + 1;
            const typeMult = calculateTypeAdvantageMultiplier(activeMon.type, wild.type);
            const playerPower = Math.round(((activeMon.str || 4) + currentEncounterState.battlePowerBonus + playerDice) * typeMult);
            const wildPower = (wild.str || 3) + wildDice;

            if (playerPower >= wildPower) {
                const damageToWild = Math.max(10, playerPower - wildPower + 10);
                wild.currentHp = Math.max(0, (wild.currentHp !== undefined ? wild.currentHp : wild.maxHp) - damageToWild);

                if (wild.currentHp <= 0) {
                    addExperienceAndCheckEvolution(activeMon, 75);
                    showCustomPopup("🏆 VITÓRIA NO COMBATE TCG!", `O teu ${activeMon.name} (Soma: ${playerPower}) derrotou o ${wild.name} (Soma: ${wildPower})!\n\n✨ Ganhou XP e o selvagem ficou enfraquecido para captura!`, true);
                    wild.weakened = true;
                } else {
                    showCustomPopup("⚔️ ATAQUE EFICAZ!", `O teu ${activeMon.name} causou ${damageToWild} de dano!\n\n(Ataque: ${playerPower} vs Defesa: ${wildPower})`, true);
                }
                updateEncounterUIInfo();
            } else {
                const damageToPlayer = 15;
                activeMon.currentHp = Math.max(0, (activeMon.currentHp || activeMon.maxHp) - damageToPlayer);
                
                if (activeMon.currentHp <= 0) {
                    showCustomPopup("💀 O TEU POKÉMON DESMAIOU", `O ${wild.name} contra-atacou com força (Soma: ${wildPower} vs ${playerPower})!\n\n💔 ${activeMon.name} desmaiou.`, false);
                    closeEncounterModalUI();
                } else {
                    showCustomPopup("💥 CONTRA-ATAQUE SOFRIDO", `O ${wild.name} selvagem defendeu-se!\n\n💔 ${activeMon.name} sofreu ${damageToPlayer} de dano.`, false);
                }
                renderTeamCardSlots();
                updateEncounterUIInfo();
            }
        });
    }
};

export function resolveCaptureAttempt() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;
    if (!wild) return;

    if (currentEncounterState.hasAttemptedCapture) {
        showCustomPopup("Limite Atingido", "⚠ Já fizeste uma tentativa de captura neste turno!", false);
        return;
    }

    if (!currentEncounterState.selectedCaptureBallId) {
        showCustomPopup("Esfera Necessária", "⚠ Deves selecionar primeiro uma Poké Ball na tua mochila de combate em baixo para tentar capturar!", false);
        return;
    }

    // Encontra e consome a Poké Ball da mochila do jogador
    const sphereItem = cp.inventory.find(i => i.id === currentEncounterState.selectedCaptureBallId && (Number(i.count) || Number(i.quantity) || 0) > 0);
    if (!sphereItem) {
        showCustomPopup("Sem Esferas", "Não tens essa Poké Ball disponível na mochila!", false);
        return;
    }

    if (sphereItem.count !== undefined) sphereItem.count--;
    else if (sphereItem.quantity !== undefined) sphereItem.quantity--;

    currentEncounterState.hasAttemptedCapture = true;

    // Animação de dado para a captura
    if (typeof window.rollDiceWithAnimation === 'function') {
        window.rollDiceWithAnimation((roll) => {
            let requiredTarget = 4;
            const tier = wild.tier || 1;
            const isLegendary = tier === 5 || String(wild.color || '').toLowerCase() === 'amarelo';

            if (tier === 2) requiredTarget = 5;
            if (tier === 3 || tier === 4) requiredTarget = 6;
            if (isLegendary) requiredTarget = 7;
            if (wild.isShiny) requiredTarget++;

            const weakenedBonus = wild.weakened ? 1 : 0;
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
                    currentHp: wild.maxHp || wild.hp || 20
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

                // REMOVE O POKÉMON DO MAPA DEFINITIVAMENTE
                if (wild.waypointId && typeof boardPokemonCards !== 'undefined') {
                    delete boardPokemonCards[wild.waypointId];
                }

                closeEncounterModalUI();
                if (typeof renderBoardMap === 'function') renderBoardMap();
                if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
                if (typeof renderBottomPanel === 'function') renderBottomPanel();
                saveGameProgress();
            } else {
                wild.weakened = true; 
                showCustomPopup(
                    "❌ FALHA NA CAPTURA",
                    `O ${wild.name} escapou da esfera! [Dado: ${roll} + Bónus: ${captureBonus + weakenedBonus} = ${totalCaptureValue} / Alvo: ${requiredTarget}+].\n\n🩹 O Pokémon ficou enfraquecido!`,
                    false
                );
                renderEncounterItemsList();
                updateEncounterUIInfo();
            }
        });
    }
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

window.openEncounterModalWithPokemon = openEncounterModalWithPokemon;
window.fleeEncounter = fleeEncounter;
window.resolveCaptureAttempt = resolveCaptureAttempt;
window.cyclePlayerEncounterPokemon = cyclePlayerEncounterPokemon;
window.selectCaptureBall = selectCaptureBall;
