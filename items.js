// --- BASE DE DADOS OFICIAL: ITENS (HEX Edition) ---
// Classificação baseada no Manual do Jogo (Comuns, Rápidos, Captura, Batalha e Evolução).

if (typeof SUPABASE_STORAGE_URL === 'undefined') {
    var SUPABASE_STORAGE_URL = "https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/";
}

const ITEM_CATALOG = [
    // ==========================================
    // --- ITENS COMUNS ---
    // ==========================================
    {
        id: 'bicycle',
        name: 'Bicycle',
        category: 'common',
        icon: '🚲',
        image: `${SUPABASE_STORAGE_URL}items/bicycle.png`,
        desc: 'Permite jogar um turno extra após o seu turno atual. Você pode usar mais de uma bicicleta no mesmo turno.'
    },
    {
        id: 'escape_rope',
        name: 'Escape Rope',
        category: 'common',
        icon: '🪢',
        image: `${SUPABASE_STORAGE_URL}items/escape_rope.png`,
        desc: 'Permite usar seu turno não para mover, mas para ativar o espaço em que você está ou um adjacente no tabuleiro.'
    },
    {
        id: 'fly',
        name: 'Fly',
        category: 'common',
        icon: '🦅',
        image: `${SUPABASE_STORAGE_URL}items/fly.png`,
        desc: 'Move seu peão para qualquer espaço no hexágono atual e ativa o espaço após chegar lá. Deve ser sua única ação no turno.'
    },
    {
        id: 'fishing_rod',
        name: 'Fishing Rod',
        category: 'common',
        icon: '🎣',
        image: `${SUPABASE_STORAGE_URL}items/fishing_rod.png`,
        desc: 'Equipamento que pode ser mantido nos slots de equipamento do Treinador para interagir com áreas de pesca ou água.'
    },
    {
        id: 'honey',
        name: 'Honey',
        category: 'common',
        icon: '🍯',
        image: `${SUPABASE_STORAGE_URL}items/honey.png`,
        desc: 'Pode ser usado para tentar capturar um Pokémon que esteja no mesmo hexágono que você.'
    },
    {
        id: 'pokenav_plus',
        name: 'PokéNav Plus',
        category: 'common',
        icon: '📱',
        image: `${SUPABASE_STORAGE_URL}items/pokenav.png`,
        desc: 'Força um jogador a descartar seu Card de Treinador e comprar outros dois do monte.'
    },
    {
        id: 'rare_candy',
        name: 'Rare Candy',
        category: 'common',
        icon: '🍬',
        image: `${SUPABASE_STORAGE_URL}items/rare_candy.png`,
        desc: 'Pode ser usado para dar XP imediato e subir de nível o seu Anima, ou capturar Pokémon elegíveis da mesma família evolutiva.'
    },
    {
        id: 'repel',
        name: 'Repel',
        category: 'common',
        icon: '💨',
        image: `${SUPABASE_STORAGE_URL}items/repel.png`,
        desc: 'Troca um Pokémon revelado no tabuleiro pelo próximo Pokémon da mesma cor da pilha.'
    },
    {
        id: 'rocket_attack',
        name: 'Rocket Attack',
        category: 'common',
        icon: '🚀',
        image: `${SUPABASE_STORAGE_URL}items/rocket_attack.png`,
        desc: 'Escolhe um oponente e rouba aleatoriamente um Item da mão dele.'
    },

    // ==========================================
    // --- ITENS RÁPIDOS ---
    // ==========================================
    {
        id: 'poke_doll',
        name: 'Poké Doll',
        category: 'quick',
        icon: '🧸',
        image: `${SUPABASE_STORAGE_URL}items/poke_doll.png`,
        desc: 'Bloqueia qualquer efeito direto causado a você, seja de um Item, Evento ou espaço de cidade.'
    },
    {
        id: 'time_travel',
        name: 'Time Travel',
        category: 'quick',
        icon: '⏳',
        image: `${SUPABASE_STORAGE_URL}items/time_travel.png`,
        desc: 'Força a rerrolagem de qualquer dado, podendo ser usado a qualquer momento após uma rolagem sua ou de um oponente.'
    },
    {
        id: 'exp_share',
        name: 'Exp. Share',
        category: 'quick',
        icon: '📈',
        image: `${SUPABASE_STORAGE_URL}items/exp_share.png`,
        desc: 'Ativado quando um oponente ativa um Evento ou Super Evento: resolve o evento e copia os efeitos para você.'
    },
    {
        id: 'lure_module',
        name: 'Lure Module',
        category: 'quick',
        icon: '🔮',
        image: `${SUPABASE_STORAGE_URL}items/lure_module.png`,
        desc: 'Troca as posições de dois Pokémon da mesma cor no tabuleiro, revelados ou não.'
    },
    {
        id: 'poke_flute',
        name: 'Poké Flute',
        category: 'quick',
        icon: '🎶',
        image: `${SUPABASE_STORAGE_URL}items/poke_flute.png`,
        desc: 'Pode ser usado quando um Evento é ativado para cancelá-lo, puxar outro e ativar o novo em seu lugar.'
    },

    // ==========================================
    // --- POKÉ BALLS, AURAS E CAPTURA ---
    // ==========================================
    {
        id: 'poke_ball',
        name: 'Poké Ball',
        category: 'capture',
        type: 'sphere',
        value: 0,
        icon: '🔴',
        image: `${SUPABASE_STORAGE_URL}items/poke_ball.png`,
        aura: null,
        visualClass: null,
        desc: 'Esfera clássica padrão para tentativas de captura.'
    },
    {
        id: 'ball_great',
        name: 'Great Ball',
        category: 'capture',
        type: 'sphere',
        value: 1,
        icon: '🔵',
        image: `${SUPABASE_STORAGE_URL}items/great_ball.png`,
        aura: null,
        visualClass: null,
        desc: 'Adiciona +1 ao resultado do dado de captura.'
    },
    {
        id: 'ball_ultra',
        name: 'Ultra Ball',
        category: 'capture',
        type: 'sphere',
        value: 2,
        icon: '🟡',
        image: `${SUPABASE_STORAGE_URL}items/ultra_ball.png`,
        aura: null,
        visualClass: null,
        desc: 'Adiciona +2 ao resultado do dado de captura.'
    },
    {
        id: 'master_ball',
        name: 'Master Ball',
        category: 'capture',
        type: 'sphere',
        value: 4,
        icon: '🟣',
        image: `${SUPABASE_STORAGE_URL}items/master_ball.png`,
        aura: null,
        visualClass: null,
        desc: 'Adiciona +4 ao resultado do dado de captura.'
    },
    {
        id: 'ball_mystic',
        name: 'Mystic Ball',
        category: 'capture',
        type: 'sphere',
        value: 2,
        icon: '🔮',
        image: `${SUPABASE_STORAGE_URL}items/mystic_ball.png`,
        aura: 'aura-mystic',
        visualClass: 'aura-mystic',
        auraName: 'Aura Mística',
        desc: 'Adiciona +2 na captura e aplica uma Aura Mística roxa permanente ao Pokémon capturado.'
    },
    {
        id: 'ball_flame',
        name: 'Flame Ball',
        category: 'capture',
        type: 'sphere',
        value: 2,
        icon: '🔥',
        image: `${SUPABASE_STORAGE_URL}items/flame_ball.png`,
        aura: 'aura-flame',
        visualClass: 'aura-flame',
        auraName: 'Aura Flamejante',
        desc: 'Adiciona +2 na captura e aplica uma Aura Flamejante permanente ao Pokémon capturado.'
    },
    {
        id: 'ball_aqua',
        name: 'Aqua Ball',
        category: 'capture',
        type: 'sphere',
        value: 2,
        icon: '💧',
        image: `${SUPABASE_STORAGE_URL}items/aqua_ball.png`,
        aura: 'aura-aqua',
        visualClass: 'aura-aqua',
        auraName: 'Aura Aquática',
        desc: 'Adiciona +2 na captura e aplica uma Aura Aquática permanente ao Pokémon capturado.'
    },
    {
        id: 'ball_electric',
        name: 'Volt Ball',
        category: 'capture',
        type: 'sphere',
        value: 3,
        icon: '⚡',
        image: `${SUPABASE_STORAGE_URL}items/electric_ball.png`,
        aura: 'aura-electric',
        visualClass: 'aura-electric',
        auraName: 'Aura Elétrica',
        desc: 'Adiciona +3 na captura e aplica uma Aura Elétrica ao Pokémon capturado.'
    },
    {
        id: 'ball_shadow',
        name: 'Shadow Ball',
        category: 'capture',
        type: 'sphere',
        value: 3,
        icon: '🌑',
        image: `${SUPABASE_STORAGE_URL}items/shadow_ball.png`,
        aura: 'aura-shadow',
        visualClass: 'aura-shadow',
        auraName: 'Aura Sombria',
        desc: 'Adiciona +3 na captura e aplica uma Aura Sombria ao Pokémon capturado.'
    },
    {
        id: 'ball_rainbow',
        name: 'Rainbow Ball',
        category: 'capture',
        type: 'sphere',
        value: 4,
        icon: '🌈',
        image: `${SUPABASE_STORAGE_URL}items/rainbow_ball.png`,
        aura: 'aura-rainbow',
        visualClass: 'aura-rainbow',
        auraName: 'Aura Prismática',
        desc: 'Adiciona +4 na captura e aplica uma Aura Prismática ao Pokémon capturado.'
    },

    // ==========================================
    // --- ITENS DE EVOLUÇÃO ---
    // ==========================================
    {
        id: 'evolution_stone',
        name: 'Evolution Stone',
        category: 'evolution',
        type: 'evolution',
        value: 1,
        icon: '💎',
        image: `${SUPABASE_STORAGE_URL}items/evolution_stone.png`,
        desc: 'Pedra mística capaz de forçar a evolução imediata de um Pokémon compatível.'
    },

    // ==========================================
    // --- ITENS DE BATALHA E CURA ---
    // ==========================================
    {
        id: 'item_vitamin',
        name: 'Vitamin',
        category: 'battle',
        type: 'battle',
        value: 2,
        icon: '🧪',
        image: `${SUPABASE_STORAGE_URL}items/vitamin.png`,
        desc: 'Aumenta o bônus temporário de combate em +2.'
    },
    {
        id: 'x_attack',
        name: 'X Attack',
        category: 'battle',
        type: 'battle',
        value: 2,
        icon: '⚔️',
        image: `${SUPABASE_STORAGE_URL}items/x_attack.png`,
        desc: 'Aumenta o bônus temporário de combate em +2.'
    },
    {
        id: 'item_potion',
        name: 'Potion',
        category: 'battle',
        type: 'heal',
        value: 20,
        icon: '💊',
        image: `${SUPABASE_STORAGE_URL}items/potion.png`,
        desc: 'Restaura 20 HP do Pokémon ativo.'
    },
    {
        id: 'item_revive',
        name: 'Revive',
        category: 'battle',
        type: 'revive',
        value: 50,
        icon: '🌟',
        image: `${SUPABASE_STORAGE_URL}items/revive.png`,
        desc: 'Revive um Pokémon desmaiado com metade do HP máximo.'
    },
    {
        id: 'item_rarecandy',
        name: 'Rare Candy',
        category: 'evolution',
        type: 'rarecandy',
        value: 100,
        icon: '🍬',
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

function normalizeItemId(itemId) {
    const rawId = String(itemId || '').trim();
    return ITEM_ID_ALIASES[rawId] || rawId;
}

function getItemDetails(itemId) {
    const normalizedId = normalizeItemId(itemId);
    return ITEM_CATALOG.find(item => item.id === normalizedId) || null;
}

function normalizeInventoryItem(itemEntry) {
    if (!itemEntry) return null;

    const originalId = typeof itemEntry === 'string'
        ? itemEntry
        : itemEntry.id;

    const itemInfo = getItemDetails(originalId);

    if (!itemInfo) {
        return typeof itemEntry === 'string'
            ? {
                id: normalizeItemId(itemEntry),
                name: itemEntry,
                count: 1,
                category: 'common',
                type: 'common',
                icon: '🎒',
                desc: 'Item não catalogado.'
            }
            : itemEntry;
    }

    if (typeof itemEntry === 'string') {
        return {
            ...itemInfo,
            count: 1
        };
    }

    return {
        ...itemInfo,
        ...itemEntry,
        id: itemInfo.id,
        count: Math.max(0, Number(itemEntry.count) || 0),
        type: itemEntry.type || itemInfo.type || itemInfo.category,
        aura: itemEntry.aura || itemInfo.aura || null,
        visualClass: itemEntry.visualClass || itemInfo.visualClass || null
    };
}

function normalizePlayerInventory(player) {
    if (!player || !Array.isArray(player.inventory)) return;

    player.inventory = player.inventory
        .map(normalizeInventoryItem)
        .filter(item => item && Number(item.count) > 0);
}

function renderInventoryUI(player) {
    const container = document.getElementById('bottom-dynamic-container');

    if (!container || !player) return;

    normalizePlayerInventory(player);

    container.innerHTML = '';

    const inventory = player.inventory || [];

    if (inventory.length === 0) {
        container.innerHTML = `
            <p class="text-[10px] text-slate-400 col-span-4 text-center py-4">
                A sua mochila está vazia.
            </p>
        `;
        return;
    }

    inventory.forEach((itemEntry, index) => {
        const itemInfo = getItemDetails(itemEntry.id);

        if (!itemInfo || Number(itemEntry.count) <= 0) {
            return;
        }

        const isCaptureItem = itemInfo.type === 'sphere';
        const auraClass = itemInfo.visualClass || '';

        container.innerHTML += `
            <div class="
                bg-black/50 border border-amber-900/60 rounded-lg p-2
                flex flex-col items-center justify-between text-center
                relative group overflow-hidden
                ${auraClass}
            ">
                <span class="text-lg">${itemInfo.icon}</span>

                <img
                    src="${itemInfo.image}"
                    alt="${itemInfo.name}"
                    class="w-10 h-10 object-contain drop-shadow"
                    onerror="this.style.display='none'"
                >

                <span class="text-[9px] font-bold text-amber-300 truncate w-full">
                    ${itemInfo.name} (${itemEntry.count})
                </span>

                <span class="text-[8px] text-slate-400 leading-tight">
                    ${itemInfo.desc}
                </span>

                <button
                    type="button"
                    onclick="usePlayerItem('${itemInfo.id}', ${index})"
                    class="mt-1 bg-amber-600 hover:bg-amber-500 text-black px-2 py-0.5 rounded text-[8px] font-black w-full shadow cursor-pointer"
                >
                    ${isCaptureItem ? 'Usar na Captura' : 'Usar'}
                </button>
            </div>
        `;
    });
}

function usePlayerItem(itemId, itemIndex) {
    const cp = typeof getCurrentPlayer === 'function'
        ? getCurrentPlayer()
        : null;

    if (!cp || !Array.isArray(cp.inventory)) {
        return;
    }

    normalizePlayerInventory(cp);

    const normalizedId = normalizeItemId(itemId);
    const item = cp.inventory[itemIndex];
    const itemInfo = getItemDetails(normalizedId);

    if (!item || !itemInfo || Number(item.count) <= 0) {
        return;
    }

    // Poké Balls não são consumidas neste botão.
    // O consumo ocorre somente dentro do fluxo oficial de captura.
    if (itemInfo.type === 'sphere') {
        const wild = typeof currentEncounterState !== 'undefined'
            ? currentEncounterState.wildPokemon
            : null;

        if (!wild) {
            if (typeof showCustomPopup === 'function') {
                showCustomPopup(
                    'Nenhum Pokémon em combate',
                    'Abra um encontro com um Pokémon selvagem antes de usar uma Poké Ball.',
                    false
                );
            }
            return;
        }

        if (typeof triggerCaptureFlow === 'function') {
            triggerCaptureFlow(wild);
        }

        return;
    }

    if (typeof appendAdventureLog === 'function') {
        appendAdventureLog(
            `🎒 ${cp.name} selecionou o item ${itemInfo.name}.`
        );
    }

    item.count--;

    if (item.count <= 0) {
        cp.inventory.splice(itemIndex, 1);
    }

    normalizePlayerInventory(cp);

    if (typeof renderInventoryUI === 'function') {
        renderInventoryUI(cp);
    }

    if (typeof renderBottomPanel === 'function') {
        renderBottomPanel();
    }
}
