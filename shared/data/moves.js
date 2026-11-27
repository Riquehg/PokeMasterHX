// ⚔️ v64: agora cada Pokémon tem 3 golpes (o 3º é sorteado ao nascer; os antigos ganham um 3º fixo pelo uid) e o
// catálogo tem ~580 golpes reais (shared/data/movecat.js, gerado do PokeAPI). Megas ganham o "golpe da Mega" enquanto
// estão na forma Mega. Os ids antigos (fire_q, water_s2…) continuam valendo.
// Golpes — cada Pokémon tinha 2 golpes. Cada INDIVÍDUO sorteia a sua variação ao nascer/ser capturado:
//  1º golpe: golpe rápido do 1º tipo (100%, nunca erra).
//  2º golpe: varia! Golpe forte (140%, erra no 🎲1) ou golpe pesado (170%, erra no 🎲1–2),
//            do 2º tipo, do 1º tipo ou de um tipo de "cobertura" (ex.: Pikachu com Iron Tail).
//            Pokémon de suporte podem vir com o golpe de suporte (cura, fortalecer, intimidar, dreno) ou com um ataque.
// Ex.: dois Pikachu: um com Thunder Shock + Thunderbolt, outro com Thunder Shock + Thunder, outro com Iron Tail.
// Nomes oficiais em inglês (como aparecem nos jogos).
import { getSpecies } from './pokemon.js';
import { MOVE_DATA } from './movedata.js';
import { MOVE_CAT } from './movecat.js';

export const QUICK_POWER = 1.0;
export const STRONG_POWER = 1.4;
export const HEAVY_POWER = 1.7;
export const STAB = 1.2; // golpe do mesmo tipo do Pokémon

// [rápido, forte, pesado] por tipo
const BY_TYPE = {
  normal:   ['Tackle', 'Body Slam', 'Double-Edge'],
  fire:     ['Ember', 'Flamethrower', 'Fire Blast'],
  water:    ['Water Gun', 'Surf', 'Hydro Pump'],
  grass:    ['Razor Leaf', 'Energy Ball', 'Solar Beam'],
  electric: ['Thunder Shock', 'Thunderbolt', 'Thunder'],
  ice:      ['Powder Snow', 'Ice Beam', 'Blizzard'],
  fighting: ['Karate Chop', 'Close Combat', 'Focus Blast'],
  poison:   ['Poison Sting', 'Sludge Bomb', 'Gunk Shot'],
  ground:   ['Mud-Slap', 'Earthquake', 'Drill Run'],
  flying:   ['Gust', 'Air Slash', 'Hurricane'],
  psychic:  ['Confusion', 'Psychic', 'Future Sight'],
  bug:      ['Bug Bite', 'X-Scissor', 'Megahorn'],
  rock:     ['Rock Throw', 'Rock Slide', 'Stone Edge'],
  ghost:    ['Lick', 'Shadow Ball', 'Shadow Force'],
  dragon:   ['Dragon Breath', 'Dragon Pulse', 'Draco Meteor'],
  dark:     ['Bite', 'Crunch', 'Night Daze'],
  steel:    ['Metal Claw', 'Iron Head', 'Iron Tail'],
  fairy:    ['Fairy Wind', 'Moonblast', 'Play Rough']
};

// Golpes extras por tipo (v19): [preciso (120%, nunca erra), forte alternativo (140%, erra no 🎲1), pesado alternativo (170%, erra no 🎲1–2)]
const EXTRA_BY_TYPE = {
  normal:   ['Quick Attack', 'Hyper Fang', 'Giga Impact'],
  fire:     ['Flame Wheel', 'Lava Plume', 'Overheat'],
  water:    ['Aqua Jet', 'Waterfall', 'Hydro Cannon'],
  grass:    ['Magical Leaf', 'Seed Bomb', 'Leaf Storm'],
  electric: ['Spark', 'Wild Charge', 'Zap Cannon'],
  ice:      ['Ice Shard', 'Ice Fang', 'Ice Hammer'],
  fighting: ['Mach Punch', 'Brick Break', 'Dynamic Punch'],
  poison:   ['Poison Jab', 'Cross Poison', 'Belch'],
  ground:   ['Bulldoze', 'Dig', 'Earth Power'],
  flying:   ['Aerial Ace', 'Drill Peck', 'Brave Bird'],
  psychic:  ['Psybeam', 'Zen Headbutt', 'Psystrike'],
  bug:      ['Struggle Bug', 'Signal Beam', 'Bug Buzz'],
  rock:     ['Smack Down', 'Power Gem', 'Head Smash'],
  ghost:    ['Astonish', 'Shadow Claw', 'Phantom Force'],
  dragon:   ['Dragon Tail', 'Dragon Claw', 'Outrage'],
  dark:     ['Snarl', 'Night Slash', 'Foul Play'],
  steel:    ['Bullet Punch', 'Flash Cannon', 'Meteor Mash'],
  fairy:    ['Draining Kiss', 'Dazzling Gleam', 'Fleur Cannon']
};
export const PRECISE_POWER = 1.2;

// Tipos de cobertura que cada tipo pode aprender (variação rara)
const COVERAGE = {
  normal: ['fighting', 'dark'], fire: ['dragon', 'normal'], water: ['ice'], grass: ['poison', 'normal'], electric: ['steel', 'normal'],
  ice: ['water'], fighting: ['rock', 'dark'], poison: ['dark'], ground: ['rock'], flying: ['steel', 'normal'], psychic: ['fairy', 'ghost'],
  bug: ['poison', 'fighting'], rock: ['ground'], ghost: ['dark'], dragon: ['fire', 'flying'], dark: ['ghost', 'fighting'],
  steel: ['rock'], fairy: ['psychic']
};

// Golpes de suporte (por papel)
export const SUPPORT = {
  healer:   { id: 'recover',      name: 'Recover',      kind: 'heal',   type: 'normal', desc: 'Recupera 40% do HP' },
  buffer:   { id: 'swords_dance', name: 'Swords Dance', kind: 'buff',   type: 'normal', desc: 'Ataque +40% (acumula até 2x)' },
  debuffer: { id: 'intimidate',   name: 'Intimidate',   kind: 'debuff', type: 'dark',   desc: 'Ataque do rival −30% (acumula até 2x)' },
  drainer:  { id: 'giga_drain',   name: 'Giga Drain',   kind: 'drain',  type: 'grass',  desc: 'Dano e recupera metade do dano', power: 1.0 }
};
export const ROLE_LABELS = { healer: 'Curandeiro', buffer: 'Fortalecedor', debuffer: 'Intimidador', drainer: 'Drenador' };

// ---------------------------------------------------------------- registro de todos os golpes (id → golpe)
export const MOVES = {};
for (const [type, [q, s, x]] of Object.entries(BY_TYPE)) {
  MOVES[`${type}_q`] = { id: `${type}_q`, name: q, kind: 'dmg', type, power: QUICK_POWER, miss: 0, desc: 'Rápido: nunca erra' };
  MOVES[`${type}_s`] = { id: `${type}_s`, name: s, kind: 'dmg', type, power: STRONG_POWER, miss: 1, risky: true, desc: 'Forte: erra no 🎲1' };
  MOVES[`${type}_x`] = { id: `${type}_x`, name: x, kind: 'dmg', type, power: HEAVY_POWER, miss: 2, risky: true, desc: 'Pesado: erra no 🎲1–2' };
}
for (const [type, [p, s2, x2]] of Object.entries(EXTRA_BY_TYPE)) {
  MOVES[`${type}_p`] = { id: `${type}_p`, name: p, kind: 'dmg', type, power: PRECISE_POWER, miss: 0, desc: 'Preciso: nunca erra' };
  MOVES[`${type}_s2`] = { id: `${type}_s2`, name: s2, kind: 'dmg', type, power: STRONG_POWER, miss: 1, risky: true, desc: 'Forte: erra no 🎲1' };
  MOVES[`${type}_x2`] = { id: `${type}_x2`, name: x2, kind: 'dmg', type, power: HEAVY_POWER, miss: 2, risky: true, desc: 'Pesado: erra no 🎲1–2' };
}
for (const m of Object.values(SUPPORT)) MOVES[m.id] = { ...m, miss: 0 };

// ⚔️ v44 — poder, precisão, prioridade e efeitos REAIS (moves.csv do PokeAPI) em cima da categoria do jogo.
// O poder continua na faixa da categoria (rápido/preciso/forte/pesado) e varia até −15%/+20% conforme o poder oficial.
const tierOf = id => (id.match(/_(q|p|s|x)\d*$/) || [])[1];
const TIER_REF = {};
for (const [id, d] of Object.entries(MOVE_DATA)) { const t = tierOf(id); if (t && d.pw) (TIER_REF[t] ||= []).push(d.pw); }
for (const t in TIER_REF) TIER_REF[t] = TIER_REF[t].reduce((a, b) => a + b, 0) / TIER_REF[t].length;
export const missFromAcc = (acc, nm) => (nm || !acc || acc >= 95 ? 0 : acc >= 85 ? 1 : acc >= 70 ? 2 : 3);
const STATUS_TXT = { burn: 'queimar', freeze: 'congelar', paralysis: 'paralisar', poison: 'envenenar', sleep: 'adormecer' };
for (const [id, d] of Object.entries(MOVE_DATA)) {
  const m = MOVES[id];
  if (!m) continue;
  const t = tierOf(id);
  if (t && d.pw && TIER_REF[t]) m.power = Math.round(m.power * Math.max(0.85, Math.min(1.2, Math.pow(d.pw / TIER_REF[t], 0.6))) * 100) / 100;
  if (m.kind === 'dmg' || m.kind === 'drain') m.miss = missFromAcc(d.acc, d.nm);
  m.real = d; // dados oficiais (para a Pokédex/cards)
  if (d.prio > 0) m.prio = d.prio;
  if (d.st) { m.st = d.st; m.stChance = (d.ch || 10) / 100; }
  if (d.fl) m.flinch = d.fl / 100;
  if (d.rc) m.recoil = d.rc;
  if (d.hc) m.highCrit = true;
  if (d.sd) m.selfDrop = true;
  if (d.rch) m.recharge = true;
  m.risky = m.miss > 0;
  const fx = [];
  if (m.prio) fx.push('⚡ prioridade: ataca primeiro');
  if (m.st) fx.push(`${Math.round(m.stChance * 100)}% de ${STATUS_TXT[m.st]}`);
  if (m.flinch) fx.push(`${Math.round(m.flinch * 100)}% de fazer hesitar`);
  if (m.highCrit) fx.push('crítico no 🎲5 ou 6');
  if (m.recoil) fx.push(`recuo: perde 1/${m.recoil} do dano`);
  if (m.selfDrop) fx.push('depois o próprio ataque cai');
  if (m.recharge) fx.push('precisa descansar na rodada seguinte');
  m.desc = `${m.miss ? `Erra no 🎲${m.miss === 1 ? '1' : `1–${m.miss}`}` : 'Nunca erra'}${fx.length ? ' · ' + fx.join(' · ') : ''}`;
}
// Transformação (Ditto e Mew): vira uma cópia do adversário — tipos, força e golpes — até o fim da batalha
MOVES.transform = { id: 'transform', name: 'Transform', kind: 'transform', type: 'normal', power: 0, miss: 0, desc: 'Vira uma cópia do adversário (tipos, força e golpes) até o fim da batalha' };
/** Quem pode se transformar. */
export const TRANSFORMERS = ['ditto', 'mew'];
export const MAX_FORMS = 3;
MOVES.leech_life = { id: 'leech_life', name: 'Leech Life', kind: 'drain', type: 'bug', power: 1.0, miss: 0, desc: 'Dano e recupera metade do dano' };
MOVES.drain_punch = { id: 'drain_punch', name: 'Drain Punch', kind: 'drain', type: 'fighting', power: 1.0, miss: 0, desc: 'Dano e recupera metade do dano' };

// ---------------------------------------------------------------- ⚔️ v64: catálogo de golpes reais
const TIER_POWER = { q: QUICK_POWER, p: PRECISE_POWER, s: STRONG_POWER, x: HEAVY_POWER };
const TIER_LABEL = { q: 'Rápido', p: 'Preciso', s: 'Forte', x: 'Pesado' };
const TIER_OFFICIAL = { q: 40, p: 65, s: 90, x: 120 }; // poder oficial típico de cada categoria
const slugName = n => n.toLowerCase().replace(/[^a-z0-9]/g, '');
const OLD_NAMES = new Set(Object.values(MOVES).map(m => slugName(m.name)));
const SUP_DESC = { heal: 'Recupera 40% do HP', buff: 'Ataque +40% (acumula até 2x)', debuff: 'Ataque do rival −30% (acumula até 2x)' };
export const OWNED_MOVES = {}; // espécie dona → ids de golpes exclusivos
/** Golpes por tipo e categoria (para sortear e para os TMs). */
export const MOVE_POOL = {};
const addPool = (type, tier, id) => ((MOVE_POOL[type] ||= {})[tier] ||= []).push(id);
for (const [t, ids] of Object.entries({ q: '_q', p: '_p', s: '_s', x: '_x' })) for (const type of Object.keys(BY_TYPE)) {
  addPool(type, t, `${type}${ids}`);
  if (t === 's' || t === 'x') addPool(type, t, `${type}${ids}2`);
}
for (const [ident, name, type, cat, pw, acc, prio, ef, owner] of MOVE_CAT) {
  const id = 'm_' + ident.replace(/-/g, '_');
  if (OLD_NAMES.has(slugName(name))) continue; // já existe com id antigo
  let m;
  if (cat === 'heal' || cat === 'buff' || cat === 'debuff') m = { id, name, kind: cat, type, miss: 0, desc: SUP_DESC[cat] };
  else if (cat === 'status') m = { id, name, kind: 'status', type, power: 0, st: ef.st, miss: 0, acc: acc || 100, desc: `${({ paralysis: 'Paralisa', burn: 'Queima', poison: 'Envenena', sleep: 'Adormece', freeze: 'Congela' })[ef.st] || 'Condição'} o rival (${acc || 100}% de acerto)` };
  else {
    const tier = cat === 'drain' ? (pw <= 50 ? 'q' : pw <= 75 ? 'p' : 's') : cat;
    const base = cat === 'drain' ? 1.0 : TIER_POWER[tier];
    const power = Math.round(base * Math.max(0.85, Math.min(1.2, Math.pow(pw / TIER_OFFICIAL[tier], 0.6))) * 100) / 100;
    m = { id, name, kind: cat === 'drain' ? 'drain' : 'dmg', type, power, miss: missFromAcc(acc, ef.nm), tier, real: { pw, acc, prio } };
    if (prio > 0) m.prio = prio;
    if (ef.st) { m.st = ef.st; m.stChance = (ef.ch || 10) / 100; }
    if (ef.fl) m.flinch = ef.fl / 100;
    if (ef.rc) m.recoil = ef.rc;
    if (ef.hc) m.highCrit = true;
    if (ef.sd) m.selfDrop = true;
    if (ef.rch) m.recharge = true;
    m.risky = m.miss > 0;
    const fx = [];
    if (m.kind === 'drain') fx.push('recupera metade do dano');
    if (m.prio) fx.push('⚡ prioridade: ataca primeiro');
    if (m.st) fx.push(`${Math.round(m.stChance * 100)}% de ${STATUS_TXT[m.st]}`);
    if (m.flinch) fx.push(`${Math.round(m.flinch * 100)}% de fazer hesitar`);
    if (m.highCrit) fx.push('crítico no 🎲5 ou 6');
    if (m.recoil) fx.push(`recuo: perde 1/${m.recoil} do dano`);
    if (m.selfDrop) fx.push('depois o próprio ataque cai');
    if (m.recharge) fx.push('precisa descansar na rodada seguinte');
    m.desc = `${TIER_LABEL[tier]} · ${m.miss ? `erra no 🎲${m.miss === 1 ? '1' : `1–${m.miss}`}` : 'nunca erra'}${fx.length ? ' · ' + fx.join(' · ') : ''}`;
    if (!owner && cat !== 'drain') addPool(type, tier, id);
  }
  if (owner) { m.owner = owner; (OWNED_MOVES[owner] ||= []).push(id); }
  MOVES[id] = m;
}

// família evolutiva (para golpes exclusivos: Pichu/Pikachu/Raichu dividem o Volt Tackle)
const rootOf = id => { let s = getSpecies(id), n = 0; while (s?.evolvesFrom && n++ < 5) s = getSpecies(s.evolvesFrom); return s?.id || id; };
const famCache = {};
/** Golpes exclusivos que a espécie (ou a família/forma base) sabe. */
export function ownedMovesFor(speciesId) {
  if (famCache[speciesId]) return famCache[speciesId];
  const sp = getSpecies(speciesId);
  if (!sp) return [];
  const keys = new Set([sp.id, sp.form, sp.megaBase, sp.gmaxOf].filter(Boolean));
  for (const k of [...keys]) keys.add(rootOf(k));
  const out = [];
  for (const [owner, ids] of Object.entries(OWNED_MOVES)) if (keys.has(owner) || keys.has(rootOf(owner))) out.push(...ids);
  return (famCache[speciesId] = out);
}

// hash simples e estável (para o 3º golpe dos Pokémon antigos e o golpe da Mega)
const hashOf = str => { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const pickBy = (arr, h) => arr[h % arr.length];

/** 3º golpe: exclusivo (se tiver), cobertura, suporte do papel ou outro golpe do tipo. `r` = número aleatório [0,1) ou hash. */
function thirdMove(sp, used, rand) {
  const [t1, t2] = sp.types;
  const owned = ownedMovesFor(sp.id).filter(id => !used.has(id) && MOVES[id]);
  const R = k => Math.floor(rand(k) * 1e9);
  if (owned.length && rand(1) < 0.45) return pickBy(owned, R(2));
  if (sp.role && rand(3) < 0.35) { const s = supportFor(sp); if (s && !used.has(s)) return s; }
  const covTypes = [...(COVERAGE[t1] || []), ...(t2 ? COVERAGE[t2] || [] : [])];
  const type = covTypes.length && rand(4) < 0.45 ? pickBy(covTypes, R(5)) : (t2 && rand(6) < 0.5 ? t2 : t1);
  const tier = pickBy(['p', 's', 's', 'x', 'q'], R(7));
  const pool = (MOVE_POOL[type]?.[tier] || MOVE_POOL[t1]?.s || []).filter(id => !used.has(id));
  return pool.length ? pickBy(pool, R(8)) : `${t1}_p`;
}
const hashRand = seed => k => (hashOf(seed + ':' + k) % 1000003) / 1000003;

/** Ids dos 3 golpes de um Pokémon (completa os antigos, que tinham 2). */
export function moveIdsOf(mon) {
  const sp = getSpecies(mon?.sp);
  if (!sp) return [];
  const raw = Array.isArray(mon.moves) && mon.moves.length >= 2 && mon.moves.every(id => MOVES[id]) ? mon.moves.slice(0, 3) : defaultMoveIds(mon.sp);
  if (raw.length >= 3) return raw;
  const used = new Set(raw);
  return [...raw, thirdMove(sp, used, hashRand(`${mon.uid || mon.sp}|${mon.sp}`))];
}

/** 💎 Golpes candidatos da Mega (o 1º que o Pokémon ainda não sabe entra como 4º golpe na forma Mega). */
export function megaMoveFor(speciesId) {
  const sp = getSpecies(speciesId);
  if (!sp?.megaBase) return null;
  const base = getSpecies(sp.megaBase);
  const owned = ownedMovesFor(sp.megaBase).filter(id => MOVES[id]?.kind === 'dmg');
  // o golpe exclusivo mais forte (se o Pokémon já não o sabe, ele aparece; se já sabe, vem o pesado do tipo da Mega)
  const best = owned.sort((a, b) => (MOVES[b].power || 0) - (MOVES[a].power || 0))[0];
  const newType = sp.types.find(t => !(base?.types || []).includes(t)) || sp.types[0];
  const pool = MOVE_POOL[newType]?.x?.length ? MOVE_POOL[newType].x : MOVE_POOL[newType]?.s || [];
  const alt = pool.length ? pickBy(pool, hashOf(speciesId)) : `${newType}_x`;
  return best ? [best, alt] : [alt];
}

function drainFor(sp) {
  return sp.types.includes('grass') ? 'giga_drain' : sp.types.includes('bug') ? 'leech_life' : 'drain_punch';
}
function supportFor(sp) {
  return sp.role === 'drainer' ? drainFor(sp) : SUPPORT[sp.role]?.id;
}

/** Variação padrão da espécie (usada na Pokédex e para Pokémon antigos sem variação salva). */
export function defaultMoveIds(speciesId) {
  const sp = getSpecies(speciesId);
  if (!sp) return [];
  if (speciesId === 'ditto') return ['normal_q', 'transform'];
  const [t1, t2] = sp.types;
  const two = [`${t1}_q`, sp.role ? supportFor(sp) : `${t2 || t1}_s`];
  return [...two, thirdMove(sp, new Set(two), hashRand(speciesId))];
}

/** Sorteia a variação de golpes de um indivíduo. */
export function rollMoveIds(rng, speciesId) {
  const sp = getSpecies(speciesId);
  if (!sp) return [];
  const [t1, t2] = sp.types;
  if (speciesId === 'ditto') return ['normal_q', 'transform'];
  // 1º: golpe rápido do 1º tipo (às vezes um rápido do catálogo)
  const q1 = MOVE_POOL[t1]?.q || [`${t1}_q`];
  const first = rng.chance(0.5) ? `${t1}_q` : rng.pick(q1);
  let second;
  if (speciesId === 'mew' && rng.chance(0.4)) second = 'transform';
  else if (sp.role && rng.chance(0.6)) second = supportFor(sp);
  else {
    let type = t2 && rng.chance(0.7) ? t2 : t1;
    if (rng.chance(0.15)) type = rng.pick(COVERAGE[t1] || [t1]);
    // variações: preciso (20%), forte (45%) ou pesado (35%)
    const r = rng.next();
    const tier = r < 0.2 ? 'p' : r < 0.65 ? 's' : 'x';
    const pool = (MOVE_POOL[type]?.[tier] || [`${type}_${tier}`]).filter(id => id !== first);
    second = rng.pick(pool);
  }
  const used = new Set([first, second]);
  return [first, second, thirdMove(sp, used, () => rng.next())];
}

/** Todas as variações possíveis do 2º golpe (para a Pokédex). */
export function possibleSecondMoves(speciesId) {
  const sp = getSpecies(speciesId);
  if (!sp) return [];
  const [t1, t2] = sp.types;
  if (speciesId === 'ditto') return [MOVES.transform];
  const types = [...new Set([t2, t1, ...(COVERAGE[t1] || [])].filter(Boolean))];
  const ids = [...ownedMovesFor(speciesId), ...types.flatMap(t => ['p', 's', 'x'].flatMap(k => MOVE_POOL[t]?.[k] || []))];
  if (sp.role) ids.unshift(supportFor(sp));
  if (speciesId === 'mew') ids.unshift('transform');
  return [...new Set(ids)].map(id => MOVES[id]).filter(Boolean);
}

/**
 * 💿 TM: golpes que um Pokémon pode aprender no 2º espaço — todos os golpes dos tipos dele,
 * da cobertura dele, o de suporte do papel dele e mais um de cada tipo "vizinho" comum (Normal).
 */
export function tmMovesFor(speciesId) {
  const sp = getSpecies(speciesId);
  if (!sp) return [];
  if (speciesId === 'ditto') return [MOVES.transform];
  const [t1, t2] = sp.types;
  const types = [...new Set([t1, t2, ...(COVERAGE[t1] || []), ...(t2 ? COVERAGE[t2] || [] : []), 'normal'].filter(Boolean))];
  // v64: todos os golpes do catálogo desses tipos (rápidos só dos tipos dele) + os exclusivos da família + suportes
  const ids = [...ownedMovesFor(speciesId)];
  for (const t of types) for (const k of ['q', 'p', 's', 'x']) if (k !== 'q' || t === t1 || t === t2) ids.push(...(MOVE_POOL[t]?.[k] || []));
  if (sp.role) ids.unshift(supportFor(sp));
  for (const m of Object.values(MOVES)) if (m.id.startsWith('m_') && !m.owner && (m.kind === 'heal' || m.kind === 'buff' || m.kind === 'debuff' || m.kind === 'status' || m.kind === 'drain') && sp.types.includes(m.type)) ids.push(m.id);
  if (speciesId === 'mew') ids.unshift('transform');
  return [...new Set(ids)].map(id => MOVES[id]).filter(Boolean);
}

const cache = {};
/** Golpes padrão da espécie. */
export function movesOf(speciesId) {
  return (cache[speciesId] ||= defaultMoveIds(speciesId).map(id => MOVES[id]).filter(Boolean));
}

/** Golpes de um Pokémon específico (os 3 dele; na forma Mega, + o golpe da Mega). */
export function monMoves(mon) {
  if (!mon) return [];
  if (mon.sp === 'ditto' && !mon.tf) return [MOVES.normal_q, MOVES.transform]; // Ditto sempre sabe se transformar
  const ids = moveIdsOf(mon);
  const sp = getSpecies(mon.sp);
  const t1 = sp?.types[0];
  // o 1º golpe acompanha o tipo da espécie atual (muda se evoluir para outro tipo)
  const first = MOVES[ids[0]] && sp?.types.includes(MOVES[ids[0]].type) ? MOVES[ids[0]] : MOVES[`${t1}_q`] || MOVES[ids[0]];
  const list = [first, ...ids.slice(1).map(id => MOVES[id])].filter(Boolean);
  if (sp?.megaBase) { const mm = (megaMoveFor(mon.sp) || []).find(id => MOVES[id] && !list.some(m => m.id === id)); if (mm) list.push({ ...MOVES[mm], mega: true }); }
  return list;
}

/** Aprender um golpe (TM) no lugar do 2º ou 3º (slot 1 ou 2). Devolve a nova lista de ids. */
export function learnMoveIds(mon, moveId, slot = 2) {
  const ids = moveIdsOf(mon).slice(0, 3);
  const i = slot === 1 ? 1 : 2;
  ids[i] = moveId;
  return ids;
}
