// --- BASE DE DADOS OFICIAL: SUPER EVENTOS (HEX Edition) ---
// Ativados nas casas '!' amarelas (Indigo Plateau e raros).

const SUPER_EVENT_CATALOG = [
    {
        id: 'aqua_operation',
        name: 'Aqua Operation',
        type: 'items',
        desc: 'Oponentes descartam 1 item. Você pode olhar os descartados e puxar até 3 itens combinados entre eles e a pilha[cite: 32].'
    },
    {
        id: 'boosted_pokenav',
        name: 'Boosted PokéNav',
        type: 'trainer',
        desc: 'Compre 4 Cartas de Treinador e force um oponente a descartar o treinador dele[cite: 32].'
    },
    {
        id: 'egg_incubators',
        name: 'Egg Incubators',
        type: 'pokemon',
        desc: 'Ganhe 3 Pokémon Rosa gratuitos da pilha diretamente para a sua equipe[cite: 32].'
    },
    {
        id: 'mythical_encounter',
        name: 'Mythical Encounter',
        type: 'pokemon',
        desc: 'Pegue os próximos 4 Pokémon Amarelos (Lendários) fora do jogo, escolha um deles e tente capturá-lo[cite: 32].'
    },
    {
        id: 'magma_operation',
        name: 'Magma Operation',
        type: 'trainer',
        desc: 'Oponentes descartam seus Cartões de Treinador. Você pode verificar os descartados e trocar o seu com um deles[cite: 32].'
    },
    {
        id: 'missingno',
        name: 'Missingno',
        type: 'mixed',
        desc: 'Compre 2 cartas de item e ganhe um Pokémon Azul gratuito, aleatório e oculto[cite: 32].'
    },
    {
        id: 'arceus_wish',
        name: "Arceus' Wish",
        type: 'multi',
        desc: 'Compre 2 Super Eventos e atribua-os a jogadores diferentes (pode incluir você)[cite: 32].'
    },
    {
        id: 'bills_machine',
        name: "Bill's Machine",
        type: 'pokemon',
        desc: 'Revele um Pokémon Rosa, Verde, Azul e Vermelho no tabuleiro. Você pode tentar capturar dois deles[cite: 32].'
    },
    {
        id: 'fossil_expert',
        name: 'Fossil Expert',
        type: 'pokemon',
        desc: 'Revele os próximos 3 Pokémon Verdes da pilha e escolha dois deles para adicionar à sua equipe de graça[cite: 32].'
    },
    {
        id: 'galactic_operation',
        name: 'Galactic Operation',
        type: 'turns',
        desc: 'Compre 3 itens e escolha: um oponente pula 2 turnos ou dois oponentes pulam 1 turno[cite: 32].'
    },
    {
        id: 'mr_brineys_boat',
        name: "Mr. Briney's Boat",
        type: 'board',
        desc: 'Jogue um turno extra. Até seu próximo turno, ajuste em +1 ou -1 o dado de movimento de todos no seu hexágono[cite: 32].'
    },
    {
        id: 'old_amber',
        name: 'Old Amber',
        type: 'pokemon',
        desc: 'Ganhe um Pokémon Vermelho gratuito diretamente da pilha para sua equipe[cite: 33].'
    },
    {
        id: 'oaks_research',
        name: "Oak's Research",
        type: 'pokemon',
        desc: 'Funciona igual ao evento "Kimono Sisters": escolha cor e tipo para puxar um Pokémon específico[cite: 33].'
    },
    {
        id: 'pokemon_museum',
        name: 'Pokémon Museum',
        type: 'items',
        desc: 'Compre 4 cartas de item[cite: 33].'
    },
    {
        id: 'super_trade',
        name: 'Trade (Super Event)',
        type: 'trade',
        desc: 'Força uma troca de 1 Pokémon de mesma cor com um oponente (bloqueável por Poké Doll)[cite: 33].'
    },
    {
        id: 'rocket_operation',
        name: 'Rocket Operation',
        type: 'items',
        desc: 'Escolha: roube 1 item de dois jogadores diferentes ou 2 itens de um único jogador (bloqueável por Poké Doll)[cite: 33].'
    }
];