// --- src/systems/encounter.js ---
// Subsistema de Batalhas TCG Selvagens, Captura e Gestão de Itens em Combate

import { gameState, getCurrentPlayer } from '../core/state.js';
import { renderTeamCardSlots, renderBottomPanel } from './pcbox.js'; // Ajuste se necessário conforme sua estrutura
import { SUPABASE_STORAGE_URL } from '../config/constants.js';

export let currentEncounterState = {
    wildPokemon: null,
    itemBonus: 0,
    battlePowerBonus: 0,
    selectedTeamMemberIndex: 0,
    selectedCaptureBallId: null,
    hasAttemptedCapture: false
};

let selectedBallAura = null;

export function openEncounterModalWithPokemon(pokemon) {
    const cp = getCurrentPlayer();
    const modal = document.getElementById('encounter-modal');
    if (!modal) return;

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

    updateEncounterUIInfo();
    renderEncounterItemsList();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function cyclePlayerEncounterPokemon() {
    const cp = getCurrentPlayer();
    if (!cp.activeTeam || cp.activeTeam.length <= 1) return;
    let startIndex = currentEncounterState.selectedTeamMemberIndex;
    let nextIndex = (startIndex + 1) % cp.activeTeam.length;
    
    while (nextIndex !== startIndex) {
        let mon = cp.activeTeam[nextIndex];
        let hp = mon.currentHp !== undefined ? mon.currentHp : mon.maxHp;
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
            if (!item || item.count <= 0) return;
            const btn = document.createElement('button');
            btn.className = "bg-blue-900/60 hover:bg-blue-800 text-blue-200 px-2.5 py-1 rounded-lg border border-blue-600 text-[10px] flex items-center gap-1.5 shadow cursor-pointer";
            const itemImg = item.image ? `<img src="${item.image}" class="w-4 h-4 object-contain">` : `<span>${item.icon || '🎒'}</span>`;
            btn.innerHTML = `${itemImg} <span>${item.name} (${item.count})</span>`;
            btn.onclick = () => useItemInEncounter(item, index);
            container.appendChild(btn);
        });
    }
}

export function useItemInEncounter(item, itemIndex) {
    const cp = getCurrentPlayer();
    const activeMon = cp.activeTeam[currentEncounterState.selectedTeamMemberIndex];

    if (!activeMon || !item || Number(item.count) <= 0) return;

    if (item.type === 'sphere') {
        if (currentEncounterState.hasAttemptedCapture) {
            showCustomPopup(
                "Tentativa já realizada",
                "⚠️ Já tentaste capturar neste turno. Passa a vez para liberar uma nova tentativa.",
                false
            );
            return;
        }
        item.count--;
        currentEncounterState.itemBonus = Number(item.value) || 0;
        currentEncounterState.selectedCaptureBallId = item.id;
        currentEncounterState.hasAttemptedCapture = true;
        if (item.aura) {
            selectedBallAura = item.aura;
        }
        showCustomPopup(
            "Poké Ball Lançada",
            `🔴 Lançaste uma ${item.name}!\nBónus aplicado: +${Number(item.value) || 0}`,
            true
        );
        renderEncounterItemsList();
        updateEncounterUIInfo();
        resolveCaptureAttempt();
        return;
    }

    if (item.type === 'battle') {
        item.count--;
        currentEncounterState.battlePowerBonus += Number(item.value) || 2;
        showCustomPopup(
            "Item Usado",
            `⚔️ ${item.name} aplicada!\nBónus de combate: +${Number(item.value) || 2}.`,
            true
        );
        renderEncounterItemsList();
        updateEncounterUIInfo();
        return;
    }

    if (item.type === 'heal') {
        if (activeMon.currentHp >= activeMon.maxHp) {
            showCustomPopup("Aviso", `${activeMon.name} já está com HP máximo!`, false);
            return;
        }
        item.count--;
        activeMon.currentHp = Math.min(activeMon.maxHp, activeMon.currentHp + (Number(item.value) || 20));
        showCustomPopup("Item Usado", `💊 ${item.name} usada em ${activeMon.name}!`, true);
        renderEncounterItemsList();
        updateEncounterUIInfo();
        if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
        return;
    }

    if (item.type === 'revive') {
        if (activeMon.currentHp > 0) {
            showCustomPopup("Aviso", `${activeMon.name} não está desmaiado!`, false);
            return;
        }
        item.count--;
        activeMon.currentHp = Math.floor((activeMon.maxHp || activeMon.hp || 20) / 2);
        showCustomPopup("Item Usado", `🌟 Revive usado em ${activeMon.name}!`, true);
        renderEncounterItemsList();
        updateEncounterUIInfo();
        if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
    }
}

export function resolveCaptureAttempt() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;
    const activeMon = cp.activeTeam[currentEncounterState.selectedTeamMemberIndex];

    if (!wild || !activeMon) return;

    if (!currentEncounterState.selectedCaptureBallId || !currentEncounterState.hasAttemptedCapture) {
        showCustomPopup("Poké Ball necessária", "❌ Escolha uma Poké Ball válida antes de tentar capturar.", false);
        return;
    }

    let requiredTarget = 4;
    const tier = wild.tier || 1;
    const isLegendary = tier === 5 || String(wild.color || '').toLowerCase() === 'amarelo';

    if (tier === 2) requiredTarget = 5;
    if (tier === 3 || tier === 4) requiredTarget = 6;
    if (isLegendary) requiredTarget = 7;
    if (wild.isShiny) requiredTarget++;

    const weakenedBonus = (wild.weakened && !isLegendary) ? 1 : 0;
    const captureBonus = Number(currentEncounterState.itemBonus) || 0;

    rollDiceWithAnimation((roll) => {
        const totalCaptureValue = Number(roll) + captureBonus + weakenedBonus;

        if (totalCaptureValue >= requiredTarget) {
            showCustomPopup(
                "🔴🔵 Captura bem-sucedida!",
                `Capturaste ${wild.isShiny ? '✨ Shiny ' : ''}${wild.name} (Nv.${wild.level || 1})!\n\nDado: ${roll} + Bónus: ${captureBonus + weakenedBonus} = ${totalCaptureValue}\nAlvo: ${requiredTarget}+`,
                true
            );

            if (typeof addMonsterToPlayer === 'function') {
                addMonsterToPlayer(wild);
            } else if (cp.pcBox) {
                cp.pcBox.push(wild);
            }

            if (wild.waypointId) {
                cp.currentZone = wild.waypointId;
                if (typeof boardPokemonCards !== 'undefined' && boardPokemonCards[wild.waypointId]) {
                    delete boardPokemonCards[wild.waypointId];
                }
            }

            if (activeMon.currentHp > 0 && typeof addExperienceToMonster === 'function') {
                addExperienceToMonster(activeMon, 30);
            }

            if (typeof renderBoardMap === 'function') {
                renderBoardMap();
            }

            closeEncounterModalUI();
        } else {
            if (!isLegendary) {
                wild.weakened = true;
                if (wild.waypointId && typeof boardPokemonCards !== 'undefined' && boardPokemonCards[wild.waypointId]) {
                    boardPokemonCards[wild.waypointId].weakened = true;
                }
            }

            showCustomPopup(
                "❌ Captura falhou",
                `${wild.name} escapou da Poké Ball.\n\nDado: ${roll} + Bónus: ${captureBonus + weakenedBonus} = ${totalCaptureValue}\nAlvo: ${requiredTarget}+\n\nUma nova tentativa será liberada no próximo turno.`,
                false
            );

            updateEncounterUIInfo();
        }

        currentEncounterState.selectedCaptureBallId = null;
        currentEncounterState.itemBonus = 0;
    });
}

export function fleeEncounter() {
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;
    if (wild && wild.waypointId) {
        cp.currentZone = wild.waypointId;
    }
    showCustomPopup("Fuga", "🏃‍♂ Afastaste-te do Pokémon com segurança!", true);
    closeEncounterModalUI();
    if (typeof renderBoardMap === 'function') renderBoardMap();
}

export function closeEncounterModalUI() {
    const modal = document.getElementById('encounter-modal');
    if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }
}

function updateEncounterUIInfo() {
    // Atualiza elementos visuais do modal de encontro se necessário
}

function rollDiceWithAnimation(callback) {
    const finalPlayerRoll = Math.floor(Math.random() * 6) + 1;
    const finalWildRoll = Math.floor(Math.random() * 6) + 1;
    callback(finalPlayerRoll, finalWildRoll);
}

function showCustomPopup(title, message, isSuccess) {
    if (typeof window.showCustomPopup === 'function') {
        window.showCustomPopup(title, message, isSuccess);
    } else {
        alert(`${title}: ${message}`);
    }
}
