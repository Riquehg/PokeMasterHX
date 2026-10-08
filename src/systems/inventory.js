// --- src/systems/inventory.js ---
// Módulo de Gerenciamento da Mochila, Poké Mart e Itens

import { gameState, getCurrentPlayer, ensureValidGameState } from '../core/state.js';
import { saveGameProgress } from '../core/storage.js';

// Abre o modal do Poké Mart para compra de itens
export function openPokemartModal() {
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

    // Catálogo padrão de itens à venda no Poké Mart
    const martItems = [
        { id: 'poke_ball', name: 'Poké Ball', price: 200, icon: '🔴', desc: 'Esfera padrão para capturar Anima.' },
        { id: 'great_ball', name: 'Great Ball', price: 600, icon: '🔵', desc: 'Esfera com maior taxa de sucesso.' },
        { id: 'ultra_ball', name: 'Ultra Ball', price: 1200, icon: '🟡', desc: 'Esfera avançada de alta captura.' },
        { id: 'potion', name: 'Poção', price: 300, icon: '🧪', desc: 'Cura 20 HP de um Anima.' },
        { id: 'super_potion', name: 'Super Poção', price: 700, icon: '💉', desc: 'Cura 50 HP de um Anima.' }
    ];

    let itemsHtml = '';
    martItems.forEach(item => {
        itemsHtml += `
            <div class="bg-black/60 border border-amber-600/60 p-3 rounded-xl flex items-center justify-between text-white">
                <div class="flex items-center gap-3">
                    <span class="text-2xl">${item.icon}</span>
                    <div>
                        <p class="text-xs font-bold">${item.name}</p>
                        <p class="text-[9px] text-slate-400">${item.desc}</p>
                        <p class="text-[10px] text-amber-400 font-bold mt-0.5">🪙 ${item.price} Poké Dollars</p>
                    </div>
                </div>
                <button onclick="buyItemFromPokemart('${item.id}', ${item.price})" class="bg-amber-600 hover:bg-amber-500 text-black font-black px-3 py-1.5 rounded text-[10px] cursor-pointer transition-colors">Comprar</button>
            </div>
        `;
    });

    modal.innerHTML = `
        <div class="trainer-card max-w-lg w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <span class="text-xs font-black text-amber-400 font-cinzel">🛒 POKÉ MART (LOJA)</span>
                <div class="flex items-center gap-3">
                    <span class="text-xs font-bold text-amber-300">🪙 Ouro: <span id="mart-player-gold">${cp.gold || 0}</span></span>
                    <button onclick="document.getElementById('pokemart-modal').remove()" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800 cursor-pointer">✕</button>
                </div>
            </div>
            <div class="space-y-2 max-h-64 overflow-y-auto pr-1">
                ${itemsHtml}
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// Executa a compra de um item no Poké Mart
window.buyItemFromPokemart = function(itemId, price) {
    const cp = getCurrentPlayer();
    if (!cp) return;

    if ((cp.gold || 0) < price) {
        alert("Não tens ouro suficiente para comprar este item!");
        return;
    }

    cp.gold -= price;

    if (!Array.isArray(cp.inventory)) cp.inventory = [];
    const existingItem = cp.inventory.find(i => i && i.id === itemId);

    if (existingItem) {
        existingItem.quantity = (existingItem.quantity || 1) + 1;
    } else {
        let icon = '🔴';
        let name = itemId;
        let desc = 'Item útil';
        if (itemId === 'great_ball') { icon = '🔵'; name = 'Great Ball'; desc = 'Esfera de captura melhorada.'; }
        else if (itemId === 'ultra_ball') { icon = '🟡'; name = 'Ultra Ball'; desc = 'Esfera de captura avançada.'; }
        else if (itemId === 'potion') { icon = '🧪'; name = 'Poção'; desc = 'Cura PV de um Anima.'; }
        else if (itemId === 'super_potion') { icon = '💉'; name = 'Super Poção'; desc = 'Cura avançada de PV.'; }

        cp.inventory.push({
            id: itemId,
            name: name,
            quantity: 1,
            icon: icon,
            desc: desc,
            type: itemId.includes('ball') ? 'sphere' : 'medicine'
        });
    }

    saveGameProgress();

    // Atualiza o saldo exibido no modal
    const goldSpan = document.getElementById('mart-player-gold');
    if (goldSpan) goldSpan.innerText = cp.gold;

    alert(`🛍️ Compraste 1x ${itemId} com sucesso!`);
};

// Usa um item do inventário (como poções de cura)
export function useInventoryItem(itemUniqueId) {
    const cp = getCurrentPlayer();
    if (!cp || !Array.isArray(cp.inventory)) return;

    const itemIndex = cp.inventory.findIndex(i => i && (i.id === itemUniqueId || i.uniqueId === itemUniqueId));
    if (itemIndex === -1) return;

    const item = cp.inventory[itemIndex];

    if (item.type === 'medicine' || item.id.includes('potion')) {
        if (!cp.activeTeam || cp.activeTeam.length === 0) {
            alert("Não tens nenhum Anima na equipa ativa para curar!");
            return;
        }

        // Cura o primeiro Anima da equipe que precise de HP
        const targetMon = cp.activeTeam.find(m => m && (m.currentHp !== undefined ? m.currentHp : m.maxHp) < m.maxHp) || cp.activeTeam[0];
        const healAmount = item.id.includes('super') ? 50 : 20;

        const maxHp = targetMon.maxHp || targetMon.hp || 20;
        targetMon.currentHp = Math.min(maxHp, (targetMon.currentHp !== undefined ? targetMon.currentHp : maxHp) + healAmount);

        // Deduz a quantidade do item
        item.quantity = (item.quantity || 1) - 1;
        if (item.quantity <= 0) {
            cp.inventory.splice(itemIndex, 1);
        }

        saveGameProgress();
        alert(`✨ Usaste ${item.name} em ${targetMon.name}! Recuperou PV.`);
    } else {
        alert("Este item não pode ser usado diretamente aqui.");
    }
}