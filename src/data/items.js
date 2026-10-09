// --- src/data/items.js ---
// Base de dados oficial de itens (Apenas Sprites Oficiais, sem emojis)

import { SUPABASE_STORAGE_URL } from '../config/constants.js';
import { getCurrentPlayer } from '../core/state.js';

export const ITEM_CATALOG = [
    // --- ITENS COMUNS ---
    {
        id: 'bicycle',
        name: 'Bicycle',
        category: 'common',
        image: `${SUPABASE_STORAGE_URL}items/bicycle.png`,
        desc: 'Permite jogar um turno extra após o seu turno atual.'
    },
    {
        id: 'escape_rope',
        name: 'Escape Rope',
        category: 'common',
        image: `${SUPABASE_STORAGE_URL}items/escape_rope.png`,
        desc: 'Permite ativar o espaço em que você está ou um adjacente.'
    },
    {
        id: 'fly',
        name: 'Fly',
        category: 'common',
        image: `${SUPABASE_STORAGE_URL}items/fly.png`,
        desc: 'Move seu peão para qualquer espaço no hexágono atual.'
    },
    {
        id: 'fishing_rod',
        name: 'Fishing Rod',
        category: 'common',
        image: `${SUPABASE_STORAGE_URL}items/fishing_rod.png`,
        desc: 'Equipamento para interagir com áreas de pesca ou água.'
    },
    {
        id: 'honey',
        name: 'Honey',
        category: 'common',
        image: `${SUPABASE_STORAGE_URL}items/honey.png`,
        desc: 'Tenta capturar um Pokémon no mesmo hexágono.'
    },
    {
        id: 'pokenav_plus',
        name: 'PokéNav Plus',
        category: 'common',
        image: `${SUPABASE_STORAGE_URL}items/pokenav.png`,
        desc: 'Força um oponente a descartar o Card de Treinador.'
    },
    {
        id: 'rare_candy',
        name: 'Rare Candy',
        category: 'common',
        image: `${SUPABASE_STORAGE_URL}items/rare_candy.png`,
        desc: 'Concede XP imediato e sobe de nível o Anima.'
    },
    {
        id: 'repel',
        name: 'Repel',
        category: 'common',
        image: `${SUPABASE_STORAGE_URL}items/repel.png`,
        desc: 'Troca um Pokémon revelado no tabuleiro.'
    },
    {
        id: 'rocket_attack',
        name: 'Rocket Attack',
        category: 'common',
        image: `${SUPABASE_STORAGE_URL}items/rocket_attack.png`,
        desc: 'Rouba aleatoriamente um Item da mão de um oponente.'
    },

    // --- ITENS RÁPIDOS ---
    {
        id: 'poke_doll',
        name: 'Poké Doll',
        category: 'quick',
        image: `${SUPABASE_STORAGE_URL}items/poke_doll.png`,
        desc: 'Bloqueia efeitos diretos causados a você.'
    },
    {
        id: 'time_travel',
        name: 'Time Travel',
        category: 'quick',
        image: `${SUPABASE_STORAGE_URL}items/time_travel.png`,
        desc: 'Força a rerrolagem de qualquer dado.'
    },
    {
        id: 'exp_share',
        name: 'Exp. Share',
        category: 'quick',
        image: `${SUPABASE_STORAGE_URL}items/exp_share.png`,
        desc: 'Copia os efeitos de Eventos ativados por oponentes.'
    },
    {
        id: 'lure_module',
        name: 'Lure Module',
        category: 'quick',
        image: `${SUPABASE_STORAGE_URL}items/lure_module.png`,
        desc: 'Troca posições de dois Pokémon no tabuleiro.'
    },
    {
        id: 'poke_flute',
        name: 'Poké Flute',
        category: 'quick',
        image: `${SUPABASE_STORAGE_URL}items/poke_flute.png`,
        desc: 'Cancela um Evento e puxa outro em seu lugar.'
    },

    // --- POKÉ BALLS E CAPTURA ---
    {
        id: 'poke_ball',
        name: 'Poké Ball',
        category: 'capture',
        type: 'sphere',
        value: 0,
        cost: 50,
        image: `${SUPABASE_STORAGE_URL}items/poke_ball.png`,
        desc: 'Esfera clássica padrão.'
    },
    {
        id: 'ball_great',
        name: 'Great Ball',
        category: 'capture',
        type: 'sphere',
        value: 1,
        cost: 100,
        image: `${SUPABASE_STORAGE_URL}items/great_ball.png`,
        desc: 'Adiciona +1 na captura.'
    },
    {
        id: 'ball_ultra',
        name: 'Ultra Ball',
        category: 'capture',
        type: 'sphere',
        value: 2,
        cost: 200,
        image: `${SUPABASE_STORAGE_URL}items/ultra_ball.png`,
        desc: 'Adiciona +2 na captura.'
    },
    {
        id: 'master_ball',
        name: 'Master Ball',
        category: 'capture',
        type: 'sphere',
        value: 4,
        cost: 1000,
        image: `${SUPABASE_STORAGE_URL}items/master_ball.png`,
        desc: 'Adiciona +4 na captura.'
    },
    {
        id: 'ball_mystic',
        name: 'Mystic Ball',
        category: 'capture',
        type: 'sphere',
        value: 2,
        cost: 300,
        image: `${SUPABASE_STORAGE_URL}items/mystic_ball.png`,
        aura: 'aura-mystic',
        visualClass: 'aura-mystic',
        desc: 'Adiciona +2 e aplica Aura Mística.'
    },
    {
        id: 'ball_flame',
        name: 'Flame Ball',
        category: 'capture',
        type: 'sphere',
        value: 2,
        cost: 300,
        image: `${SUPABASE_STORAGE_URL}items/flame_ball.png`,
        aura: 'aura-flame',
        visualClass: 'aura-flame',
        desc: 'Adiciona +2 e aplica Aura Flamejante.'
    },
    {
        id: 'ball_aqua',
        name: 'Aqua Ball',
        category: 'capture',
        type: 'sphere',
        value: 2,
        cost: 300,
        image: `${SUPABASE_STORAGE_URL}items/aqua_ball.png`,
        aura: 'aura-aqua',
        visualClass: 'aura-aqua',
        desc: 'Adiciona +2 e aplica Aura Aquática.'
    },
    {
        id: 'ball_electric',
        name: 'Volt Ball',
        category: 'capture',
        type: 'sphere',
        value: 3,
        cost: 400,
        image: `${SUPABASE_STORAGE_URL}items/electric_ball.png`,
        aura: 'aura-electric',
        visualClass: 'aura-electric',
        desc: 'Adiciona +3 e aplica Aura Elétrica.'
    },
    {
        id: 'ball_shadow',
        name: 'Shadow Ball',
        category: 'capture',
        type: 'sphere',
        value: 3,
        cost: 400,
        image: `${SUPABASE_STORAGE_URL}items/shadow_ball.png`,
        aura: 'aura-shadow',
        visualClass: 'aura-shadow',
        desc: 'Adiciona +3 e aplica Aura Sombria.'
    },
    {
        id: 'ball_rainbow',
        name: 'Rainbow Ball',
        category: 'capture',
        type: 'sphere',
        value: 4,
        cost: 800,
        image: `${SUPABASE_STORAGE_URL}items/rainbow_ball.png`,
        aura: 'aura-rainbow',
        visualClass: 'aura-rainbow',
        desc: 'Adiciona +4 e aplica Aura Prismática.'
    },

    // --- ITENS DE EVOLUÇÃO, CURA E BATALHA ---
    {
        id: 'evolution_stone',
        name: 'Evolution Stone',
        category: 'evolution',
        type: 'evolution',
        value: 1,
        cost: 500,
        image: `${SUPABASE_STORAGE_URL}items/evolution_stone.png`,
        desc: 'Força a evolução imediata de um Pokémon compatível.'
    },
    {
        id: 'item_vitamin',
        name: 'Vitamin',
        category: 'battle',
        type: 'battle',
        value: 2,
        cost: 150,
        image: `${SUPABASE_STORAGE_URL}items/vitamin.png`,
        desc: 'Aumenta o bônus de combate em +2.'
    },
    {
        id: 'x_attack',
        name: 'X Attack',
        category: 'battle',
        type: 'battle',
        value: 2,
        cost: 150,
        image: `${SUPABASE_STORAGE_URL}items/x_attack.png`,
        desc: 'Aumenta o bônus temporário de combate.'
    },
    {
        id: 'item_potion',
        name: 'Potion',
        category: 'battle',
        type: 'heal',
        value: 20,
        cost: 50,
        image: `${SUPABASE_STORAGE_URL}items/potion.png`,
        desc: 'Restaura 20 HP do Pokémon ativo.'
    },
    {
        id: 'item_revive',
        name: 'Revive',
        category: 'battle',
        type: 'revive',
        value: 50,
        cost: 250,
        image: `${SUPABASE_STORAGE_URL}items/revive.png`,
        desc: 'Revive um Pokémon desmaiado.'
    },
    {
        id: 'item_rarecandy',
        name: 'Rare Candy',
        category: 'evolution',
        type: 'rarecandy',
        value: 100,
        cost: 300,
        image: `${SUPABASE_STORAGE_URL}items/rare_candy.png`,
        desc: 'Concede 100 XP ao Pokémon selecionado.'
    }
];

const ITEM_ID_ALIASES = {
    great_ball: 'ball_great',
    ultra_ball: 'ball_ultra',
    vitamin: 'item_vitamin',
    potion: 'item_potion',
    revive: 'item_revive',
    rare_candy: 'item_rarecandy',
    rarecandy: 'item_rarecandy',
    masterball: 'master_ball',
    mysticball: 'ball_mystic',
    flameball: 'ball_flame',
    aquaball: 'ball_aqua',
    electricball: 'ball_electric',
    volt_ball: 'ball_electric',
    shadowball: 'ball_shadow',
    rainbowball: 'ball_rainbow'
};

export function normalizeItemId(itemId) {
    const rawId = String(itemId || '').trim();
    return ITEM_ID_ALIASES[rawId] || rawId;
}

export function getItemDetails(itemId) {
    const normalizedId = normalizeItemId(itemId);
    return ITEM_CATALOG.find(item => item.id === normalizedId) || null;
}

export function normalizeInventoryItem(itemEntry) {
    if (!itemEntry) return null;
    const originalId = typeof itemEntry === 'string' ? itemEntry : itemEntry.id;
    const itemInfo = getItemDetails(originalId);

    if (!itemInfo) {
        return typeof itemEntry === 'string'
            ? { id: normalizeItemId(itemEntry), name: itemEntry, count: 1, category: 'common', type: 'common', desc: 'Item não catalogado.' }
            : itemEntry;
    }

    if (typeof itemEntry === 'string') {
        return { ...itemInfo, count: 1 };
    }

    return {
        ...itemInfo,
        ...itemEntry,
        id: itemInfo.id,
        count: Math.max(0, Number(itemEntry.count) || 0),
        type: itemEntry.type || itemInfo.type || itemInfo.category,
        image: itemInfo.image
    };
}

export function normalizePlayerInventory(player) {
    if (!player || !Array.isArray(player.inventory)) return;
    player.inventory = player.inventory
        .map(normalizeInventoryItem)
        .filter(item => item && Number(item.count) > 0);
}

export function renderInventoryUI(player) {
    const container = document.getElementById('bottom-dynamic-container');
    if (!container || !player) return;

    normalizePlayerInventory(player);
    container.innerHTML = '';
    const inventory = player.inventory || [];

    if (inventory.length === 0) {
        container.innerHTML = `<p class="text-[10px] text-slate-400 col-span-4 text-center py-4">A sua mochila está vazia.</p>`;
        return;
    }

    inventory.forEach((itemEntry, index) => {
        const itemInfo = getItemDetails(itemEntry.id);
        if (!itemInfo || Number(itemEntry.count) <= 0) return;

        const isCaptureItem = itemInfo.type === 'sphere';
        const auraClass = itemInfo.visualClass || '';

        container.innerHTML += `
            <div class="bg-black/50 border border-amber-900/60 rounded-lg p-2 flex flex-col items-center justify-between text-center relative group overflow-hidden ${auraClass}">
                <img src="${itemInfo.image}" alt="${itemInfo.name}" class="w-10 h-10 object-contain drop-shadow" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                <span class="text-[9px] font-bold text-amber-300 truncate w-full">${itemInfo.name} (${itemEntry.count})</span>
                <span class="text-[8px] text-slate-400 leading-tight">${itemInfo.desc}</span>
                <button type="button" onclick="window.usePlayerItem('${itemInfo.id}', ${index})" class="mt-1 bg-amber-600 hover:bg-amber-500 text-black px-2 py-0.5 rounded text-[8px] font-black w-full shadow cursor-pointer">
                    ${isCaptureItem ? 'Usar na Captura' : 'Usar'}
                </button>
            </div>
        `;
    });
}

window.usePlayerItem = function(itemId, itemIndex) {
    const cp = getCurrentPlayer();
    if (!cp || !Array.isArray(cp.inventory)) return;

    normalizePlayerInventory(cp);
    const normalizedId = normalizeItemId(itemId);
    const item = cp.inventory[itemIndex];
    const itemInfo = getItemDetails(normalizedId);

    if (!item || !itemInfo || Number(item.count) <= 0) return;

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

    item.count--;
    if (item.count <= 0) {
        cp.inventory.splice(itemIndex, 1);
    }
    normalizePlayerInventory(cp);
    renderInventoryUI(cp);
};
