// Companheiros: NPCs que acompanham o seu treinador e dão um bônus.
// 💞 Laço (bond): jogar com o mesmo companheiro dá pontos de laço (Nv. 1 a 10). O bônus passivo cresce com o nível
// (o valor em `bonus` abaixo é só o "tipo" do bônus — a força vem de scaledBonus). No Nv. 10 ele vira ÍNTIMO ❤️
// e pode entrar na batalha de vez em quando com o Pokémon dele (golpe, cura, buff, debuff ou condição).
// Ganhos completando missões; ficam salvos na conta e você escolhe qual levar.
// sprite: caminho no bucket "sprites" (pasta/arquivo). Os líderes de Kanto usam os arquivos que já existem em leaders/.
export const COMPANIONS = {
  misty:   { name: 'Misty',      sprite: 'leaders/misty.png',      icon: '💧', bonus: { types: ['water'], dmg: 0.15 },               desc: '+15% de dano em golpes de Água', mon: 'starmie', assist: { kind: 'dmg', type: 'water', move: 'Hidro Bomba' } },
  brock:   { name: 'Brock',      sprite: 'leaders/Brock.png',      icon: '🪨', bonus: { types: ['rock', 'ground'], dmg: 0.15 },      desc: '+15% de dano em golpes de Pedra e Terra', mon: 'onix', assist: { kind: 'dmg', type: 'rock', move: 'Deslizamento de Pedras' } },
  surge:   { name: 'Lt. Surge',  sprite: 'leaders/Lt. Surge.png',  icon: '⚡', bonus: { types: ['electric'], dmg: 0.15, inflict: 'electric' }, desc: '+15% em golpes Elétricos e mais chance de paralisar', mon: 'raichu', assist: { kind: 'status', type: 'electric', move: 'Choque do Trovão' } },
  erika:   { name: 'Erika',      sprite: 'leaders/Erika.png',      icon: '🌿', bonus: { types: ['grass'], dmg: 0.15 },               desc: '+15% de dano em golpes de Planta', mon: 'vileplume', assist: { kind: 'heal', type: 'grass', move: 'Dreno Gigante' } },
  koga:    { name: 'Koga',       sprite: 'leaders/Koga.png',       icon: '☠️', bonus: { types: ['poison'], dmg: 0.15, inflict: 'poison' }, desc: '+15% em golpes de Veneno e mais chance de envenenar', mon: 'weezing', assist: { kind: 'status', type: 'poison', move: 'Tóxico' } },
  blaine:  { name: 'Blaine',     sprite: 'leaders/Blaine.png',     icon: '🔥', bonus: { types: ['fire'], dmg: 0.15, inflict: 'fire' }, desc: '+15% em golpes de Fogo e mais chance de queimar', mon: 'arcanine', assist: { kind: 'status', type: 'fire', move: 'Lança-Chamas' } },
  sabrina: { name: 'Sabrina',    sprite: 'companions/sabrina.png', icon: '🔮', bonus: { types: ['psychic'], dmg: 0.15 },             desc: '+15% de dano em golpes Psíquicos', mon: 'alakazam', assist: { kind: 'debuff', type: 'psychic', move: 'Psíquico' } },
  lorelei: { name: 'Lorelei',    sprite: 'leaders/lorelei.png',    icon: '❄️', bonus: { types: ['ice'], dmg: 0.15, inflict: 'ice' }, desc: '+15% em golpes de Gelo e mais chance de congelar', mon: 'lapras', assist: { kind: 'status', type: 'ice', move: 'Raio de Gelo' } },
  bruno:   { name: 'Bruno',      sprite: 'leaders/bruno.png',      icon: '🥊', bonus: { types: ['fighting'], dmg: 0.15 },            desc: '+15% de dano em golpes de Luta', mon: 'machamp', assist: { kind: 'dmg', type: 'fighting', move: 'Soco Dinâmico' } },
  agatha:  { name: 'Agatha',     sprite: 'leaders/agatha.png',     icon: '👻', bonus: { types: ['ghost'], dmg: 0.15 },               desc: '+15% de dano em golpes Fantasma', mon: 'gengar', assist: { kind: 'debuff', type: 'ghost', move: 'Bola Sombria' } },
  lance:   { name: 'Lance',      sprite: 'leaders/lance.png',      icon: '🐉', bonus: { types: ['dragon'], dmg: 0.15 },              desc: '+15% de dano em golpes de Dragão', mon: 'dragonite', assist: { kind: 'dmg', type: 'dragon', move: 'Hiper-Raio do Dragão' } },
  bugsy:   { name: 'Bugsy',      sprite: 'companions/bugsy.png',   icon: '🐛', bonus: { types: ['bug'], dmg: 0.15 },                 desc: '+15% de dano em golpes de Inseto', mon: 'scyther', assist: { kind: 'dmg', type: 'bug', move: 'Tesoura X' } },
  falkner: { name: 'Falkner',    sprite: 'companions/falkner.png', icon: '🪶', bonus: { types: ['flying'], dmg: 0.15 },              desc: '+15% de dano em golpes Voadores', mon: 'pidgeot', assist: { kind: 'dmg', type: 'flying', move: 'Ataque de Asa' } },
  whitney: { name: 'Whitney',    sprite: 'companions/whitney.png', icon: '⭐', bonus: { types: ['normal'], dmg: 0.15 },              desc: '+15% de dano em golpes Normais', mon: 'miltank', assist: { kind: 'heal', type: 'normal', move: 'Leite Restaurador' } },
  jasmine: { name: 'Jasmine',    sprite: 'companions/jasmine.png', icon: '⚙️', bonus: { types: ['steel'], dmg: 0.15 },               desc: '+15% de dano em golpes de Aço', mon: 'steelix', assist: { kind: 'buff', type: 'steel', move: 'Defesa de Ferro' } },
  karen:   { name: 'Karen',      sprite: 'companions/karen.png',   icon: '🌑', bonus: { types: ['dark'], dmg: 0.15 },                desc: '+15% de dano em golpes Sombrios', mon: 'umbreon', assist: { kind: 'debuff', type: 'dark', move: 'Olhar Assustador' } },
  valerie: { name: 'Valerie',    sprite: 'companions/valerie.png', icon: '🧚', bonus: { types: ['fairy'], dmg: 0.15 },               desc: '+15% de dano em golpes de Fada', mon: 'sylveon', assist: { kind: 'heal', type: 'fairy', move: 'Brilho Encantado' } },
  oak:     { name: 'Prof. Oak',  sprite: 'companions/oak.png',     icon: '🎓', bonus: { xp: 1.25 },                                  desc: '+25% de XP para a equipe', mon: 'eevee', assist: { kind: 'buff', type: 'normal', move: 'Lição do Professor' } },
  joy:     { name: 'Enfermeira Joy', sprite: 'companions/joy.png', icon: '💗', bonus: { potion: 1.5 },                               desc: 'Poções curam 50% a mais', mon: 'chansey', assist: { kind: 'heal', type: 'normal', move: 'Ovo Curativo' } },
  rocket:  { name: 'Jessie & James', sprite: 'trainers/rocket.png', icon: '🚀', bonus: { gold: 1.2 },                                desc: '+20% de ouro nas vitórias', mon: 'meowth', assist: { kind: 'debuff', type: 'dark', move: 'Dia de Pagamento' } },
  // 🗺️ v60: companheiros das regiões (missão "Capture Pokémon de tier 3+" de cada mapa)
  elaine:  { name: 'Elaine',     sprite: 'skins/elaine.png',       icon: '🦊', bonus: { types: ['normal', 'fairy'], dmg: 0.15 },     desc: '+15% de dano em golpes Normais e de Fada', mon: 'eevee', assist: { kind: 'heal', type: 'fairy', move: 'Desejo' } },
  leon:    { name: 'Leon',       sprite: 'skins/leon.png',         icon: '🏆', bonus: { types: ['fire', 'dragon'], dmg: 0.15 },      desc: '+15% de dano em golpes de Fogo e Dragão', mon: 'charizard', assist: { kind: 'dmg', type: 'fire', move: 'Lança-Chamas' } },
  brendan: { name: 'Brendan',    sprite: 'skins/brendan-masters2.png', icon: '🌊', bonus: { types: ['water', 'ground'], dmg: 0.15 }, desc: '+15% de dano em golpes de Água e Terra', mon: 'swampert', assist: { kind: 'dmg', type: 'water', move: 'Surfar' } },
  adaman:  { name: 'Adaman',     sprite: 'skins/adaman.png',       icon: '🍃', bonus: { types: ['grass', 'ground'], dmg: 0.15 },     desc: '+15% de dano em golpes de Planta e Terra', mon: 'leafeon', assist: { kind: 'buff', type: 'grass', move: 'Dança das Espadas' } },
  cynthia: { name: 'Cynthia',    sprite: 'skins/cynthia-masters.png', icon: '🐲', bonus: { types: ['dragon', 'ground'], dmg: 0.15 }, desc: '+15% de dano em golpes de Dragão e Terra', mon: 'garchomp', assist: { kind: 'dmg', type: 'dragon', move: 'Garra do Dragão' } },
  acerola: { name: 'Acerola',    sprite: 'skins/acerola-masters.png', icon: '🎃', bonus: { types: ['ghost', 'fairy'], dmg: 0.15 }, desc: '+15% de dano em golpes Fantasma e de Fada', mon: 'mimikyu', assist: { kind: 'debuff', type: 'ghost', move: 'Sombra Furtiva' } }
};

/** Companheiro temático de cada tipo (prêmio das missões de tipo). */
export const COMPANION_BY_TYPE = {
  water: 'misty', rock: 'brock', ground: 'brock', electric: 'surge', grass: 'erika', poison: 'koga', fire: 'blaine', psychic: 'sabrina',
  ice: 'lorelei', fighting: 'bruno', ghost: 'agatha', dragon: 'lance', bug: 'bugsy', flying: 'falkner', normal: 'whitney', steel: 'jasmine',
  dark: 'karen', fairy: 'valerie'
};

/** 🗺️ v60: companheiro de cada mapa (prêmio da missão de captura de tier 3+). */
export const REGION_COMPANION = { kanto: 'elaine', expedicao: 'leon', arquipelago: 'brendan', vulcanica: 'adaman', glacial: 'cynthia', floresta: 'acerola' };
/** ❤️ Ajuda na batalha: a partir do Laço Nv.5 (rara e 1 vez por batalha); no Nv.10 (íntimo) 12% por rodada, até 2 vezes. */
export const assistChance = lvl => (lvl >= BOND_MAX ? ASSIST_CHANCE : lvl >= 5 ? +(0.03 + 0.01 * (lvl - 5)).toFixed(2) : 0);
export const assistMax = lvl => (lvl >= BOND_MAX ? ASSIST_MAX : lvl >= 5 ? 1 : 0);

export const getCompanion = id => (id && COMPANIONS[id]) || null;

// ------------------------------------------------------------------ 💞 Laço
export const BOND_MAX = 10;
/** Pontos de laço acumulados para chegar em cada nível (índice = nível). */
export const BOND_XP = [0, 0, 40, 100, 180, 280, 400, 550, 730, 950, 1200];
export const ASSIST_CHANCE = 0.12;      // chance por rodada do companheiro íntimo ajudar
export const ASSIST_MAX = 2;            // no máximo 2 vezes por batalha

export function bondLevel(points = 0) {
  let l = 1;
  for (let i = 2; i <= BOND_MAX; i++) if (points >= BOND_XP[i]) l = i;
  return l;
}
export const isIntimate = lvl => (lvl | 0) >= BOND_MAX;

/** Progresso para o próximo nível: { lvl, cur, need, pct }. */
export function bondProgress(points = 0) {
  const lvl = bondLevel(points);
  if (lvl >= BOND_MAX) return { lvl, cur: points, need: BOND_XP[BOND_MAX], pct: 100, max: true };
  const a = BOND_XP[lvl], b = BOND_XP[lvl + 1];
  return { lvl, cur: points - a, need: b - a, pct: Math.round(((points - a) / (b - a)) * 100), max: false };
}

/**
 * Bônus real pelo nível de laço (reformulado para não ficar forte demais no máximo):
 *  dano no tipo: 4% (Nv.1) → 13% (Nv.10) · chance extra de condição: 4% → 9% · XP: +5% → +14%
 *  poções: +10% → +37% · ouro: +5% → +14%
 */
export function scaledBonus(id, lvl = 1) {
  const c = getCompanion(id);
  if (!c) return null;
  const L = Math.max(1, Math.min(BOND_MAX, lvl | 0)) - 1;
  const b = c.bonus, out = {};
  if (b.types) { out.types = b.types; out.dmg = +(0.04 + 0.01 * L).toFixed(3); }
  if (b.inflict) { out.inflict = b.inflict; out.inflictChance = +(0.04 + 0.0055 * L).toFixed(3); }
  if (b.xp) out.xp = +(1.05 + 0.01 * L).toFixed(3);
  if (b.potion) out.potion = +(1.1 + 0.03 * L).toFixed(3);
  if (b.gold) out.gold = +(1.05 + 0.01 * L).toFixed(3);
  return out;
}

const TL = { water: 'Água', rock: 'Pedra', ground: 'Terra', electric: 'Elétrico', grass: 'Planta', poison: 'Veneno', fire: 'Fogo', psychic: 'Psíquico',
  ice: 'Gelo', fighting: 'Luta', ghost: 'Fantasma', dragon: 'Dragão', bug: 'Inseto', flying: 'Voador', normal: 'Normal', steel: 'Aço', dark: 'Sombrio', fairy: 'Fada' };
const ST = { electric: 'paralisar', poison: 'envenenar', fire: 'queimar', ice: 'congelar' };
const pct = x => Math.round(x * 100);

/** Texto do bônus no nível. */
export function bonusText(id, lvl = 1) {
  const b = scaledBonus(id, lvl);
  if (!b) return '';
  const parts = [];
  if (b.types) parts.push(`+${pct(b.dmg)}% de dano em golpes de ${b.types.map(t => TL[t]).join(' e ')}`);
  if (b.inflict) parts.push(`+${pct(b.inflictChance)}% de chance de ${ST[b.inflict] || 'causar condição'}`);
  if (b.xp) parts.push(`+${pct(b.xp - 1)}% de XP para a equipe`);
  if (b.potion) parts.push(`poções curam ${pct(b.potion - 1)}% a mais`);
  if (b.gold) parts.push(`+${pct(b.gold - 1)}% de ouro nas vitórias`);
  return parts.join(' · ');
}

const ASSIST_TXT = {
  dmg: 'ataca o adversário', heal: 'cura o seu Pokémon', buff: 'aumenta o Ataque do seu Pokémon', debuff: 'diminui o Ataque do adversário', status: 'causa uma condição no adversário'
};
export function assistText(id) {
  const c = getCompanion(id);
  return c?.assist ? `❤️ Íntimo: às vezes ${c.name} entra na batalha com ${c.mon[0].toUpperCase() + c.mon.slice(1)} e usa ${c.assist.move} (${ASSIST_TXT[c.assist.kind]}).` : '';
}

/** Pontos de laço ganhos numa partida salva (no fim). */
export function bondGain({ won = false, badges = 0, captures = 0, battlesWon = 0, missions = 0, turns = 0 } = {}) {
  const g = 8 + Math.min(10, captures) + 3 * badges + Math.min(10, battlesWon) + 4 * missions + Math.min(10, Math.floor(turns / 6)) + (won ? 20 : 0);
  return Math.max(5, Math.min(70, g));
}
