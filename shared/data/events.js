// Cartas de Evento das casas "?". Cada carta tem um pouco de história (lore) e um efeito.
// {name} vira o nome do jogador. O efeito é aplicado em shared/engine.js (boardEvent).
// weight: peso do sorteio; minTier: a partir de que tier de casa a carta aparece.
// As cartas comuns valem para as casas Rosa→Vermelha (tiers 1–4). As casas Amarelas (tier 5)
// usam só as cartas ESPECIAIS (tiers: [5]). Raids lendárias aparecem nas casas Azuis e Vermelhas.

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
  ] },

  // ---------------- RAID (casas Azuis e Vermelhas)
  { id: 'raid', title: 'RAID LENDÁRIA', icon: '🔥', tone: 'battle', weight: 5, tiers: [3, 4], lore: [
    'O chão treme e o céu escurece. Um Pokémon lendário enfurecido bloqueia o caminho de {name}!',
    'Uma energia colossal irrompe de uma cratera. É um lendário — e ele não está para brincadeira!',
    'Os Pokémon da região fogem em pânico. No centro da clareira, um lendário encara {name}.'
  ] },

  // ---------------- ESPECIAIS (casas Amarelas)
  { id: 'legend_shrine', title: 'Santuário Lendário', icon: '⛩️', tone: 'battle', weight: 18, tiers: [5], lore: [
    '{name} encontra um santuário esquecido. Ao tocar o altar, um lendário desperta para testar seu valor!',
    'Runas antigas brilham ao redor de {name}. O guardião do santuário surge — vença-o e ele poderá te seguir.'
  ] },
  { id: 'master_trainer', title: 'Ás da Liga', icon: '🎖️', tone: 'battle', weight: 18, tiers: [5], lore: [
    'Um treinador de capa vermelha desafia {name}: "Só os melhores chegam até aqui. Mostre do que é capaz!"',
    'Um ex-campeão aposentado quer testar a próxima geração. O prêmio é enorme.'
  ] },
  { id: 'star_shower', title: 'Chuva de Estrelas', icon: '🌠', tone: 'battle', weight: 14, tiers: [5], lore: [
    'Estrelas cadentes riscam o céu e uma delas cai bem ao lado de {name}... um Pokémon brilhante surge da luz!',
    'Na noite mais clara do ano, um Pokémon forte aparece atraído pelo brilho das estrelas... será que ele brilha?'
  ] },
  { id: 'league_treasure', title: 'Tesouro da Liga', icon: '👑', tone: 'good', weight: 16, tiers: [5], lore: [
    'Um baú dourado com o selo da Liga Pokémon está escondido entre as rochas. {name} abre com cuidado...',
    'O presidente da Liga deixa um presente para os treinadores que chegam tão longe.'
  ] },
  { id: 'mew_blessing', title: 'Bênção de Mew', icon: '💗', tone: 'good', weight: 16, tiers: [5], lore: [
    'Uma bolha rosa flutua até a equipe de {name}. Mew dá uma risadinha e todos se sentem renovados!',
    'Um brilho rosado envolve os Pokémon de {name}: feridas curadas e uma força nova.'
  ] },
  { id: 'travel_invite', title: 'Convite de Viagem', icon: '🗺️', tone: 'good', weight: 9, minTier: 1, lore: [
    'Um Pidgey traz uma carta com selo dourado: uma cidade quer receber {name} como convidado de honra!',
    'O prefeito de uma cidade distante ouviu falar de {name} e mandou um convite com prêmio para quem chegar logo.'
  ] },
  { id: 'ancient_egg', title: 'Ovo Ancestral', icon: '🥚', tone: 'good', weight: 12, tiers: [5], lore: [
    'Preso no âmbar há milênios, um ovo começa a pulsar nas mãos de {name}...',
    'Um fóssil se parte e revela um ovo intacto. Ele choca na hora!'
  ] }
];

/** Cartas válidas para uma casa de evento do tier informado. */
export function cardsForTier(tier) {
  return EVENT_CARDS.filter(c => (c.tiers ? c.tiers.includes(tier) : tier >= c.minTier && tier < 5));
}
