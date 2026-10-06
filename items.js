// --- BASE DE DADOS OFICIAL: ITENS (HEX Edition) ---
// Classificação baseada no Manual do Jogo (Comuns, Rápidos, Captura, Batalha e Evolução).

// Declaração segura para evitar conflitos se já existir noutro script
if (typeof SUPABASE_STORAGE_URL === 'undefined') {
    var SUPABASE_STORAGE_URL = "https://juowcnkjhfbfttnwge.supabase.co/storage/v1/object/public/sprites/";
}

const ITEM_CATALOG = [
    // ==========================================
    // --- ITENS COMUNS (Usados no seu Turno) ---
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
        desc: 'Equipamento que pode ser mantido nos slots de equipamento do Treinador para interagir com áreas de pesca/água.'
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
    // --- ITENS RÁPIDOS (Usados a qualquer momento) ---
    // ==========================================
    {
        id: 'poke_doll',
        name: 'Poké Doll',
        category: 'quick',
        icon: '🧸',
        image: `${SUPABASE_STORAGE_URL}items/poke_doll.png`,
        desc: 'Bloqueia qualquer efeito direto causado a você (seja de um Item, Evento ou espaço de cidade).'
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
        desc: 'Troca as posições de dois Pokémon da mesma cor no tabuleiro (revelados ou não).'
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
    // --- POKÉ BALLS (Itens de Captura e Auras) ---
    // ==========================================
    {
        id: 'poke_ball',
        name: 'Poké Ball',
        category: 'capture',
        value: 0,
        icon: '🔴',
        image: `${SUPABASE_STORAGE_URL}items/poke_ball.png`,
        desc: 'Esfera clássica padrão para tentativas de captura.'
    },
    {
        id: 'great_ball',
        name: 'Great Ball',
        category: 'capture',
        value: 1,
        icon: '🔵',
        image: `${SUPABASE_STORAGE_URL}items/great_ball.png`,
        desc: 'Adiciona +1 no resultado do dado de captura.'
    },
    {
        id: 'ultra_ball',
        name: 'Ultra Ball',
        category: 'capture',
        value: 2,
        icon: '🟡',
        image: `${SUPABASE_STORAGE_URL}items/ultra_ball.png`,
        desc: 'Adiciona +2 no resultado do dado de captura.'
    },
    {
        id: 'master_ball',
        name: 'Master Ball',
        category: 'capture',
        value: 4,
        icon: '🟣',
        image: `${SUPABASE_STORAGE_URL}items/master_ball.png`,
        desc: 'Adiciona +4 no resultado do dado de captura.'
    },
    {
        id: 'ball_mystic',
        name: 'Mystic Ball',
        category: 'capture',
        value: 2,
        aura: 'aura-mystic',
        icon: '🔮',
        image: `${SUPABASE_STORAGE_URL}items/mystic_ball.png`,
        desc: 'Esfera arcana. Adiciona +2 na captura e reveste o Anima com uma Aura Mística roxa permanente.'
    },
    {
        id: 'ball_flame',
        name: 'Flame Ball',
        category: 'capture',
        value: 2,
        aura: 'aura-flame',
        icon: '🔥',
        image: `${SUPABASE_STORAGE_URL}items/flame_ball.png`,
        desc: 'Esfera ígnea. Adiciona +2 na captura e reveste o Anima com uma Aura de Fogo permanente.'
    },
    {
        id: 'ball_aqua',
        name: 'Aqua Ball',
        category: 'capture',
        value: 2,
        aura: 'aura-aqua',
        icon: '💧',
        image: `${SUPABASE_STORAGE_URL}items/aqua_ball.png`,
        desc: 'Esfera hidro. Adiciona +2 na captura e reveste o Anima com uma Aura Aquática permanente.'
    },

    // ==========================================
    // --- ITENS DE EVOLUÇÃO ---
    // ==========================================
    {
        id: 'evolution_stone',
        name: 'Evolution Stone',
        category: 'evolution',
        value: 1,
        icon: '💎',
        image: `${SUPABASE_STORAGE_URL}items/evolution_stone.png`,
        desc: 'Pedra mística capaz de forçar a evolução imediata de um Pokémon compatível na equipa.'
    },

    // ==========================================
    // --- ITENS DE BATALHA ---
    // ==========================================
    {
        id: 'vitamin',
        name: 'Vitamin',
        category: 'battle',
        value: 2,
        icon: '🧪',
        image: `${SUPABASE_STORAGE_URL}items/vitamin.png`,
        desc: 'Aumenta o poder do seu Pokémon em 2 pontos durante uma batalha.'
    },
    {
        id: 'x_attack',
        name: 'X Attack',
        category: 'battle',
        value: 2,
        icon: '⚔️',
        image: `${SUPABASE_STORAGE_URL}items/x_attack.png`,
        desc: 'Aumenta o poder do Pokémon em 2 pontos (durante uma batalha).'
    },
    {
        id: 'potion',
        name: 'Potion',
        category: 'battle',
        categorySub: 'heal',
        value: 20,
        icon: '💊',
        image: `${SUPABASE_STORAGE_URL}items/potion.png`,
        desc: 'Restaura 20 de HP de um Anima ou pode ser usado para reviver/curar após embates.'
    }
];

// Funções utilitárias para manipulação de itens no inventário e loja
function getItemDetails(itemId) {
    return ITEM_CATALOG.find(item => item.id === itemId) || null;
}

function renderInventoryUI(player) {
    const container = document.getElementById('bottom-dynamic-container');
    if (!container) return;

    container.innerHTML = '';
    const inventory = player.inventory || [];

    if (inventory.length === 0) {
        container.innerHTML = '<p class="text-[10px] text-slate-400 col-span-4 text-center py-4">A sua mochila está vazia.</p>';
        return;
    }

    inventory.forEach((itemEntry, index) => {
        const itemInfo = getItemDetails(itemEntry.id || itemEntry);
        if (!itemInfo) return;

        const countText = itemEntry.count !== undefined ? ` (${itemEntry.count})` : '';

        container.innerHTML += `
            <div class="bg-black/50 border border-amber-900/60 rounded-lg p-2 flex flex-col items-center justify-between text-center relative group">
                <span class="text-lg">${itemInfo.icon}</span>
                <span class="text-[9px] font-bold text-amber-300 truncate w-full">${itemInfo.name}${countText}</span>
                <button onclick="usePlayerItem('${itemInfo.id}', ${index})" class="mt-1 bg-amber-600 hover:bg-amber-500 text-black px-2 py-0.5 rounded text-[8px] font-black w-full shadow cursor-pointer">Usar</button>
            </div>
        `;
    });
}

function usePlayerItem(itemId, itemIndex) {
    const cp = (typeof getCurrentPlayer === 'function') ? getCurrentPlayer() : gameState.player;
    const itemInfo = getItemDetails(itemId);
    if (!itemInfo) return;

    if (typeof appendAdventureLog === 'function') {
        appendAdventureLog(`🎒 ${cp.name} usou o item ${itemInfo.name}.`);
    }

    if (cp.inventory[itemIndex].count && cp.inventory[itemIndex].count > 1) {
        cp.inventory[itemIndex].count--;
    } else {
        cp.inventory.splice(itemIndex, 1);
    }
    
    if (typeof renderInventoryUI === 'function') {
        renderInventoryUI(cp);
    }
    if (typeof renderBottomPanel === 'function') {
        renderBottomPanel();
    }
}
