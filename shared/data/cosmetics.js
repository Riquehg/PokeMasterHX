// Cosméticos da Loja de Diamantes. NÃO mudam a força de nada — só a aparência.
// O admin edita a vitrine (nomes, preços, quais itens estão à venda) pelo painel; aqui ficam os
// "estilos" visuais disponíveis (cada um tem um CSS em css/app.css) e a vitrine padrão.

// Estilos de captura: viram a "aura" do Pokémon capturado (brilho na carta e na batalha)
export const AURA_PRESETS = {
  galaxy: 'Galáxia', gold: 'Ouro', sakura: 'Sakura', neon: 'Neon', frost: 'Gelo Eterno', inferno: 'Inferno',
  flame: 'Chama', aqua: 'Aqua', volt: 'Volt', shadow: 'Sombra', mystic: 'Místico', rainbow: 'Arco-íris'
};

// Molduras: contorno do avatar no hub, na lista de jogadores e no peão do tabuleiro
export const FRAME_PRESETS = {
  gold: 'Dourada', rainbow: 'Arco-íris', fire: 'Fogo', ice: 'Gelo', shadow: 'Sombria', neon: 'Neon', leaf: 'Folhas'
};

// Dados: visual do dado na rolagem (todos veem o seu dado)
export const DICE_PRESETS = { gold: 'Dourado', crystal: 'Cristal', fire: 'Fogo', ice: 'Gelo', galaxy: 'Galáxia', pokeball: 'Pokébola' };

// Cenários: fundo da arena nas batalhas que você começa (todos que assistem veem)
export const ARENA_PRESETS = { beach: 'Praia', cave: 'Caverna', snow: 'Neve', volcano: 'Vulcão', league: 'Salão da Liga', night: 'Floresta à noite' };

// Cartão de treinador: fundo da ficha do treinador e do card do perfil
export const CARD_PRESETS = { sunset: 'Pôr do sol em Kanto', ocean: 'Oceano', legend: 'Lenda Dourada', shadow: 'Sombras', sakura: 'Sakura', thunder: 'Tempestade' };

// Efeito de vitória: o que aparece quando você vence batalhas, ginásios, Raids, Copa e a partida
export const VICTORY_PRESETS = { fireworks: 'Fogos de artifício', stars: 'Chuva de estrelas', hearts: 'Corações', pokeballs: 'Chuva de Pokébolas', coins: 'Chuva de ouro', sakura: 'Pétalas' };

// Conveniências (compra única, não equipa): não dão força
export const SERVICE_PRESETS = { vault50: '+50 vagas na Coleção', nickname: 'Apelidos para Pokémon' };
export const VAULT_BONUS = 50;

export const SHOP_KINDS = {
  ball_style: 'Estilo de captura',
  frame: 'Moldura de treinador',
  title: 'Título',
  dice: 'Dado personalizado',
  arena: 'Cenário de batalha',
  card: 'Cartão de treinador',
  victory: 'Efeito de vitória',
  service: 'Conveniência'
};
/** Tipos que se equipam (um por vez). "service" é compra única. */
export const EQUIP_KINDS = ['ball_style', 'frame', 'title', 'dice', 'arena', 'card', 'victory'];
export const PRESETS_BY_KIND = { ball_style: AURA_PRESETS, frame: FRAME_PRESETS, dice: DICE_PRESETS, arena: ARENA_PRESETS, card: CARD_PRESETS, victory: VICTORY_PRESETS, service: SERVICE_PRESETS };

export const DEFAULT_SHOP = {
  items: [
    { id: 'style_galaxy', kind: 'ball_style', value: 'galaxy', name: 'Captura Galáxia', price: 120, active: true, desc: 'Todo Pokémon que você capturar ganha brilho de galáxia.' },
    { id: 'style_gold', kind: 'ball_style', value: 'gold', name: 'Captura Dourada', price: 150, active: true, desc: 'Seus Pokémon capturados brilham em ouro.' },
    { id: 'style_sakura', kind: 'ball_style', value: 'sakura', name: 'Captura Sakura', price: 100, active: true, desc: 'Pétalas de cerejeira nas suas capturas.' },
    { id: 'style_neon', kind: 'ball_style', value: 'neon', name: 'Captura Neon', price: 100, active: true, desc: 'Brilho neon nas suas capturas.' },
    { id: 'frame_gold', kind: 'frame', value: 'gold', name: 'Moldura Dourada', price: 80, active: true, desc: 'Contorno dourado no seu avatar e peão.' },
    { id: 'frame_rainbow', kind: 'frame', value: 'rainbow', name: 'Moldura Arco-íris', price: 120, active: true, desc: 'Contorno animado arco-íris.' },
    { id: 'frame_fire', kind: 'frame', value: 'fire', name: 'Moldura de Fogo', price: 90, active: true, desc: 'Seu peão pega fogo (só no visual).' },
    { id: 'title_master', kind: 'title', value: 'Mestre Pokémon', name: 'Título: Mestre Pokémon', price: 60, active: true, desc: 'Aparece embaixo do seu nome.' },
    { id: 'title_shiny', kind: 'title', value: 'Caçador de Shiny', name: 'Título: Caçador de Shiny', price: 60, active: true, desc: 'Aparece embaixo do seu nome.' },
    { id: 'dice_gold', kind: 'dice', value: 'gold', name: 'Dado Dourado', price: 70, active: true, desc: 'Seu dado vira ouro na rolagem — todos veem.' },
    { id: 'dice_crystal', kind: 'dice', value: 'crystal', name: 'Dado de Cristal', price: 90, active: true, desc: 'Dado transparente que brilha.' },
    { id: 'dice_fire', kind: 'dice', value: 'fire', name: 'Dado de Fogo', price: 90, active: true, desc: 'Dado em chamas.' },
    { id: 'dice_ice', kind: 'dice', value: 'ice', name: 'Dado de Gelo', price: 90, active: true, desc: 'Dado congelado.' },
    { id: 'dice_galaxy', kind: 'dice', value: 'galaxy', name: 'Dado Galáxia', price: 120, active: true, desc: 'Um pedaço do espaço no seu dado.' },
    { id: 'dice_pokeball', kind: 'dice', value: 'pokeball', name: 'Dado Pokébola', price: 100, active: true, desc: 'Vermelho e branco, com o botão no meio.' },
    { id: 'arena_beach', kind: 'arena', value: 'beach', name: 'Cenário: Praia', price: 80, active: true, desc: 'Suas batalhas acontecem na praia.' },
    { id: 'arena_cave', kind: 'arena', value: 'cave', name: 'Cenário: Caverna', price: 80, active: true, desc: 'Batalhas numa caverna de cristais.' },
    { id: 'arena_snow', kind: 'arena', value: 'snow', name: 'Cenário: Neve', price: 80, active: true, desc: 'Batalhas na montanha nevada.' },
    { id: 'arena_volcano', kind: 'arena', value: 'volcano', name: 'Cenário: Vulcão', price: 100, active: true, desc: 'Batalhas na boca do vulcão.' },
    { id: 'arena_night', kind: 'arena', value: 'night', name: 'Cenário: Floresta à noite', price: 80, active: true, desc: 'Batalhas sob a lua.' },
    { id: 'arena_league', kind: 'arena', value: 'league', name: 'Cenário: Salão da Liga', price: 150, active: true, desc: 'Toda batalha parece final de campeonato.' },
    { id: 'card_sunset', kind: 'card', value: 'sunset', name: 'Cartão Pôr do Sol', price: 60, active: true, desc: 'Fundo do seu cartão de treinador.' },
    { id: 'card_ocean', kind: 'card', value: 'ocean', name: 'Cartão Oceano', price: 60, active: true, desc: 'Fundo do seu cartão de treinador.' },
    { id: 'card_sakura', kind: 'card', value: 'sakura', name: 'Cartão Sakura', price: 60, active: true, desc: 'Fundo do seu cartão de treinador.' },
    { id: 'card_thunder', kind: 'card', value: 'thunder', name: 'Cartão Tempestade', price: 80, active: true, desc: 'Raios no seu cartão de treinador.' },
    { id: 'card_shadow', kind: 'card', value: 'shadow', name: 'Cartão Sombras', price: 80, active: true, desc: 'Fundo sombrio e misterioso.' },
    { id: 'card_legend', kind: 'card', value: 'legend', name: 'Cartão Lenda Dourada', price: 150, active: true, desc: 'Cartão dourado animado.' },
    { id: 'win_fireworks', kind: 'victory', value: 'fireworks', name: 'Vitória: Fogos', price: 100, active: true, desc: 'Fogos de artifício quando você vence.' },
    { id: 'win_stars', kind: 'victory', value: 'stars', name: 'Vitória: Estrelas', price: 80, active: true, desc: 'Chuva de estrelas quando você vence.' },
    { id: 'win_hearts', kind: 'victory', value: 'hearts', name: 'Vitória: Corações', price: 60, active: true, desc: 'Corações sobem quando você vence.' },
    { id: 'win_pokeballs', kind: 'victory', value: 'pokeballs', name: 'Vitória: Pokébolas', price: 90, active: true, desc: 'Chuva de Pokébolas quando você vence.' },
    { id: 'win_coins', kind: 'victory', value: 'coins', name: 'Vitória: Chuva de Ouro', price: 90, active: true, desc: 'Moedas caem quando você vence.' },
    { id: 'win_sakura', kind: 'victory', value: 'sakura', name: 'Vitória: Pétalas', price: 70, active: true, desc: 'Pétalas de cerejeira quando você vence.' },
    { id: 'svc_vault50', kind: 'service', value: 'vault50', name: '+50 vagas na Coleção', price: 150, active: true, desc: 'A Coleção passa de 300 para 350 Pokémon. Compra única.' },
    { id: 'svc_nickname', kind: 'service', value: 'nickname', name: 'Apelidos para Pokémon', price: 80, active: true, desc: 'Dê apelidos aos Pokémon da sua Coleção (aparecem nas partidas). Compra única.' }
  ],
  packages: [
    { id: 'p100', name: 'Apoio Treinador', diamonds: 100, bonus: 0, price: 4.9, active: true },
    { id: 'p300', name: 'Apoio Líder de Ginásio', diamonds: 300, bonus: 30, price: 12.9, active: true },
    { id: 'p700', name: 'Apoio Elite dos Quatro', diamonds: 700, bonus: 100, price: 24.9, active: true },
    { id: 'p1500', name: 'Apoio Campeão', diamonds: 1500, bonus: 300, price: 49.9, active: true }
  ]
};

/** Limpa os cosméticos equipados antes de levar para uma partida. */
export function sanitizeCosmetic(c) {
  if (!c || typeof c !== 'object') return null;
  const out = {};
  if (c.aura && AURA_PRESETS[c.aura]) out.aura = c.aura;
  if (c.frame && FRAME_PRESETS[c.frame]) out.frame = c.frame;
  if (c.title) out.title = String(c.title).replace(/[<>"'`]/g, '').slice(0, 30);
  if (c.dice && DICE_PRESETS[c.dice]) out.dice = c.dice;
  if (c.arena && ARENA_PRESETS[c.arena]) out.arena = c.arena;
  if (c.card && CARD_PRESETS[c.card]) out.card = c.card;
  if (c.victory && VICTORY_PRESETS[c.victory]) out.victory = c.victory;
  return Object.keys(out).length ? out : null;
}

/** Apelido seguro (até 12 letras, sem HTML). Vazio = sem apelido. */
export function cleanNick(v) {
  return String(v ?? '').replace(/[<>"'`&\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
}
