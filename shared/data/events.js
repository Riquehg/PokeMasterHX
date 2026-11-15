// Cartas de Evento das casas "?". Cada carta tem um pouco de história (lore) e um efeito.
// {name} vira o nome do jogador. O efeito é aplicado em shared/engine.js (boardEvent).
// weight: peso do sorteio; minTier: a partir de que tier de casa a carta aparece.

export const EVENT_CARDS = [
  { id: 'lost_bag', title: 'Bolsa Perdida', icon: '💰', tone: 'good', weight: 14, minTier: 1, lore: [
    'Entre as raízes de uma árvore velha, {name} encontra uma bolsa de couro esquecida por algum viajante apressado.',
    'Um Meowth deixou cair seu tesouro ao fugir de um Growlithe. Sorte de {name}!',
    'Moedas brilham no fundo de um riacho raso. {name} arregaça as mangas e recolhe tudo.'
  ] },
  { id: 'camper_backpack', title: 'Mochila de Campista', icon: '🎒', tone: 'good', weight: 14, minTier: 1, lore: [
    'Um campista simpático divide os suprimentos com {name} em troca de uma boa história de batalha.',
    'Um acampamento abandonado ainda guarda algo útil numa caixa de madeira.',
    'Uma Enfermeira Joy de folga passa de bicicleta e deixa um presente para {name}.'
  ] },
  { id: 'berry_tree', title: 'Árvore de Frutinhas', icon: '🍓', tone: 'good', weight: 8, minTier: 1, lore: [
    'Uma árvore carregada de Oran Berries! A equipe de {name} come até não aguentar mais.',
    'Bulbasaurs selvagens mostram a {name} um pomar escondido. A equipe se recupera totalmente.'
  ] },
  { id: 'route_trainer', title: 'Treinador na Rota', icon: '⚔️', tone: 'battle', weight: 26, minTier: 1, lore: [
    '"Ei! Nossos olhares se cruzaram — isso significa batalha!"',
    'Um treinador bloqueia a ponte: "Ninguém passa sem me vencer!"',
    '"Treinei a semana inteira para este momento. Prepare-se!"'
  ] },
  { id: 'rocket_ambush', title: 'Emboscada da Equipe Rocket', icon: '🦹', tone: 'battle', weight: 7, minTier: 2, lore: [
    '"Prepare-se para encrenca!" "E encrenca em dobro!" A Equipe Rocket quer o ouro de {name}!',
    'Sombras saltam dos arbustos usando o uniforme com um R vermelho. Perder aqui custa caro!'
  ] },
  { id: 'professor_class', title: 'Aula do Professor Carvalho', icon: '👨‍🔬', tone: 'good', weight: 6, minTier: 1, lore: [
    'O Professor Carvalho aparece de bicicleta e dá uma aula rápida sobre vantagens de tipo. Toda a equipe aprende!',
    '"Treinar é conhecer seus Pokémon", diz o Professor, enquanto passa exercícios para a equipe de {name}.'
  ] },
  { id: 'rustling_grass', title: 'Grama Agitada', icon: '🌟', tone: 'battle', weight: 6, minTier: 1, lore: [
    'A grama alta se agita de um jeito diferente... algo raro está escondido ali!',
    'Um brilho estranho entre as folhas chama a atenção de {name}.'
  ] },
  { id: 'pokemon_egg', title: 'Ovo Misterioso', icon: '🥚', tone: 'good', weight: 4, minTier: 1, lore: [
    'Um casal de criadores entrega um ovo a {name}: "Cuide bem dele!" Ele choca na mesma hora!',
    'Num ninho abandonado, um ovo começa a rachar no colo de {name}...'
  ] },
  { id: 'storm', title: 'Tempestade Repentina', icon: '🌧️', tone: 'bad', weight: 4, minTier: 1, lore: [
    'Nuvens negras cobrem o céu e um temporal obriga {name} a se abrigar numa caverna.',
    'Um Zapdos cruza o céu e traz uma tempestade elétrica. Melhor esperar passar...'
  ] },
  { id: 'zubat_swarm', title: 'Nuvem de Zubats', icon: '🦇', tone: 'bad', weight: 4, minTier: 2, lore: [
    'Uma caverna escura e, de repente, centenas de Zubats! A equipe de {name} sai arranhada.',
    'Um enxame de Beedrill zangados persegue {name} pela rota!'
  ] },
  { id: 'toll', title: 'Pedágio do Snorlax', icon: '😴', tone: 'bad', weight: 4, minTier: 1, lore: [
    'Um Snorlax dorme no meio do caminho. O guarda cobra uma taxa para tocar a Poké Flauta.',
    'A ponte está em obras e o encarregado cobra pedágio de todos os treinadores.'
  ] },
  { id: 'meowth_thief', title: 'Meowth Ladrão', icon: '🐱', tone: 'bad', weight: 4, minTier: 1, lore: [
    'Enquanto {name} cochila, um Meowth abre a mochila e sai correndo com algo!',
    '"Meowth, é isso aí!" — e um item some da mochila de {name}.'
  ] },
  { id: 'shortcut', title: 'Atalho Secreto', icon: '🍃', tone: 'good', weight: 4, minTier: 1, lore: [
    'Um Diglett aponta um túnel escondido. {name} pode rolar o dado de novo!',
    'Um Pidgeot amigável oferece carona até a próxima rota. Role outra vez!'
  ] },
  { id: 'lucky_find', title: 'Achado Raro', icon: '💎', tone: 'good', weight: 2, minTier: 3, lore: [
    'Entre os destroços de um laboratório antigo, {name} encontra algo muito valioso.',
    'Um velho colecionador, impressionado com a equipe de {name}, entrega um item raríssimo.'
  ] }
];
