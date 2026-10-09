// --- src/systems/city.js ---
// Módulo de Cidades, Lotes, Centro Pokémon, Poké Mart e Ginásios

import { SUPABASE_STORAGE_URL } from '../config/constants.js';
import { gameState, getCurrentPlayer } from '../core/state.js';
import { saveGameProgress } from '../core/storage.js';
import { ITEM_CATALOG } from '../data/items.js';

// ------------------------------------------------------------
// HUB DA CIDADE
// ------------------------------------------------------------

export function openCityModal(cityName) {
    let cityModal = document.getElementById('city-hub-modal');
    if (!cityModal) {
        cityModal = document.createElement('div');
        cityModal.id = 'city-hub-modal';
        cityModal.className = 'fixed inset-0 bg-black/85 z-[350] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(cityModal);
    }

    const cp = getCurrentPlayer();
    
    let gymInfo = null;
    if (typeof GYM_LEADERS_CATALOG !== 'undefined') {
        const normalizeStr = (str) => str.toLowerCase().replace(/city/g, '').replace(/island/g, '').replace(/\s+/g, '').trim();
        const cleanSearchName = normalizeStr(cityName);

        gymInfo = GYM_LEADERS_CATALOG.find(g => {
            const cleanCatalogName = normalizeStr(g.city);
            return cleanCatalogName === cleanSearchName || g.city.toLowerCase() === cityName.toLowerCase();
        });
    }

    const hasBadge = gymInfo && cp.badges && cp.badges.includes(gymInfo.badgeKey);

    let gymSectionHtml = `<p class="text-xs text-slate-400 text-center">Esta localidade não possui um ginásio oficial registado.</p>`;

    if (gymInfo) {
        let leaderFileName = gymInfo.leader;
        if (leaderFileName === "Misty") leaderFileName = "misty";
        const leaderSpriteUrl = `${SUPABASE_STORAGE_URL}leaders/${encodeURIComponent(leaderFileName)}.png`;

        const leaderTeam = gymInfo.pokemons || [gymInfo.pokemon];
        let teamPokesHtml = '';
        leaderTeam.forEach(pk => {
            teamPokesHtml += `
                <div class="flex items-center gap-2 bg-black/40 p-1.5 rounded-xl border border-red-900/50">
                    <img src="${pk.image}" class="w-10 h-10 object-contain drop-shadow" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    <div class="text-[10px]">
                        <p class="font-bold text-white">${pk.name}</p>
                        <p class="text-amber-400">Nv. ${pk.level} | ${pk.type}</p>
                    </div>
                </div>
            `;
        });

        gymSectionHtml = `
            <div class="bg-red-950/40 border-2 border-red-600/60 p-3 rounded-2xl space-y-2">
                <div class="flex justify-between items-center border-b border-red-900 pb-1">
                    <div class="flex items-center gap-2">
                        <img src="${leaderSpriteUrl}" class="w-10 h-10 object-contain rounded-full bg-black border border-amber-400 shadow" onerror="this.src='https://api.iconify.design/noto:man-raising-hand.svg'">
                        <div>
                            <span class="text-xs font-black text-red-300">Líder: ${gymInfo.leader}</span>
                            <p class="text-[9px] text-slate-300">Formato: ${gymInfo.format}x${gymInfo.format}</p>
                        </div>
                    </div>
                    <div>
                        ${hasBadge ? '<span class="bg-emerald-600 text-white font-bold text-[9px] px-2 py-0.5 rounded-full shadow">✔ Insígnia Conquistada</span>' : '<span class="bg-amber-500 text-black font-black text-[9px] px-2 py-0.5 rounded-full animate-pulse shadow">⭐ Ginásio Pendente</span>'}
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    ${teamPokesHtml}
                </div>
                <div class="flex justify-between items-center text-[10px] text-slate-300 pt-1 border-t border-red-900/40">
                    <span>Prémio: <strong class="text-amber-400">${gymInfo.rewardGold} 🪙</strong></span>
                    <span>Insígnia: <strong class="text-amber-300 uppercase">${gymInfo.badgeKey}</strong></span>
                </div>
                <button onclick="document.getElementById('city-hub-modal').remove(); initiateGymSequence('${gymInfo.city}');" class="w-full bg-amber-600 hover:bg-amber-500 text-black font-black py-2 rounded-xl text-xs uppercase shadow transition-all cursor-pointer">
                    ⚔️ Desafiar Ginásio de ${gymInfo.city}
                </button>
            </div>
        `;
    }

    cityModal.innerHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-amber-500 rounded-2xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <span class="text-xs font-black text-amber-400 font-cinzel tracking-wider">🏙 CIDADE DE ${cityName.toUpperCase()}</span>
                <button onclick="document.getElementById('city-hub-modal').remove()" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-amber-950/60 rounded border border-amber-800">✕</button>
            </div>
            
            <div class="grid grid-cols-2 gap-2">
                <button onclick="document.getElementById('city-hub-modal').remove(); openPokemonCenterModal('${cityName}');" class="bg-emerald-700 hover:bg-emerald-600 text-white font-black py-2 px-3 rounded-xl text-[10px] uppercase shadow flex items-center justify-center gap-1.5 cursor-pointer">
                    🏥 Centro Pokémon
                </button>
                <button onclick="document.getElementById('city-hub-modal').remove(); openPokemartModal('${cityName}');" class="bg-blue-700 hover:bg-blue-600 text-white font-black py-2 px-3 rounded-xl text-[10px] uppercase shadow flex items-center justify-center gap-1.5 cursor-pointer">
                    🏪 Poké Mart
                </button>
            </div>

            ${gymSectionHtml}

            <!-- Botão de Voltar / Continuar Viagem -->
            <button onclick="document.getElementById('city-hub-modal').remove()" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-xl text-xs cursor-pointer">← Voltar / Continuar Viagem</button>
        </div>
    `;
    cityModal.classList.remove('hidden');
}

// ------------------------------------------------------------
// CENTRO POKÉMON
// ------------------------------------------------------------

export function openPokemonCenterModal(cityName = '') {
    const cp = getCurrentPlayer();
    if (cp.activeTeam) cp.activeTeam.forEach(mon => { mon.currentHp = mon.maxHp || mon.hp || 20; });
    if (cp.pcBox) cp.pcBox.forEach(mon => { mon.currentHp = mon.maxHp || mon.hp || 20; });

    if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
    if (typeof renderBottomPanel === 'function') renderBottomPanel();
    if (typeof updatePlayerUI === 'function') updatePlayerUI();

    if (typeof showCustomPopup === 'function') {
        showCustomPopup("🏥 Centro Pokémon", `A enfermeira Joy cuidou da equipa de ${cp.name}!\n\n✨ Todos os Pokémon foram totalmente curados!`, true);
    }
    if (typeof appendAdventureLog === 'function') {
        appendAdventureLog(`${cp.name} visitou o Centro Pokémon: Equipa totalmente curada.`);
    }

    // Se veio de uma cidade, reabre o hub da cidade ao fechar ou voltar
    if (cityName && typeof openCityModal === 'function') {
        openCityModal(cityName);
    }
}

// ------------------------------------------------------------
// --- POKÉ MART (LOJA DE ITENS COM QUANTIDADE) ---
// ------------------------------------------------------------

export function openPokemartModal(cityName = '') {
    let martModal = document.getElementById('pokemart-modal');
    if (!martModal) {
        martModal = document.createElement('div');
        martModal.id = 'pokemart-modal';
        martModal.className = 'fixed inset-0 bg-black/85 z-[350] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(martModal);
    }

    renderMartContent(martModal, cityName);
    martModal.classList.remove('hidden');
}

function renderMartContent(modalEl, cityName = '') {
    const cp = getCurrentPlayer();
    
    // Puxa diretamente do catálogo oficial de itens garantindo as sprites corretas do Supabase
    const sellableIds = ['poke_ball', 'ball_great', 'ball_ultra', 'item_rarecandy', 'evolution_stone', 'item_potion', 'item_revive', 'item_vitamin'];
    let itemsForSale = ITEM_CATALOG.filter(item => sellableIds.includes(item.id));

    let shopHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-blue-500 rounded-2xl bg-gradient-to-b from-[#0f172a] to-[#020617] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-blue-900/60 pb-2">
                <span class="text-xs font-black text-blue-400 font-cinzel tracking-wider">🏪 POKÉ MART (${cp.name})</span>
                <span class="bg-amber-500 text-black font-black text-[10px] px-2 py-0.5 rounded">Ouro: ${cp.gold} 🪙</span>
            </div>
            <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
    `;

    itemsForSale.forEach(item => {
        const itemImg = item.image
            ? `<img src="${item.image}" class="w-8 h-8 object-contain" onerror="this.style.display='none'">`
            : `<span class="text-xl">${item.icon}</span>`;

        shopHTML += `
            <div class="flex items-center justify-between gap-3 bg-black/50 p-2.5 rounded-xl border border-blue-900/50">
                <div class="flex items-center gap-2 min-w-0">
                    ${itemImg}
                    <div class="min-w-0">
                        <p class="text-xs font-bold text-white truncate">${item.name}</p>
                        <p class="text-[9px] text-slate-400">${item.desc}</p>
                        <p class="text-[10px] font-black text-amber-400 mt-0.5">${item.cost || 50} 🪙 por unidade</p>
                    </div>
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                    <div class="flex items-center bg-slate-950 border border-blue-700 rounded-lg overflow-hidden">
                        <button type="button" onclick="window.changeMartQuantity('${item.id}', -1)" class="px-2 py-1.5 text-blue-300 hover:bg-blue-900 hover:text-white font-black">−</button>
                        <input id="mart-quantity-${item.id}" type="number" min="1" max="999" value="1" inputmode="numeric" class="w-12 bg-transparent px-1 py-1.5 text-center text-xs text-white font-black focus:outline-none" oninput="window.normalizeMartQuantity(this)">
                        <button type="button" onclick="window.changeMartQuantity('${item.id}', 1)" class="px-2 py-1.5 text-blue-300 hover:bg-blue-900 hover:text-white font-black">+</button>
                    </div>

                    <button type="button" onclick="window.buyItemFromMart('${item.id}', ${item.cost || 50}, document.getElementById('mart-quantity-${item.id}').value, '${cityName}')" class="bg-blue-600 hover:bg-blue-500 text-white font-black px-2.5 py-1.5 rounded-lg text-[10px] shadow cursor-pointer whitespace-nowrap">
                        Comprar
                    </button>
                </div>
            </div>
        `;
    });

    shopHTML += `
            </div>
            <!-- Botão de Voltar para a Cidade -->
            <button onclick="document.getElementById('pokemart-modal').remove(); ${cityName ? `window.openCityModal('${cityName}')` : ''}" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-xl text-xs cursor-pointer">← Voltar</button>
        </div>
    `;
    modalEl.innerHTML = shopHTML;
}
// ------------------------------------------------------------
// EXPOSIÇÃO GLOBAL E FUNÇÕES DE QUANTIDADE DA LOJA
// ------------------------------------------------------------

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

window.buyItemFromMart = function(itemId, cost, requestedQuantity = 1, cityName = '') {
    const cp = getCurrentPlayer();
    if (!cp) return;

    const quantity = Math.max(1, Math.min(999, Math.floor(Number(requestedQuantity) || 1)));
    const unitCost = Math.max(0, Math.floor(Number(cost) || 0));
    const totalCost = unitCost * quantity;

    if (Number(cp.gold) < totalCost) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup("Sem Ouro", `❌ Ouro insuficiente para comprar ${quantity} unidade(s).\nNecessário: ${totalCost} 🪙\nDisponível: ${Number(cp.gold) || 0} 🪙`, false);
        }
        return;
    }

    if (!Array.isArray(cp.inventory)) cp.inventory = [];

    const baseItemsCatalog = {
        poke_ball: { id: 'poke_ball', name: 'Poké Ball', type: 'sphere', value: 0, icon: '🔴', image: `${SUPABASE_STORAGE_URL}items/poke_ball.png`, desc: 'Esfera clássica.' },
        ball_great: { id: 'ball_great', name: 'Great Ball', type: 'sphere', value: 1, icon: '🔵', image: `${SUPABASE_STORAGE_URL}items/ball_great.png`, desc: '+1 na captura.' },
        ball_ultra: { id: 'ball_ultra', name: 'Ultra Ball', type: 'sphere', value: 2, icon: '🟡', image: `${SUPABASE_STORAGE_URL}items/ball_ultra.png`, desc: '+2 na captura.' },
        item_rarecandy: { id: 'item_rarecandy', name: 'Rare Candy', type: 'rarecandy', value: 100, icon: '🍬', image: `${SUPABASE_STORAGE_URL}items/rare_candy.png`, desc: 'Dá 100 XP (Sobe de Nível).' },
        evolution_stone: { id: 'evolution_stone', name: 'Evolution Stone', type: 'evolution', value: 1, icon: '💎', image: `${SUPABASE_STORAGE_URL}items/evolution_stone.png`, desc: 'Evolve um Anima compatível.' },
        item_potion: { id: 'item_potion', name: 'Potion', type: 'heal', value: 20, icon: '💊', image: `${SUPABASE_STORAGE_URL}items/potion.png`, desc: 'Restaura 20 HP.' },
        item_revive: { id: 'item_revive', name: 'Revive', type: 'revive', value: 50, icon: '🌟', image: `${SUPABASE_STORAGE_URL}items/revive.png`, desc: 'Revive um Anima desmaiado.' },
        item_vitamin: { id: 'item_vitamin', name: 'Vitamin', type: 'battle', value: 2, icon: '🧪', image: `${SUPABASE_STORAGE_URL}items/vitamin.png`, desc: '+2 STR na batalha.' }
    };

    const itemTemplate = baseItemsCatalog[itemId];
    if (!itemTemplate) return;

    cp.gold = Math.max(0, Number(cp.gold || 0) - totalCost);

    const existingItem = cp.inventory.find(item => item && item.id === itemId);
    if (existingItem) {
        existingItem.count = (Number(existingItem.count) || 0) + quantity;
    } else {
        cp.inventory.push({ ...itemTemplate, count: quantity });
    }

    if (typeof updatePlayerUI === 'function') updatePlayerUI();
    if (typeof renderBottomPanel === 'function') renderBottomPanel();
    if (typeof saveGameProgress === 'function') saveGameProgress();

    if (typeof showCustomPopup === 'function') {
        showCustomPopup("Compra Realizada", `🎉 ${quantity} unidade(s) de ${itemTemplate.name} adicionada(s) à mochila!\n\n💰 Total pago: ${totalCost} 🪙`, true);
    }

    const martModal = document.getElementById('pokemart-modal');
    if (martModal) {
        renderMartContent(martModal, cityName);
    }
};

// Expõe as funções principais para o escopo global
window.openCityModal = openCityModal;
window.openPokemonCenterModal = openPokemonCenterModal;
window.openPokemartModal = openPokemartModal;
