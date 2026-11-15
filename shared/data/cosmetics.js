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

export const SHOP_KINDS = {
  ball_style: 'Estilo de captura',
  frame: 'Moldura de treinador',
  title: 'Título'
};

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
    { id: 'title_shiny', kind: 'title', value: 'Caçador de Shiny', name: 'Título: Caçador de Shiny', price: 60, active: true, desc: 'Aparece embaixo do seu nome.' }
  ],
  packages: [
    { id: 'p100', name: 'Punhado de Diamantes', diamonds: 100, bonus: 0, price: 4.9, active: true },
    { id: 'p300', name: 'Saco de Diamantes', diamonds: 300, bonus: 30, price: 12.9, active: true },
    { id: 'p700', name: 'Baú de Diamantes', diamonds: 700, bonus: 100, price: 24.9, active: true },
    { id: 'p1500', name: 'Tesouro de Diamantes', diamonds: 1500, bonus: 300, price: 49.9, active: true }
  ]
};

/** Limpa os cosméticos equipados antes de levar para uma partida. */
export function sanitizeCosmetic(c) {
  if (!c || typeof c !== 'object') return null;
  const out = {};
  if (c.aura && AURA_PRESETS[c.aura]) out.aura = c.aura;
  if (c.frame && FRAME_PRESETS[c.frame]) out.frame = c.frame;
  if (c.title) out.title = String(c.title).replace(/[<>"'`]/g, '').slice(0, 30);
  return Object.keys(out).length ? out : null;
}
