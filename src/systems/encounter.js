// --- src/systems/encounter.js ---
// Subsistema de Batalhas TCG Selvagens, Captura e Gestão de Itens em Combate

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
    hasAttemptedCapture: false
};

let selectedBallAura = null;

// Função auxiliar para gerar Pokémon selvagem com níveis por Tier e taxa de Shiny rara
export function generateWildPokemonForWaypoint(waypointId, waypointColor = 'rosa') {
    if (!Array.isArray(MONSTER_CATALOG) || MONSTER_CATALOG.length === 0) return null;

    // Mapeia a cor da casa para o Tier correspondente
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
    
    // Procura por ambos os IDs possíveis para garantir que o modal abre sempre
    let modal = document.getElementById('wild-encounter-modal') || document.getElementById('encounter-modal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wild-encounter-modal';
        modal.className = 'fixed inset-0 bg-black/90 z-[500] flex items-center justify-center p-4 backdrop-blur-md hidden';
        document.body.appendChild(modal);
    }

    if (!cp.activeTeam || cp.activeTeam.length === 0) {
        if (typeof showCustomPopup === 'function') showCustomPopup("Aviso", "🚫 Precisas de pelo menos um Pokémon na Equipa Ativa!", false);
        return;
    }

    let validIndex = cp.activeTeam.findIndex(m => (m.currentHp !== undefined ? m.currentHp : m.maxHp) > 0);
    if (validIndex === -1) {
        if (typeof showCustomPopup === 'function') showCustomPopup("Equipa Desmaiada!", "⚠ Todos os Pokémon da tua Equipa Ativa estão desmaiados (HP 0)!", false);
        return;
    }

    currentEncounterState.wildPokemon = pokemon;
    currentEncounterState.itemBonus = 0;
    currentEncounterState.battlePowerBonus = 0;
    currentEncounterState.selectedTeamMemberIndex = validIndex;
    currentEncounterState.selectedCaptureBallId = null;
    currentEncounterState.hasAttemptedCapture = false;

    // Renderiza o layout completo do encontro selvagem no modal
    modal.innerHTML = `
        <div class="trainer-card max-w-2xl w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <span class="text-xs font-black text-amber-400 font-cinzel">ENCONTRO POKÉMON SELVAGEM</span>
                <button onclick="fleeEncounter()" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800 cursor-pointer">✕</button>
            </div>

            <div class="grid grid-cols-2 gap-4 text-center items-center py-2">
                <div class="bg-black/40 border border-amber-600/40 p-3 rounded-2xl">
                    <p class="text-[10px] text-amber-300 font-bold uppercase">Selvagem</p>
                    <h4 class="text-sm font-black text-white">${pokemon.name} (Nv.${pokemon.level})</h4>
                    <img src="${pokemon.image}" class="w-20 h-20 object-contain mx-auto my-2" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    <p class="text-[9px] text-slate-300">HP: ${pokemon.currentHp}/${pokemon.maxHp}</p>
                </div>
                <div class="bg-black/40 border border-blue-600/40 p-3 rounded-2xl relative">
                    <p class="text-[10px] text-blue-300 font-bold uppercase">Teu Anima Ativo</p>
                    <h4 id="enc-active-mon-name" class="text-sm font-black text-white"></h4>
                    <img id="enc-active-mon-img" src="" class="w-20 h-20 object-contain mx-auto my-2">
                    <p id="enc-active-mon-hp" class="text-[9px] text-slate-300"></p>
                    <button onclick="cyclePlayerEncounterPokemon()" class="mt-2 bg-amber-600 hover:bg-amber-500 text-black font-black text-[9px] px-2.5 py-1 rounded-full shadow border border-amber-300 uppercase tracking-wider cursor-pointer">
                        Trocar Anima
                    </button>
                </div>
            </div>

            <div class="border-t border-amber-900/60 pt-3">
                <p class="text-[10px] text-amber-300 font-bold mb-2">Mochila / Itens Disponíveis:</p>
                <div id="encounter-items-container" class="flex flex-wrap gap-2 max-h-32 overflow-y-auto"></div>
            </div>

            <div class="flex justify-center gap-3 pt-2">
                <button onclick="resolveCaptureAttempt()" class="bg-emerald-700 hover:bg-emerald-600 text-white font-black px-5 py-2 rounded-xl text-xs uppercase shadow cursor-pointer">
                    Tentar Capturar
                </button>
                <button onclick="fleeEncounter()" class="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-5 py-2 rounded-xl text-xs cursor-pointer">
                    Fugir
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
    const activeMon = cp.activeTeam[currentEncounterState.selectedTeamMemberIndex];
    if (!activeMon) return;

    const nameEl = document.getElementById('enc-active-mon-name');
    const imgEl = document.getElementById('enc-active-mon-img');
    const hpEl = document.getElementById('enc-active-mon-hp');

    if (nameEl) nameEl.textContent = activeMon.name;
    if (imgEl) imgEl.src = activeMon.image || '';
    if (hpEl) hpEl.textContent = `HP: ${activeMon.currentHp}/${activeMon.maxHp || activeMon.hp || 20}`;
}

export function cyclePlayerEncounterPokemon() {
    const cp = getCurrentPlayer();
    if (!cp || !Array.isArray(cp.activeTeam) || cp.activeTeam.length <= 1) return;
    
    let startIndex = currentEncounterState.selectedTeamMemberIndex;
    let nextIndex = (startIndex + 1) % cp.activeTeam.length;
    
    while (nextIndex !== startIndex) {
        let mon = cp.activeTeam[nextIndex];
        let hp = mon.currentHp !== undefined ? mon.currentHp : (mon.maxHp || 20);
        if (hp > 0) break;
        nextIndex = (nextIndex + 1) % cp.activeTeam.length;
    }

    currentEncounterState.selectedTeamMemberIndex = nextIndex;
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
            const btn = document.createElement('button');
            btn.className = "bg-blue-900/60 hover:bg-blue-800 text-blue-200 px-2.5 py-1 rounded-lg border border-blue-600 text-[10px] flex items-center gap-1.5 shadow cursor-pointer";
            const itemImg = item.image ? `<img src="${item.image}" class="w-4 h-4 object-contain">` : `<span>${item.icon || '🎒'}</span>`;
            btn.innerHTML = `${itemImg} <span>${item.name} (${count})</span>`;
            btn.onclick = () => useItemInEncounter(item, index);
            container.appendChild(btn);
        });
    }
}

export function useItemInEncounter(item, itemIndex) {
    const cp = getCurrentPlayer();
    const activeMon = cp.activeTeam[currentEncounterState.selectedTeamMemberIndex];
    const itemCount = item.count !== undefined ? item.count : (item.quantity || 0);

    if (!activeMon || !item || itemCount <= 0) return;

    if (item.type === 'sphere' || item.category === 'capture' || item.id.includes('ball')) {
        if (item.count !== undefined) item.count--;
        else if (item.quantity !== undefined) item.quantity--;

        currentEncounterState.itemBonus = Number(item.value) || 1;
        currentEncounterState.selectedCaptureBallId = item.id;
        currentEncounterState.hasAttemptedCapture = true;

        showCustomPopup("Esfera Selecionada", `🔴 Usaste ${item.name}! Bónus de captura aplicado.`, true);
        renderEncounterItemsList();
        resolveCaptureAttempt();
        return;
    }

    if (item.type === 'heal') {
        if (activeMon.currentHp >= (activeMon.maxHp || activeMon.hp || 20)) {
            showCustomPopup("Aviso", `${activeMon.name} já está com HP máximo!`, false);
            return;
        }
        if (item.count !== undefined) item.count--;
        else if (item.quantity !== undefined) item.quantity--;

        activeMon.currentHp = Math.min(activeMon.maxHp || activeMon.hp || 20, activeMon.currentHp + (Number(item.value) || 20));
        showCustomPopup("Item Usado", `💊 ${item.name} usada em ${activeMon.name}!`, true);
        renderEncounterItemsList();
        updateEncounterUIInfo();
        if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
        return;
    }
}

export function resolveCaptureAttempt() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;
    if (!wild) return;

    let requiredTarget = 4;
    const tier = wild.tier || 1;
    const isLegendary = tier === 5 || String(wild.color || '').toLowerCase() === 'amarelo';

    if (tier === 2) requiredTarget = 5;
    if (tier === 3 || tier === 4) requiredTarget = 6;
    if (isLegendary) requiredTarget = 7;
    if (wild.isShiny) requiredTarget++;

    const weakenedBonus = wild.weakened ? 1 : 0;
    const captureBonus = Number(currentEncounterState.itemBonus) || 0;

    // Rolagem segura de dado de 1 a 6
    const roll = Math.floor(Math.random() * 6) + 1;
    const totalCaptureValue = roll + captureBonus + weakenedBonus;

    if (totalCaptureValue >= requiredTarget || currentEncounterState.selectedCaptureBallId?.includes('master')) {
        showCustomPopup(
            "🎉 CAPTURA BEM-SUCEDIDA!",
            `Capturaste o ${wild.name} (Nv.${wild.level || 1})!\nDado: ${roll} + Bónus: ${captureBonus + weakenedBonus} = ${totalCaptureValue} (Alvo: ${requiredTarget}+)`,
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

        if (wild.waypointId && typeof boardPokemonCards !== 'undefined') {
            delete boardPokemonCards[wild.waypointId];
        }

        closeEncounterModalUI();
        if (typeof renderBoardMap === 'function') renderBoardMap();
        if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
        if (typeof renderBottomPanel === 'function') renderBottomPanel();
        saveGameProgress();
    } else {
        wild.weakened = true; // Deixa enfraquecido para a próxima tentativa
        showCustomPopup(
            "❌ FALHA NA CAPTURA",
            `O ${wild.name} escapou! (Dado: ${roll} + Bónus: ${captureBonus + weakenedBonus} = ${totalCaptureValue} / Alvo: ${requiredTarget}+).\nO Pokémon ficou enfraquecido.`,
            false
        );
        updateEncounterUIInfo();
    }

    currentEncounterState.itemBonus = 0;
    currentEncounterState.selectedCaptureBallId = null;
}

export function fleeEncounter() {
    showCustomPopup("Fuga", "🏃‍♂️ Afastaste-te do Pokémon com segurança!", true);
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
