// --- src/systems/inventory.js ---
// Módulo de Gerenciamento da Mochila, Poké Mart e Itens

import { gameState, getCurrentPlayer, ensureValidGameState } from '../core/state.js';
import { saveGameProgress } from '../core/storage.js';
import { ITEM_CATALOG, getItemDetails, normalizePlayerInventory } from '../data/items.js';

// ------------------------------------------------------------
// POKÉ MART (LOJA DE ITENS)
// ------------------------------------------------------------

export function openPokemartModal(cityName = '') {
    ensureValidGameState();
    const cp = getCurrentPlayer();
    if (!cp) return;

    let modal = document.getElementById('pokemart-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pokemart-modal';
        modal.className = 'fixed inset-0 bg-black/90 z-[450] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(modal);
    }

    renderMartContent(modal, cityName);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function renderMartContent(modalEl, cityName = '') {
    const cp = getCurrentPlayer();
    
    // Filtra os itens vendíveis no Poké Mart a partir do catálogo oficial
    const sellableIds = ['poke_ball', 'ball_great', 'ball_ultra', 'item_potion', 'item_revive', 'item_rarecandy', 'evolution_stone', 'item_vitamin'];
    let itemsForSale = ITEM_CATALOG.filter(item => sellableIds.includes(item.id));

    let itemsHtml = '';
    itemsForSale.forEach(item => {
        const itemImg = item.image
            ? `<img src="${item.image}" class="w-10 h-10 object-contain drop-shadow" onerror="this.style.display='none'">`
            : `<div class="w-10 h-10 bg-black/40 rounded flex items-center justify-center text-xs">📦</div>`;

        itemsHtml += `
            <div class="bg-black/60 border border-amber-600/60 p-3 rounded-xl flex items-center justify-between text-white">
                <div class="flex items-center gap-3 min-w-0">
                    ${itemImg}
                    <div class="min-w-0">
                        <p class="text-xs font-bold truncate">${item.name}</p>
                        <p class="text-[9px] text-slate-400 leading-tight">${item.desc}</p>
                        <p class="text-[10px] text-amber-400 font-bold mt-0.5">🪙 ${item.cost || 50} Poké Dollars</p>
                    </div>
                </div>
                
                <div class="flex items-center gap-1.5 shrink-0">
                    <div class="flex items-center bg-slate-950 border border-amber-600/60 rounded-lg overflow-hidden">
                        <button type="button" onclick="window.changeMartQuantity('${item.id}', -1)" class="px-2 py-1.5 text-amber-300 hover:bg-amber-900 font-black">−</button>
                        <input id="mart-quantity-${item.id}" type="number" min="1" max="999" value="1" inputmode="numeric" class="w-10 bg-transparent px-1 py-1.5 text-center text-xs text-white font-black focus:outline-none" oninput="window.normalizeMartQuantity(this)">
                        <button type="button" onclick="window.changeMartQuantity('${item.id}', 1)" class="px-2 py-1.5 text-amber-300 hover:bg-amber-900 font-black">+</button>
                    </div>

                    <button type="button" onclick="window.buyItemFromPokemart('${item.id}', ${item.cost || 50}, document.getElementById('mart-quantity-${item.id}').value, '${cityName}')" class="bg-amber-600 hover:bg-amber-500 text-black font-black px-2.5 py-1.5 rounded text-[10px] cursor-pointer transition-colors shadow">Comprar</button>
                </div>
            </div>
        `;
    });

    const backButtonAction = cityName ? `document.getElementById('pokemart-modal').remove(); window.openCityModal('${cityName}');` : `document.getElementById('pokemart-modal').remove();`;

    modalEl.innerHTML = `
        <div class="trainer-card max-w-lg w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <span class="text-xs font-black text-amber-400 font-cinzel">🛒 POKÉ MART (LOJA)</span>
                <div class="flex items-center gap-3">
                    <span class="text-xs font-bold text-amber-300">🪙 Ouro: <span id="mart-player-gold">${cp.gold || 0}</span></span>
                    <button onclick="${backButtonAction}" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800 cursor-pointer">✕</button>
                </div>
            </div>
            <div class="space-y-2 max-h-64 overflow-y-auto pr-1">
                ${itemsHtml}
            </div>
            <button onclick="${backButtonAction}" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-xl text-xs cursor-pointer">← Voltar</button>
        </div>
    `;
}

// Funções auxiliares globais para controlo de quantidade na loja
window.normalizeMartQuantity = function(input) {
    if (!input) return 1;
    const normalized = Math.max(1, Math.min(999, Math.floor(Number(input.value) || 1)));
    input.value = normalized;
    return normalized;
};

window.changeMartQuantity = function(itemId, amount) {
    const input = document.getElementById(`mart-quantity-${itemId}`);
    if (!input) return;
    const currentValue = Math.floor(Number(input.value) || 1);
    input.value = Math.max(1, Math.min(999, currentValue + Number(amount || 0)));
};

// Executa a compra de um ou mais itens no Poké Mart
window.buyItemFromPokemart = function(itemId, unitPrice, requestedQuantity = 1, cityName = '') {
    const cp = getCurrentPlayer();
    if (!cp) return;

    const quantity = Math.max(1, Math.min(999, Math.floor(Number(requestedQuantity) || 1)));
    const price = Math.max(0, Math.floor(Number(unitPrice) || 0));
    const totalCost = price * quantity;

    if ((cp.gold || 0) < totalCost) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup("Ouro Insuficiente", `❌ Não tens ouro suficiente para comprar ${quantity}x deste item!\nNecessário: ${totalCost} 🪙\nDisponível: ${cp.gold || 0} 🪙`, false);
        } else {
            alert("Não tens ouro suficiente para comprar este item!");
        }
        return;
    }

    cp.gold -= totalCost;

    if (!Array.isArray(cp.inventory)) cp.inventory = [];
    
    const itemTemplate = getItemDetails(itemId);
    if (!itemTemplate) return;

    const existingItem = cp.inventory.find(i => i && i.id === itemId);

    if (existingItem) {
        existingItem.count = (Number(existingItem.count) || Number(existingItem.quantity) || 1) + quantity;
        if (existingItem.quantity) delete existingItem.quantity; // padroniza para 'count'
    } else {
        cp.inventory.push({
            ...itemTemplate,
            count: quantity
        });
    }

    normalizePlayerInventory(cp);
    saveGameProgress();

    // Atualiza o saldo exibido no modal
    const goldSpan = document.getElementById('mart-player-gold');
    if (goldSpan) goldSpan.innerText = cp.gold;

    if (typeof updatePlayerUI === 'function') updatePlayerUI();
    if (typeof renderBottomPanel === 'function') renderBottomPanel();

    if (typeof showCustomPopup === 'function') {
        showCustomPopup("Compra Realizada", `🛍️ Compraste ${quantity}x ${itemTemplate.name} com sucesso por ${totalCost} 🪙!`, true);
    }

    const modal = document.getElementById('pokemart-modal');
    if (modal) {
        renderMartContent(modal, cityName);
    }
};

// ------------------------------------------------------------
// USO DE ITENS NA MOCHILA
// ------------------------------------------------------------

export function useInventoryItem(itemUniqueIdOrIndex) {
    const cp = getCurrentPlayer();
    if (!cp || !Array.isArray(cp.inventory)) return;

    normalizePlayerInventory(cp);

    let itemIndex = -1;
    if (typeof itemUniqueIdOrIndex === 'number') {
        itemIndex = itemUniqueIdOrIndex;
    } else {
        itemIndex = cp.inventory.findIndex(i => i && (i.id === itemUniqueIdOrIndex || i.uniqueId === itemUniqueIdOrIndex));
    }

    if (itemIndex === -1 || !cp.inventory[itemIndex]) return;

    const item = cp.inventory[itemIndex];
    const itemInfo = getItemDetails(item.id);

    if (!itemInfo) return;

    // 1. Poké Balls / Esferas de Captura
    if (itemInfo.type === 'sphere') {
        const wild = typeof currentEncounterState !== 'undefined' ? currentEncounterState.wildPokemon : null;
        if (!wild) {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup('Nenhum Pokémon em combate', 'Abra um encontro com um Pokémon selvagem antes de usar uma Poké Ball.', false);
            }
            return;
        }
        if (typeof triggerCaptureFlow === 'function') {
            triggerCaptureFlow(wild);
        }
        return;
    }

    // 2. Rare Candy (Concede nível ao primeiro Pokémon ativo)
    if (item.id === 'item_rarecandy' || item.id === 'rare_candy' || itemInfo.type === 'rarecandy') {
        const targetMon = cp.activeTeam?.[0] || cp.team?.[0];
        if (!targetMon) {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup('Aviso', 'Não tens nenhum Pokémon na equipa ativa para receber o Rare Candy.', false);
            }
            return;
        }
        targetMon.level = (Number(targetMon.level) || 1) + 1;
        targetMon.maxHp = (Number(targetMon.maxHp) || 20) + 5;
        targetMon.currentHp = targetMon.maxHp;
        targetMon.str = (Number(targetMon.str) || 4) + 2;

        item.count = (Number(item.count) || 1) - 1;
        if (item.count <= 0) cp.inventory.splice(itemIndex, 1);

        normalizePlayerInventory(cp);
        saveGameProgress();

        if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
        if (typeof renderBottomPanel === 'function') renderBottomPanel();

        if (typeof showCustomPopup === 'function') {
            showCustomPopup('🌟 Rare Candy Usado!', `${targetMon.name} subiu para o Nv.${targetMon.level}!\nOs seus atributos melhoraram.`, true);
        }
        return;
    }

    // 3. Vitamin / X Attack (Bónus de Combate)
    if (itemInfo.type === 'battle' || item.id.includes('vitamin') || item.id.includes('attack')) {
        item.count = (Number(item.count) || 1) - 1;
        if (item.count <= 0) cp.inventory.splice(itemIndex, 1);

        normalizePlayerInventory(cp);
        saveGameProgress();

        if (typeof renderBottomPanel === 'function') renderBottomPanel();

        if (typeof showCustomPopup === 'function') {
            showCustomPopup('🧪 Item Aplicado!', `${itemInfo.name} aplicado com sucesso! Bónus de força garantido.`, true);
        }
        return;
    }

    // 4. Poção / Cura
    if (itemInfo.type === 'heal' || item.id.includes('potion')) {
        if (!cp.activeTeam || cp.activeTeam.length === 0) {
            alert("Não tens nenhum Pokémon na equipa ativa para curar!");
            return;
        }

        const targetMon = cp.activeTeam.find(m => m && (m.currentHp !== undefined ? m.currentHp : m.maxHp) < m.maxHp) || cp.activeTeam[0];
        const healAmount = itemInfo.value || 20;

        const maxHp = targetMon.maxHp || targetMon.hp || 20;
        if (targetMon.currentHp >= maxHp) {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup('Aviso', 'O Pokémon ativo já está com HP máximo.', false);
            }
            return;
        }

        targetMon.currentHp = Math.min(maxHp, (targetMon.currentHp !== undefined ? targetMon.currentHp : maxHp) + healAmount);

        item.count = (Number(item.count) || 1) - 1;
        if (item.count <= 0) {
            cp.inventory.splice(itemIndex, 1);
        }

        normalizePlayerInventory(cp);
        saveGameProgress();

        if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
        if (typeof renderBottomPanel === 'function') renderBottomPanel();

        if (typeof showCustomPopup === 'function') {
            showCustomPopup("Item Utilizado", `✨ Usaste ${itemInfo.name} em ${targetMon.name}! HP recuperado para ${targetMon.currentHp}/${maxHp}.`, true);
        }
        return;
    }

    // 5. Revive
    if (itemInfo.type === 'revive' || item.id.includes('revive')) {
        const faintedMon = cp.activeTeam?.find(m => m && (m.currentHp !== undefined ? m.currentHp : m.maxHp) <= 0);
        if (!faintedMon) {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup('Aviso', 'Não há nenhum Pokémon desmaiado na equipa ativa.', false);
            }
            return;
        }
        faintedMon.currentHp = Math.floor((faintedMon.maxHp || 20) / 2);
        item.count = (Number(item.count) || 1) - 1;
        if (item.count <= 0) cp.inventory.splice(itemIndex, 1);

        normalizePlayerInventory(cp);
        saveGameProgress();

        if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
        if (typeof renderBottomPanel === 'function') renderBottomPanel();

        if (typeof showCustomPopup === 'function') {
            showCustomPopup('🌟 Revive Usado!', `${faintedMon.name} foi revivido com ${faintedMon.currentHp} HP.`, true);
        }
        return;
    }

    if (typeof showCustomPopup === 'function') {
        showCustomPopup("Informação", `ℹ️ O item ${itemInfo.name} deve ser utilizado no contexto adequado.`, true);
    }
}

// Expõe as funções principais globalmente
window.openPokemartModal = openPokemartModal;
window.useInventoryItem = useInventoryItem;
