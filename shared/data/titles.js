// 🏅 Títulos de conquista: não se compram — se ganham. Cada um tem um efeito animado (classe CSS .tfx-<fx>).
// O jogador equipa 1 título por vez (os da 💎 Loja e os de conquista dividem o mesmo espaço).
// Tudo é calculado a partir do perfil (Pokédex, shinies, troféus, Megas, Fazenda, laço com companheiros).
import { SPECIES_LIST } from './pokemon.js';
import { MEGA_KEYS } from './megas.js';
import { COMPANIONS, bondLevel, BOND_MAX } from './companions.js';

const dexCount = p => (p?.pokedex || []).length;
const DEX_TOTAL = SPECIES_LIST.length;
const shinyCount = p => new Set(p?.stats?.shinyDex || []).size;
const trophies = p => p?.stats?.trophies || [];
const megaUsed = p => (p?.stats?.megaDex?.used || []).length;
const farmLikes = p => p?.stats?.farm?.likes | 0;
const champs = p => p?.stats?.champion | 0;

/** fx: rainbow · gold · silver · sparkle · crown · fire · mega · petals · bond */
export const ACH_TITLES = [
  { id: 'dex_100', text: 'Pesquisador Pokémon', fx: 'silver', icon: '📖', desc: 'Capture 100 espécies diferentes.', prog: p => [dexCount(p), 100] },
  { id: 'dex_300', text: 'Professor de Campo', fx: 'gold', icon: '📖', desc: 'Capture 300 espécies diferentes.', prog: p => [dexCount(p), 300] },
  { id: 'dex_all', text: 'Mestre da Pokédex', fx: 'rainbow', icon: '🌈', desc: 'Complete a Pokédex: capture todas as espécies.', prog: p => [dexCount(p), DEX_TOTAL] },
  { id: 'shiny_10', text: 'Caçador de Brilhos', fx: 'sparkle', icon: '✨', desc: 'Tenha 10 espécies shiny diferentes.', prog: p => [shinyCount(p), 10] },
  { id: 'shiny_50', text: 'Lenda Brilhante', fx: 'sparkle', icon: '🌟', desc: 'Tenha 50 espécies shiny diferentes.', prog: p => [shinyCount(p), 50] },
  { id: 'serie_podium', text: 'Medalhista da Liga', fx: 'silver', icon: '🥈', desc: 'Termine uma temporada da Liga das Séries em 1º ou 2º (qualquer série).', prog: p => [Math.min(1, trophies(p).length), 1] },
  { id: 'serie_champ', text: 'Campeão da Liga', fx: 'crown', icon: '👑', desc: 'Seja campeão da Série A da Liga das Séries.', prog: p => [trophies(p).some(t => t.div === 3 && t.pos === 1) ? 1 : 0, 1] },
  { id: 'board_champ', text: 'Mestre Pokémon', fx: 'fire', icon: '🔥', desc: 'Vença 10 partidas derrotando o Campeão na Arena Final.', prog: p => [champs(p), 10] },
  { id: 'mega_10', text: 'Treinador Mega', fx: 'mega', icon: '💎', desc: 'Registre 10 formas Mega na Pokédex (Mega Evoluindo o seu Pokémon).', prog: p => [megaUsed(p), 10] },
  { id: 'mega_all', text: 'Mega Colecionador', fx: 'mega', icon: '💠', desc: `Registre todas as ${MEGA_KEYS.length} formas Mega.`, prog: p => [megaUsed(p), MEGA_KEYS.length] },
  { id: 'farm_50', text: 'Fazendeiro Querido', fx: 'petals', icon: '🌾', desc: 'Receba 50 curtidas na sua Fazenda.', prog: p => [farmLikes(p), 50] },
  { id: 'farm_200', text: 'Fazenda Lendária', fx: 'petals', icon: '🌻', desc: 'Receba 200 curtidas na sua Fazenda.', prog: p => [farmLikes(p), 200] }
];

// 🤝 um título exclusivo por companheiro, no laço máximo (Nv. 10)
const BOND_TEXT = {
  misty: 'Coração das Águas', brock: 'Rocha Inabalável', surge: 'Relâmpago Vivo', erika: 'Flor do Jardim', koga: 'Sombra Venenosa',
  blaine: 'Chama Eterna', sabrina: 'Mente Psíquica', lorelei: 'Gelo Imortal', bruno: 'Punho de Aço', agatha: 'Alma Assombrada',
  lance: 'Domador de Dragões', bugsy: 'Rei dos Insetos', falkner: 'Asas do Vento', whitney: 'Estrela de Goldenrod', jasmine: 'Farol de Aço',
  karen: 'Noite Sem Fim', valerie: 'Encanto de Fada', oak: 'Pupilo do Professor', joy: 'Anjo do Centro', rocket: 'Prepare-se para Encrenca'
};
const TYPE_COLOR = { water: '#4cb5f0', rock: '#c9a36b', ground: '#d6b06a', electric: '#ffd23f', grass: '#5fd06b', poison: '#b06bd6', fire: '#ff7a3d', psychic: '#ff6bb5',
  ice: '#9ee8ff', fighting: '#e0603a', ghost: '#8a7ad6', dragon: '#7a6bff', bug: '#a6d13b', flying: '#9ab8ff', normal: '#e8d9a8', steel: '#b8c4d6', dark: '#7d6a5a', fairy: '#ffa3d9' };
for (const [id, c] of Object.entries(COMPANIONS)) {
  const t = c.bonus?.types?.[0];
  ACH_TITLES.push({
    id: `bond_${id}`, text: BOND_TEXT[id] || `Parceiro de ${c.name}`, fx: 'bond', color: TYPE_COLOR[t] || '#ffd36b', icon: c.icon, companion: id,
    desc: `Exclusivo: chegue ao laço máximo (Nv. ${BOND_MAX}) com ${c.name}.`,
    prog: p => [bondLevel(p?.stats?.companionBond?.[id] || 0), BOND_MAX]
  });
}
export const TITLE_BY_ID = Object.fromEntries(ACH_TITLES.map(t => [t.id, t]));
export const TITLE_FX = ['rainbow', 'gold', 'silver', 'sparkle', 'crown', 'fire', 'mega', 'petals', 'bond'];

/** Progresso de um título: { cur, need, done } */
export function titleProgress(t, profile) {
  const [cur, need] = t.prog(profile);
  return { cur: Math.min(cur, need), need, done: cur >= need };
}
/** Ids dos títulos de conquista que o perfil já tem. */
export const unlockedTitles = profile => ACH_TITLES.filter(t => titleProgress(t, profile).done).map(t => t.id);
