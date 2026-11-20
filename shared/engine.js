// =====================================================================================
// Motor de regras do Pokémon Master Trainer HEX — puro (sem DOM, sem rede).
// Roda igual no navegador (modo local) e no servidor (modo online, autoritativo).
//
//   createMatch(config)                      -> estado inicial
//   applyAction(state, actorId, action, ctx) -> { state, error? }  (não muta o estado recebido)
//
// Todo sorteio usa o RNG cujo estado mora em state.seed — no online quem rola é o servidor.
// =====================================================================================

import { SPECIES, getSpecies, STARTERS } from './data/pokemon.js';
import { SPACE_LIST, getSpace, START_SPACE, useMap, useStateMap, BIOMES, isMapId } from './data/board.js';
import { tickWeather, weatherSpawn, weatherRare } from './rules/weather.js';
import { assistTick, giveTravelQuest, questVisit } from './rules/assist.js';
import { ITEMS, getItem, shopFor, STARTING_ITEMS, STARTING_GOLD, cleanBring } from './data/items.js';
import { MOVES, tmMovesFor, defaultMoveIds } from './data/moves.js';
import {
  GYMS, gymAt, ELITE_FOUR, CHAMPION, ELITE_SPACE, CHAMPION_SPACE, ROUTE_TRAINERS, ROCKET, BADGES_TO_LEAGUE, BADGE_REWARDS, ACE_TRAINERS
} from './data/trainers.js';
import { createRng } from './rules/rng.js';
import { createMon, rollWild, hatchEgg, fullHeal, healMon, maxHpOf, levelUp, evolve, TEAM_SIZE, WILD_LEVELS, gainXp, BASE_SHINY_RATE, setLevel } from './rules/monsters.js';
import { destinations, pathTo } from './rules/movement.js';
import { startBattle, submitChoice, setBattleEndHandler, deliverCapture, sideActive, sideIndexOf } from './rules/battle.js';
import {
  GameError, fail, getPlayer, currentPlayer, log, fx, addItem, takeItem, blackout, speciesName, clone, markCaught, hasUsable, badgesNeeded
} from './rules/helpers.js';
import { speciesByTier } from './data/pokemon.js';
import { cardsForTier } from './data/events.js';
import { proposeTrade, respondTrade } from './rules/trade.js';
import { initMissions, progressMission, playerCompanionBonus } from './rules/missions.js';
import { COMPANIONS } from './data/companions.js';
import { startGroupRaid, startCatchStage, raidWaiting, raidAction, raidBallChance } from './rules/raid.js';
import { sanitizeCosmetic, cleanNick } from './data/cosmetics.js';
import { botAction } from './bots.js';
import { RULE_IDS, setupRules, onRound, knockOut, rulesOf, royaleClash, royaleHealCheck, checkRoyaleEnd, royaleRank, alivePlayers,
  conquestGym, conquestBattleEnd, garrisonAction, conquestVisit, conquestRank, ownerOf } from './rules/modes.js';

export const ENGINE_VERSION = 2;
export const AFK_SECONDS = 90;
export const MAX_PLAYERS = 6;

// ------------------------------------------------------------------ criação
/**
 * config = {
 *   id, mode: 'local'|'online', seed, now,
 *   players: [{ id, name, avatar, isBot, starter, starterLevel? }],
 *   options: { dailyPokemon, turnLimit }
 * }
 */
export function createMatch(config) {
  const rng = createRng(config.seed);
  // mapa: 'kanto' (padrão) ou 'gen' = Expedição, um mapa novo gerado pela semente da partida
  const rulesId = config.kind !== 'duel' && RULE_IDS.includes(config.rules) ? config.rules : 'classic';
  // Battle Royale sempre na Arena Royale (mapa simétrico: todos começam à mesma distância do centro)
  const want = String(config.map || 'kanto');
  const customOk = want.startsWith('custom:') && config.mapData && Array.isArray(config.mapData.spaces);
  const mapId = config.kind === 'duel' ? 'kanto' : rulesId === 'royale' ? 'arena' : want === 'gen' ? `gen:${(rng.state ^ 0x2545f491) >>> 0}`
    : want.startsWith('gen:') || (want.startsWith('theme:') && isMapId(want)) || customOk ? want : 'kanto';
  const mapData = mapId.startsWith('custom:') ? config.mapData : null;
  useMap(mapId, 1, mapData);
  const players = (config.players || []).map((p, i) => newPlayer(rng, { ...p, duel: config.kind === 'duel' }, i));
  if (players.length < 1) fail('A partida precisa de pelo menos 1 jogador.');
  if (players.length > MAX_PLAYERS) fail(`Máximo de ${MAX_PLAYERS} jogadores.`);
  const state = {
    v: ENGINE_VERSION,
    id: config.id || 'local',
    mode: config.mode || 'local',
    status: 'playing',
    map: mapId,
    ...(mapData ? { mapData } : {}),
    rules: rulesId,
    weather: { id: 'clear', until: 3 },
    seed: rng.state,
    turn: 1,
    current: 0,
    phase: 'roll',
    turnStartedAt: config.now || 0,
    afkStrikes: {},
    options: {
      dailyPokemon: config.options?.dailyPokemon && SPECIES[config.options.dailyPokemon] ? config.options.dailyPokemon : null,
      turnLimit: Number(config.options?.turnLimit) || 0,
      trades: config.options?.trades !== false,
      hardcore: config.kind !== 'duel' && !!config.options?.hardcore // perdeu a equipe = eliminado e perde tudo da partida
    },
    players,
    board: {},
    pending: null,
    turnFlags: {},
    battle: null,
    lastBattle: null,
    winner: null,
    log: [],
    fx: [],
    fxSeq: 0
  };
  if (config.kind === 'duel') return startDuel(state, rng, config);
  setupRules(state, rng); // Battle Royale / Conquista
  for (const p of state.players) initMissions(state, p);
  log(state, `🏁 Partida iniciada com ${players.map(p => p.name).join(', ')}. Boa sorte, treinadores!`);
  if (state.options.hardcore) log(state, '☠️ HARDCORE: quem tiver a equipe toda derrotada está fora da partida e perde tudo o que ganhou nela.', 'bad');
  if (state.options.dailyPokemon) log(state, `⭐ Pokémon do Dia: ${speciesName(state.options.dailyPokemon)} (aparece mais, XP em dobro e shiny 1/64).`);
  // Se o primeiro jogador for CPU, já joga
  const r = runBots(state, rng, config.now || 0);
  state.seed = rng.state;
  return r;
}

/**
 * Entrar no meio da partida (online, menos Battle Royale/duelo/competitivo).
 * O novato entra no fim da ordem, na cidade inicial, com o inicial no nível próximo da média da mesa
 * e uma ajuda de ouro e itens para não ficar para trás.
 */
export function addLatePlayer(prevState, cfg, ctx = {}) {
  useStateMap(prevState);
  const state = clone(prevState);
  const rng = createRng(state.seed);
  state.fx = [];
  try {
    if (state.status !== 'playing') fail('A partida já terminou.');
    if (state.kind === 'duel' || state.options.duel) fail('Não dá para entrar no meio de um duelo.');
    if (rulesOf(state) === 'royale') fail('No Battle Royale não dá para entrar no meio da partida.');
    if (state.players.some(p => p.id === String(cfg.id))) fail(state.players.find(p => p.id === String(cfg.id)).kicked ? 'Você foi removido desta partida.' : 'Você já está nesta partida.');
    const active = state.players.filter(p => !p.out && !p.left).length;
    if (active >= Math.min(MAX_PLAYERS, ctx.maxPlayers || MAX_PLAYERS) || state.players.length >= 10) fail('A partida está cheia.');
    const p = newPlayer(rng, cfg, state.players.length);
    const others = state.players.filter(x => !x.out);
    const best = x => Math.max(1, ...x.team.map(m => m.lvl));
    const avgLvl = others.length ? others.reduce((a, x) => a + best(x), 0) / others.length : 5;
    const target = Math.max(5, Math.min(40, Math.round(avgLvl * 0.85)));
    for (const m of p.team) if (m.starter && m.lvl < target) { while (m.lvl < target) levelUp(m); fullHeal(m); }
    const avgGold = others.length ? others.reduce((a, x) => a + x.gold, 0) / others.length : 0;
    p.gold += Math.round(Math.min(3000, avgGold * 0.5));
    addItem(p, 'great_ball', 3);
    addItem(p, 'potion', 2);
    p.lateJoin = state.turn;
    state.players.push(p);
    initMissions(state, p);
    fx(state, { k: 'joined', pid: p.id });
    log(state, `🙋 ${p.name} entrou na partida no turno ${state.turn}! Começa em ${getSpace(p.pos).name} com o inicial no Nv. ${p.team[0].lvl} e uma ajuda de ouro.`, 'event');
  } catch (e) {
    if (e && e.isGameError) return { state: prevState, error: e.message };
    throw e;
  }
  state.seed = rng.state;
  state.fxSeq = (prevState.fxSeq || 0) + 1;
  return { state };
}

export const MAX_BOX = 300;
/** Quanto ouro da conta dá para levar numa partida com time da Coleção. */
export const BRING_GOLD_OPTIONS = [0, 300, 600, 1000, 2000];

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Natureza/IV/golpes fixos para um Pokémon antigo da Coleção (derivados do uid, sempre iguais). */
export function fillTraits(entry) {
  if (!entry || (entry.nature && entry.iv && entry.moves) || !SPECIES[entry.sp]) return entry;
  const m = createMon(createRng(hashStr(String(entry.uid || entry.sp))), entry.sp, Math.max(1, Number(entry.lvl) || 5),
    { nature: entry.nature || undefined, iv: entry.iv || undefined, moves: entry.moves || undefined });
  return { ...entry, nature: m.nature, iv: m.iv, moves: m.moves };
}

function addBrought(items, bring) {
  for (const [id, q] of Object.entries(cleanBring(bring))) items[id] = (items[id] || 0) + q;
  if (items.shiny_charm > 1) items.shiny_charm = 1;
  return items;
}

function newPlayer(rng, cfg, index) {
  const starter = SPECIES[cfg.starter] ? cfg.starter : STARTERS[index % STARTERS.length];
  const starterLevel = Math.max(1, Math.min(cfg.isBot ? 60 : 10, Number(cfg.starterLevel) || 5));
  // Modo Coleção: o jogador traz até 6 Pokémon da conta (mantendo o uid para sincronizar de volta).
  // Para ser justo, vale o tier ATUAL da espécie: Dragonite (T4) precisa de 3 insígnias mesmo se veio de um Dratini.
  const cfgBox = [];
  const fromVault = m => {
      // Pokémon antigos da Coleção (sem natureza/IV/golpes salvos) ganham valores fixos derivados do uid — não dá para "re-sortear"
      const fixed = createRng(hashStr(String(m.uid || m.sp)));
      const mon = createMon(m.nature && m.iv && m.moves ? rng : fixed, m.sp, Math.max(1, Math.min(60, Number(m.lvl) || 5)), { shiny: !!m.shiny, ot: cfg.id, nature: m.nature || undefined, iv: m.iv || undefined, moves: m.moves || undefined, capTier: getSpecies(m.sp).tier });
      mon.brought = true; // veio da Coleção (segue a regra das insígnias como qualquer outro)
      if (m.uid) mon.uid = String(m.uid);
      if (m.aura) mon.aura = m.aura;
      if (m.trust) mon.trust = true; // capturado na Bola da Confiança
      if (m.nick) { const n = cleanNick(m.nick); if (n) mon.nick = n; } // apelido (Loja de Diamantes)
      if (Array.isArray(m.forms)) mon.forms = m.forms.filter(f => f && getSpecies(f.sp)).slice(0, 3).map(f => ({ sp: f.sp, moves: Array.isArray(f.moves) ? f.moves.slice(0, 2) : null })); // 🧬 formas guardadas
      return mon;
  };
  const brought = (Array.isArray(cfg.teamMons) ? cfg.teamMons : []).filter(m => m && SPECIES[m.sp]).slice(0, TEAM_SIZE).map(fromVault);
  // PC com a Coleção inteira (modos em que se leva o time): o resto da Coleção vai para o PC da partida
  const teamUids = new Set(brought.map(m => m.uid));
  for (const m of (Array.isArray(cfg.boxMons) ? cfg.boxMons : []).filter(m => m && SPECIES[m.sp] && !teamUids.has(String(m.uid))).slice(0, MAX_BOX)) {
    cfgBox.push(fromVault(m));
  }
  // Se nenhum Pokémon trazido obedece sem insígnias, o inicial entra junto (senão o jogador não conseguiria lutar)
  const needStarter = !cfg.duel && brought.length && !brought.some(m => badgesNeeded(m) === 0);
  const mon = (!needStarter && brought[0]) || createMon(rng, starter, starterLevel, { shiny: !!cfg.starterShiny, ot: cfg.id, starter: true });
  if (needStarter) {
    brought.unshift(mon);
    if (brought.length > TEAM_SIZE) cfgBox.push(brought.pop());
  }
  const p = {
    id: String(cfg.id || `p${index + 1}`),
    name: String(cfg.name || `Treinador ${index + 1}`).slice(0, 24),
    avatar: Number(cfg.avatar) || ((index % 8) + 1),
    isBot: !!cfg.isBot,
    left: false,
    pos: START_SPACE,
    lastCity: START_SPACE,
    visited: [START_SPACE],
    gold: STARTING_GOLD + BRING_GOLD_OPTIONS.reduce((m, v) => (Number(cfg.bringGold) === v ? v : m), 0), // ouro trazido da conta (modo Coleção)
    broughtGold: BRING_GOLD_OPTIONS.includes(Number(cfg.bringGold)) ? Number(cfg.bringGold) : 0,
    items: addBrought({ ...STARTING_ITEMS }, cfg.bringItems),
    broughtItems: cleanBring(cfg.bringItems), // 🎒 trazidos da Mochila da conta (modo Coleção)
    team: brought.length ? brought : [mon],
    companions: (Array.isArray(cfg.companions) ? cfg.companions : []).filter(id => COMPANIONS[id]),
    companion: COMPANIONS[cfg.companion] ? cfg.companion : null,
    // 💞 nível de laço de cada companheiro (vem da conta; 1 a 10)
    bond: Object.fromEntries(Object.entries(cfg.companionBond && typeof cfg.companionBond === 'object' ? cfg.companionBond : {})
      .filter(([id]) => COMPANIONS[id]).map(([id, l]) => [id, Math.max(1, Math.min(10, Number(l) || 1))])),
    box: cfgBox,
    badges: [],
    eliteStage: 0,
    champion: false,
    seen: [...new Set([...(brought.length ? brought : [mon]), ...cfgBox].map(m => m.sp))],
    caught: [...new Set([...(brought.length ? brought : [mon]), ...cfgBox].map(m => m.sp))],
    shinyCaught: [...new Set([...(brought.length ? brought : [mon]), ...cfgBox].filter(m => m.shiny).map(m => m.sp))],
    shinySeen: [...new Set([...(brought.length ? brought : [mon]), ...cfgBox].filter(m => m.shiny).map(m => m.sp))],
    skip: 0,
    moveBonus: 0,
    stats: { captures: 0, shinies: brought.length ? 0 : (mon.shiny ? 1 : 0), wins: 0, losses: 0, pvpWins: 0, ballsThrown: 0 },
    cosmetic: sanitizeCosmetic(cfg.cosmetic)
  };
  // Pokémon extra (ex.: herdado do Cofre)
  if (cfg.extraMon && SPECIES[cfg.extraMon.sp]) {
    const extra = createMon(rng, cfg.extraMon.sp, Math.min(10, cfg.extraMon.lvl || 5), { shiny: !!cfg.extraMon.shiny, ot: p.id, starter: true });
    p.team.push(extra);
    markCaught(p, extra.sp, !!extra.shiny);
  }
  return p;
}

// ------------------------------------------------------------------ API principal
/** Compara antes/depois e gera um efeito 'evolve' para cada Pokémon que mudou de espécie (para a animação). */
function detectEvolutions(prev, next) {
  const before = new Map();
  for (const p of prev.players) for (const m of [...p.team, ...p.box]) before.set(m.uid, m.sp);
  for (const p of next.players) {
    for (const m of [...p.team, ...p.box]) {
      const old = before.get(m.uid);
      if (old && old !== m.sp) {
        next.fx.push({ k: 'evolve', pid: p.id, uid: m.uid, from: old, to: m.sp, shiny: !!m.shiny });
        markCaught(p, m.sp, !!m.shiny); // a forma evoluída entra na Pokédex
        progressMission(next, p.id, { k: 'evolve' });
      }
    }
  }
}

export function applyAction(prevState, actorId, action, ctx = {}) {
  useStateMap(prevState);
  const state = clone(prevState);
  const rng = createRng(state.seed);
  const now = Number(ctx.now) || 0;
  state.fx = [];
  try {
    if (state.status !== 'playing') fail('A partida já terminou.');
    dispatch(state, rng, String(actorId), action || {}, now);
    endByRules(state);
    runBots(state, rng, now);
    endByRules(state);
    for (const p of state.players) if (p._afkTemp) { delete p._afkTemp; p.isBot = false; }
    checkTurnLimit(state);
  } catch (e) {
    if (e && e.isGameError) return { state: prevState, error: e.message };
    throw e;
  }
  detectEvolutions(prevState, state);
  state.seed = rng.state;
  state.fxSeq = (prevState.fxSeq || 0) + 1;
  return { state };
}

/** Quem precisa agir agora? Retorna lista de ids. Usado pela UI e pelos bots. */
export function whoMustAct(state) {
  if (state.status !== 'playing') return [];
  useStateMap(state);
  if (state.raid) return raidWaiting(state);
  if (state.pending?.kind === 'pvp_invite') return [state.pending.to];
  if (state.pending?.kind === 'garrison') return [state.pending.pid];
  const b = state.battle;
  if (b && !b.over) {
    const ids = [];
    b.sides.forEach((s, i) => {
      if (s.kind !== 'player') return;
      if (b.mustSwitch.some(Boolean)) { if (b.mustSwitch[i]) ids.push(s.pid); return; }
      if (!b.choices[i]) ids.push(s.pid);
    });
    return ids;
  }
  const cp = currentPlayer(state);
  return cp ? [cp.id] : [];
}

// ------------------------------------------------------------------ roteamento
function dispatch(state, rng, actorId, action, now) {
  const actor = getPlayer(state, actorId);
  if (!actor) fail('Você não está nesta partida.');
  const type = action.type;

  // Ações permitidas a qualquer jogador a qualquer momento
  if (type === 'leave') return leave(state, rng, actor, now);
  if (type === 'kicked') return kicked(state, actor);
  if (type === 'skip_afk') return skipAfk(state, rng, actor, now);
  if (type === 'chat') return; // chat não passa pelo motor
  if (type === 'trade_offer') return proposeTrade(state, rng, actor, action);
  if (type === 'set_companion') {
    const id = action.id || null;
    if (id && !(actor.companions || []).includes(id)) fail('Você ainda não tem esse companheiro.');
    actor.companion = id;
    log(state, id ? `${COMPANIONS[id].icon} ${actor.name} agora anda com ${COMPANIONS[id].name}.` : `${actor.name} dispensou o companheiro.`);
    return;
  }
  if (type === 'trade_respond') return respondTrade(state, rng, actor, action);

  // Convite de PvP pendente: só o desafiado responde
  if (state.pending?.kind === 'pvp_invite') {
    if (type !== 'respond') fail('Aguardando resposta ao desafio PvP.');
    return respondInvite(state, rng, actor, !!action.accept, now);
  }

  // Conquista: escolher quem fica defendendo a cidade
  if (state.pending?.kind === 'garrison') {
    if (type !== 'garrison' || actor.id !== state.pending.pid) fail('Aguardando a escolha da guarnição.');
    return garrisonAction(state, actor, action);
  }

  // Raid (solo na fase de captura, ou em grupo)
  if (state.raid) {
    if (type !== 'raid') fail('Aguarde a Raid terminar.');
    return raidAction(state, rng, actor, action);
  }

  // Batalha em andamento
  if (state.battle && !state.battle.over) {
    if (type !== 'battle') fail('Termine a batalha primeiro.');
    submitChoice(state, rng, actor.id, action);
    afterBattleStep(state);
    return;
  }

  // Fora de batalha: só o jogador da vez
  const cp = currentPlayer(state);
  if (!cp || cp.id !== actor.id) fail(`Não é a sua vez — agora é a vez de ${cp ? cp.name : '?'}.`);

  switch (type) {
    case 'roll': return roll(state, rng, actor);
    case 'move': return move(state, rng, actor, Number(action.to));
    case 'end_turn': return endTurn(state, rng, now);
    case 'use_item': return useItem(state, rng, actor, action);
    case 'city': return cityAction(state, rng, actor, action);
    case 'pc': return pcAction(state, actor, action);
    case 'challenge': return challenge(state, rng, actor, action.target, now);
    case 'reorder': return reorderTeam(state, actor, action);
    default: fail('Ação desconhecida.');
  }
}

function afterBattleStep(state) {
  if (state.battle && state.battle.over) {
    state.lastBattle = summarizeBattle(state, state.battle);
    state.battle = null;
  }
}

function summarizeBattle(state, b) {
  return {
    kind: b.kind,
    outcome: b.outcome,
    sides: b.sides.map(s => s.kind === 'player' ? { kind: 'player', pid: s.pid } : { kind: s.kind, name: s.name || 'Selvagem' }),
    log: b.log.slice(-12),
    fxSeq: state.fxSeq + 1
  };
}

// ------------------------------------------------------------------ turno
function roll(state, rng, p) {
  if (state.phase !== 'roll') fail('Você já rolou o dado neste turno.');
  const die = rng.d6();
  const bonus = p.moveBonus || 0;
  p.moveBonus = 0;
  const total = die + bonus;
  const { steps, options } = destinations(p, total);
  fx(state, { k: 'dice', pid: p.id, value: die, bonus });
  if (!options.length) {
    log(state, `🎲 ${p.name} tirou ${die}${bonus ? ` (+${bonus})` : ''}, mas não há caminho livre. Fica onde está.`);
    state.phase = 'action';
    return;
  }
  state.pending = { kind: 'move', roll: die, bonus, steps, options };
  state.phase = 'move';
  log(state, `🎲 ${p.name} tirou ${die}${bonus ? ` +${bonus} (Bicicleta)` : ''}! Escolha o destino (${steps} casa${steps > 1 ? 's' : ''}).`);
}

function move(state, rng, p, to) {
  if (state.phase !== 'move' || state.pending?.kind !== 'move') fail('Role o dado antes de se mover.');
  if (!state.pending.options.includes(to)) fail('Destino inválido para esta rolagem.');
  const path = pathTo(p, to, state.pending.steps);
  state.pending = null;
  const from = p.pos;
  p.pos = to;
  fx(state, { k: 'move', pid: p.id, from, to, path });
  const sp = getSpace(to);
  log(state, `🚶 ${p.name} foi para ${sp.name}.`);
  resolveSpace(state, rng, p, sp);
}

function resolveSpace(state, rng, p, sp) {
  state.phase = 'action';
  if (royaleClash(state, p, sp)) return; // Battle Royale: encontrou outro treinador = batalha
  const hs = (state.hotspots || []).find(h => h.space === sp.id);
  if (hs) return triggerHotspot(state, rng, p, sp, hs);
  if (sp.type === 'city') return visitCity(state, p, sp);
  if (sp.type === 'pokemon') return wildEncounter(state, rng, p, sp, sp.tier);
  if (sp.type === 'event') return boardEvent(state, rng, p, sp);
}

function endTurn(state, rng, now) {
  if (state.phase === 'move') fail('Escolha um destino antes de encerrar o turno.');
  advanceTurn(state, now);
}

function advanceTurn(state, now) {
  state.pending = null;
  state.turnFlags = {};
  for (let guard = 0; guard < state.players.length * 4; guard++) {
    state.current += 1;
    if (state.current >= state.players.length) {
      state.current = 0;
      state.turn += 1;
      tickHotspots(state);
      tickWeather(state, fx, log);
      onRound(state);
      assistTick(state); // Ajuda do Professor e prazos dos convites
      endByRules(state, false);
      if (state.status !== 'playing') return;
    }
    const np = currentPlayer(state);
    if (np.out) continue; // eliminado no Battle Royale
    if (np.skip > 0) {
      np.skip -= 1;
      log(state, `⏸️ ${np.name} perde esta vez.`);
      continue;
    }
    break;
  }
  state.phase = 'roll';
  state.turnStartedAt = now;
  const np = currentPlayer(state);
  log(state, `➡️ Turno ${state.turn}: vez de ${np.name}.`, 'turn');
  fx(state, { k: 'turn', pid: np.id, turn: state.turn });
  checkTurnLimit(state);
}

function checkTurnLimit(state) {
  if (state.status !== 'playing' || !state.options.turnLimit) return;
  if (state.turn > state.options.turnLimit) {
    const r = rulesOf(state);
    if (r === 'conquest') {
      const w = conquestRank(state, score)[0];
      return finishMatch(state, w, `Fim dos ${state.options.turnLimit} turnos — mais cidades dominadas.`);
    }
    if (r === 'royale') {
      const alive = state.players.filter(p => !p.out).sort((a, b) => teamHpPct(b) - teamHpPct(a));
      alive.forEach((p, i) => { p.place = i + 1; });
      return finishMatch(state, alive[0] || royaleRank(state)[0], 'Tempo esgotado — sobrevivente com a equipe mais inteira.');
    }
    const ranked = [...state.players].sort((a, b) => score(b) - score(a));
    finishMatch(state, ranked[0], `Limite de ${state.options.turnLimit} turnos atingido — vitória por pontos.`);
  }
}

const teamHpPct = p => p.team.reduce((a, m) => a + Math.max(0, m.hp), 0) / Math.max(1, p.team.reduce((a, m) => a + maxHpOf(m), 0));

/** Verifica fim de partida pelos modos (Battle Royale). */
/** Fim por eliminações fora do Battle Royale (Hardcore ou jogadores removidos). */
function checkOutEnd(state) {
  if (state.status !== 'playing' || rulesOf(state) === 'royale' || !state.players.some(p => p.out)) return null;
  const alive = alivePlayers(state);
  const humans = alive.filter(p => !p.left && (!p.isBot || p._afkTemp));
  if (state.players.length > 1 && alive.length <= 1) return { winner: alive[0] || null, reason: alive[0] ? 'Último treinador de pé!' : 'Ninguém sobreviveu.' };
  if (!humans.length) return { winner: [...alive].sort((a, b) => score(b) - score(a))[0] || null, reason: 'Não sobrou nenhum treinador humano.' };
  return null;
}

function endByRules(state, advance = true) {
  const end = checkRoyaleEnd(state) || checkOutEnd(state);
  if (end && state.status === 'playing') {
    state.battle = null;
    state.raid = null;
    finishMatch(state, end.winner, end.reason);
    return;
  }
  // eliminado durante a própria vez: passa a vez sozinho
  const cp = currentPlayer(state);
  if (advance && state.status === 'playing' && cp?.out && !state.battle && !state.raid && !state.pending) advanceTurn(state, state.turnStartedAt);
}

export function score(p) {
  const shinies = p.stats.shinies || 0;
  const bestLevels = [...p.team, ...p.box].map(m => m.lvl).sort((a, b) => b - a).slice(0, 6).reduce((a, b) => a + b, 0);
  return p.badges.length * 100 + p.caught.length * 10 + shinies * 50 + p.eliteStage * 100 + (p.champion ? 1000 : 0) + bestLevels;
}

function finishMatch(state, winner, reason) {
  state.status = 'finished';
  state.winner = winner ? winner.id : null;
  state.phase = 'over';
  state.pending = null;
  log(state, `🏆 ${winner ? winner.name : 'Ninguém'} venceu a partida! ${reason || ''}`, 'win');
  fx(state, { k: 'win', pid: state.winner });
}

// ------------------------------------------------------------------ Duelo (Torneio e Copa): só a batalha, sem tabuleiro
export const DUEL_ITEMS = { potion: 2, super_potion: 1, revive: 1 };

function startDuel(state, rng, config) {
  if (state.players.length !== 2) fail('O duelo é sempre 1 contra 1.');
  state.kind = 'duel';
  state.options.trades = false;
  state.options.duel = true;
  state.options.dailyPokemon = null;
  state.phase = 'battle';
  for (const p of state.players) {
    p.noRules = true;            // no duelo todos os Pokémon obedecem (não há insígnias)
    p.items = { ...DUEL_ITEMS }; // kit igual para os dois
    p.box = [];                  // duelo usa só o time
    p.team.forEach(fullHeal);
  }
  const [a, b] = state.players;
  log(state, `⚔️ Duelo: ${a.name} x ${b.name}! Vence quem derrubar todo o time do adversário.`);
  startBattle(state, { kind: 'pvp', pid: a.id, foe: { kind: 'player', pid: b.id } });
  const r = runBots(state, rng, config.now || 0);
  state.seed = rng.state;
  return r;
}

/** Fim de um duelo: vencedor é quem ainda tem Pokémon de pé (empate: quem tem mais HP sobrando). */
function finishDuel(state, outcome) {
  const b = state.battle;
  let wi = outcome.winner;
  if (wi === null || wi === undefined) {
    const hpLeft = si => b.sides[si] && getPlayer(state, b.sides[si].pid).team.reduce((t, m) => t + Math.max(0, m.hp), 0);
    wi = hpLeft(0) >= hpLeft(1) ? 0 : 1;
  }
  const w = getPlayer(state, b.sides[wi].pid);
  const l = getPlayer(state, b.sides[1 - wi].pid);
  w.stats.wins += 1; w.stats.pvpWins += 1; l.stats.losses += 1;
  finishMatch(state, w, outcome.surrender ? `${l.name} desistiu.` : `Derrotou todo o time de ${l.name}.`);
}

// ------------------------------------------------------------------ AFK / saída
function leave(state, rng, p, now) {
  if (p.left) return;
  p.left = true;
  p.isBot = true;
  if (state.options.duel && state.status === 'playing') { // sair do duelo = desistir
    log(state, `🚪 ${p.name} saiu do duelo.`, 'bad');
    finishMatch(state, state.players.find(x => x.id !== p.id), `${p.name} abandonou.`);
    state.battle = null;
    return;
  }
  if (state.options.hardcore) p.hardcoreLost = true; // sair do Hardcore = desistir
  log(state, `🚪 ${p.name} saiu da partida. Uma CPU assumiu o lugar.`, 'bad');
  if (state.players.every(x => x.left || x.isBot) && state.mode === 'online') {
    finishMatch(state, [...state.players].sort((a, b) => score(b) - score(a))[0], 'Todos os humanos saíram.');
  }
}

/** Removido pelo anfitrião: sai da rodada na hora (sem esperar a CPU). Se estava numa batalha, a CPU termina só ela. */
function kicked(state, p) {
  if (p.out && p.left) return;
  p.left = true;
  p.isBot = true;
  p.kicked = true;
  if (state.options.hardcore) p.hardcoreLost = true;
  if (!p.out) { p.out = true; p.place = alivePlayers(state).length + 1; }
  fx(state, { k: 'kicked', pid: p.id });
  log(state, `🚫 ${p.name} foi removido da partida pelo anfitrião.`, 'bad');
}

function skipAfk(state, rng, actor, now) {
  const waiting = whoMustAct(state).map(id => getPlayer(state, id)).filter(x => x && !x.isBot);
  if (!waiting.length) fail('Ninguém está travando a partida.');
  if (waiting.some(w => w.id === actor.id)) fail('Você é quem precisa jogar agora.');
  if (!now || now - (state.turnStartedAt || 0) < AFK_SECONDS * 1000) fail(`Aguarde ${AFK_SECONDS}s de inatividade para pular a vez.`);
  if (state.options.duel) { // no duelo, quem trava perde por W.O.
    const loser = waiting[0];
    log(state, `⏰ ${loser.name} ficou parado e perdeu por W.O.`, 'bad');
    finishMatch(state, state.players.find(x => x.id !== loser.id), `${loser.name} ficou inativo.`);
    state.battle = null;
    return;
  }
  for (const w of waiting) {
    state.afkStrikes[w.id] = (state.afkStrikes[w.id] || 0) + 1;
    log(state, `⏰ ${w.name} ficou inativo e uma CPU jogou por ele${state.afkStrikes[w.id] >= 3 ? ' (de vez, após 3 ausências)' : ''}.`, 'bad');
    w.isBot = true; // a CPU resolve a pendência agora
    if (state.afkStrikes[w.id] < 3) w._afkTemp = true; // volta a ser humano depois
  }
  state.turnStartedAt = now;
}

// ------------------------------------------------------------------ cidades
function visitCity(state, p, sp) {
  p.lastCity = sp.id;
  if (rulesOf(state) === 'conquest') conquestVisit(state, p, sp);
  questVisit(state, createRng((state.seed ^ (sp.id * 2654435761) ^ state.turn) >>> 0), p, sp);
  if (!p.visited.includes(sp.id)) p.visited.push(sp.id);
  const gym = gymAt(sp.id);
  let extra = ' Centro Pokémon e Loja disponíveis.';
  if (gym && !p.badges.includes(gym.id)) extra += ` Ginásio de ${gym.leader} aberto!`;
  if (sp.id === ELITE_SPACE) extra += ' A Elite dos Quatro aguarda.';
  if (sp.id === CHAMPION_SPACE) extra += ' O Campeão aguarda!';
  log(state, `🏙️ ${p.name} chegou em ${sp.name}.${extra}`);
}

function inCity(p) {
  const sp = getSpace(p.pos);
  return sp && sp.type === 'city' ? sp : null;
}

function cityTier(sp) {
  return sp.tier;
}

function cityAction(state, rng, p, a) {
  const sp = inCity(p);
  if (!sp) fail('Você precisa estar numa cidade.');
  if (state.phase === 'move') fail('Escolha o destino primeiro.');

  switch (a.op) {
    case 'heal': {
      royaleHealCheck(state, p, sp);
      [...p.team, ...p.box].forEach(fullHeal);
      log(state, `🏥 Enfermeira Joy curou toda a equipe de ${p.name}.`, 'good');
      return;
    }
    case 'buy': {
      const qty = Math.max(1, Math.min(20, Number(a.qty) || 1));
      const offer = shopFor(cityTier(sp)).find(o => o.id === a.item);
      if (!offer) fail('Esse item não é vendido aqui.');
      if (offer.kind === 'charm' && p.items[a.item]) fail('Você já tem o Amuleto Shiny.');
      const q = offer.kind === 'charm' ? 1 : qty;
      const cost = offer.price * q;
      if (p.gold < cost) fail(`Ouro insuficiente (precisa ${cost}).`);
      p.gold -= cost;
      addItem(p, a.item, q);
      log(state, `🛒 ${p.name} comprou ${q}x ${offer.name} por ${cost} de ouro.`);
      return;
    }
    case 'gym': {
      const gym = gymAt(sp.id);
      if (!gym) fail('Não há ginásio nesta cidade.');
      if (rulesOf(state) === 'royale') fail('No Battle Royale os ginásios estão fechados — sobreviva!');
      if (rulesOf(state) === 'conquest') return conquestGym(state, rng, p, sp, gym);
      if (p.badges.includes(gym.id)) fail('Você já tem esta insígnia.');
      if (state.turnFlags.gym) fail('Só um desafio oficial por turno.');
      state.turnFlags.gym = true;
      startBattle(state, {
        kind: 'gym', pid: p.id, ref: gym.id,
        foe: { kind: 'npc', name: gym.leader, title: 'Líder', sprite: gym.sprite, prize: gym.prize, team: npcTeam(rng, gym.team) }
      });
      state.phase = 'battle';
      return;
    }
    case 'league': {
      if (rulesOf(state) !== 'classic') fail('A Liga não faz parte deste modo de jogo.');
      if (state.turnFlags.gym) fail('Só um desafio oficial por turno.');
      if (p.badges.length < BADGES_TO_LEAGUE) fail(`Precisa de ${BADGES_TO_LEAGUE} insígnias.`);
      if (sp.id === ELITE_SPACE) {
        if (p.eliteStage >= ELITE_FOUR.length) fail('Você já venceu a Elite dos Quatro. Vá até a Arena Final!');
        state.turnFlags.gym = true;
        startEliteBattle(state, rng, p);
        return;
      }
      if (sp.id === CHAMPION_SPACE) {
        if (p.eliteStage < ELITE_FOUR.length) fail('Vença a Elite dos Quatro (Liga Pokémon) primeiro.');
        state.turnFlags.gym = true;
        startBattle(state, {
          kind: 'champion', pid: p.id,
          foe: { kind: 'npc', name: CHAMPION.name, title: CHAMPION.title, sprite: CHAMPION.sprite, prize: CHAMPION.prize, team: npcTeam(rng, CHAMPION.team) }
        });
        state.phase = 'battle';
        return;
      }
      fail('Não há desafio da Liga nesta cidade.');
    }
    default:
      fail('Ação de cidade inválida.');
  }
}

function startEliteBattle(state, rng, p) {
  const e = ELITE_FOUR[p.eliteStage];
  startBattle(state, {
    kind: 'elite', pid: p.id, ref: p.eliteStage,
    foe: { kind: 'npc', name: e.name, title: e.title, sprite: e.sprite, prize: 1000 + p.eliteStage * 250, team: npcTeam(rng, e.team) }
  });
  state.phase = 'battle';
}

function npcTeam(rng, list) {
  return list.map(([sp, lvl]) => createMon(rng, sp, lvl));
}

function pcAction(state, p, a) {
  if (!inCity(p)) fail('O PC só pode ser usado em cidades.');
  const ti = Number(a.team), bi = Number(a.box);
  if (a.op === 'swap') {
    if (!p.team[ti] || !p.box[bi]) fail('Seleção inválida.');
    [p.team[ti], p.box[bi]] = [p.box[bi], p.team[ti]];
    log(state, `💻 ${p.name} trocou ${speciesName(p.box[bi].sp)} por ${speciesName(p.team[ti].sp)} no PC.`);
    return;
  }
  if (a.op === 'deposit') {
    if (!p.team[ti]) fail('Seleção inválida.');
    if (p.team.length <= 1) fail('A equipe precisa de pelo menos 1 Pokémon.');
    const [m] = p.team.splice(ti, 1);
    p.box.push(m);
    log(state, `💻 ${p.name} guardou ${speciesName(m.sp)} no PC.`);
    return;
  }
  if (a.op === 'withdraw') {
    if (!p.box[bi]) fail('Seleção inválida.');
    if (p.team.length >= TEAM_SIZE) fail('A equipe já está cheia (6).');
    const [m] = p.box.splice(bi, 1);
    p.team.push(m);
    log(state, `💻 ${p.name} retirou ${speciesName(m.sp)} do PC.`);
    return;
  }
  if (a.op === 'release') {
    if (!p.box[bi]) fail('Seleção inválida.');
    // Pokémon que veio da Coleção não é solto aqui (voltaria no fim e daria ouro infinito); solte pela Coleção no menu
    if (p.box[bi].brought) fail('Esse Pokémon é da sua Coleção. Para soltar, use a 📦 Coleção no menu inicial.');
    const [m] = p.box.splice(bi, 1);
    (p.releasedUids ||= []).push(m.uid); // sai também da Coleção (se já tinha sido salvo)
    p.gold += 20 * m.lvl;
    log(state, `🌲 ${p.name} soltou ${speciesName(m.sp)} na natureza (+${20 * m.lvl} de ouro do Professor).`);
    return;
  }
  fail('Ação de PC inválida.');
}

function reorderTeam(state, p, a) {
  const i = Number(a.index);
  if (!p.team[i] || i === 0) return;
  const [m] = p.team.splice(i, 1);
  p.team.unshift(m);
}

// ------------------------------------------------------------------ itens fora de batalha
function useItem(state, rng, p, a) {
  const it = getItem(a.item);
  if (!it) fail('Item inválido.');
  if (!(p.items[a.item] > 0)) fail('Você não tem esse item.');
  if (state.phase === 'move') fail('Escolha o destino primeiro.');
  const target = a.index !== undefined ? p.team[Number(a.index)] : null;

  switch (it.kind) {
    case 'heal': {
      if (!target) fail('Escolha um Pokémon.');
      if (target.hp <= 0) fail('Use Revive em Pokémon desmaiado.');
      if (target.hp >= maxHpOf(target)) fail('HP já está cheio.');
      takeItem(p, a.item);
      const h = healMon(target, it.healPct);
      log(state, `💊 ${speciesName(target.sp)} recuperou ${h} HP.`);
      return;
    }
    case 'revive': {
      if (!target || target.hp > 0) fail('Escolha um Pokémon desmaiado.');
      takeItem(p, a.item);
      target.hp = Math.max(1, Math.ceil(maxHpOf(target) * it.healPct));
      log(state, `✨ ${speciesName(target.sp)} foi revivido.`);
      return;
    }
    case 'candy': {
      if (!target) fail('Escolha um Pokémon.');
      takeItem(p, a.item);
      levelUp(target).forEach(m => log(state, m, 'good'));
      return;
    }
    case 'stone': {
      if (!target) fail('Escolha um Pokémon.');
      const sp = getSpecies(target.sp);
      if (!sp.evolvesTo || !getSpecies(sp.evolvesTo)) fail(`${sp.name} não evolui.`);
      takeItem(p, a.item);
      const ev = evolve(target);
      markCaught(p, target.sp, !!target.shiny);
      log(state, `💎 ${ev.from} evoluiu para ${ev.to} com a Pedra Evolutiva!`, 'good');
      return;
    }
    case 'tm': { // 💿 ensina um novo 2º golpe
      if (!target) fail('Escolha um Pokémon.');
      const mv = String(a.move || '');
      if (!tmMovesFor(target.sp).some(m => m.id === mv)) fail('Esse Pokémon não aprende esse golpe.');
      const cur = Array.isArray(target.moves) && target.moves.length === 2 ? target.moves : defaultMoveIds(target.sp);
      if (cur[1] === mv) fail('Ele já sabe esse golpe.');
      takeItem(p, a.item);
      const old = MOVES[cur[1]]?.name || '?';
      target.moves = [cur[0], mv];
      log(state, `💿 ${speciesName(target.sp)} esqueceu ${old} e aprendeu ${MOVES[mv].name}!`, 'good');
      fx(state, { k: 'tm', pid: p.id, uid: target.uid, move: mv });
      return;
    }
    case 'move_bonus': {
      if (state.phase !== 'roll') fail('Use a Bicicleta antes de rolar o dado.');
      takeItem(p, a.item);
      p.moveBonus += it.bonus;
      log(state, `🚲 ${p.name} subiu na bicicleta: +${it.bonus} casas no próximo movimento.`);
      return;
    }
    case 'escape': {
      takeItem(p, a.item);
      p.pos = p.lastCity;
      state.phase = 'action';
      state.pending = null;
      log(state, `🪢 ${p.name} usou a Corda de Fuga e voltou para ${getSpace(p.lastCity).name}.`);
      fx(state, { k: 'move', pid: p.id, to: p.pos });
      return;
    }
    case 'fly': {
      const to = Number(a.to);
      if (!p.visited.includes(to) || getSpace(to)?.type !== 'city') fail('Escolha uma cidade já visitada.');
      if (to === p.pos) fail('Você já está aí.');
      takeItem(p, a.item);
      p.pos = to;
      state.phase = 'action';
      state.pending = null;
      const sp = getSpace(to);
      log(state, `🕊️ ${p.name} voou até ${sp.name}.`);
      fx(state, { k: 'move', pid: p.id, to });
      visitCity(state, p, sp);
      return;
    }
    default:
      fail('Esse item só pode ser usado em batalha (ou é passivo).');
  }
}

// ------------------------------------------------------------------ encontros e eventos
/**
 * ⚔️ Battle Royale: selvagens das casas Rosa/Verde/Azul acompanham o nível do seu Pokémon mais forte
 * (−3 a +1), para ninguém ficar travado nem passear. Vermelhos e lendários seguem o nível do tier.
 */
export function scaleWildForRoyale(state, rng, p, mon, tier) {
  if (rulesOf(state) !== 'royale' || tier >= 4 || getSpecies(mon.sp)?.legendary) return;
  const ref = Math.max(1, ...p.team.filter(m => m.hp > 0).map(m => m.lvl));
  const lvl = Math.max(3, Math.min(55, ref + rng.int(-3, 1)));
  if (lvl === mon.lvl) return;
  const full = mon.hp >= maxHpOf(mon);
  setLevel(mon, lvl);
  if (full) mon.hp = maxHpOf(mon);
  else mon.hp = Math.min(mon.hp, maxHpOf(mon));
}

function wildEncounter(state, rng, p, sp, tier, opts = {}) {
  if (!hasUsable(p)) {
    log(state, `😵 ${p.name} está sem Pokémon de pé (ou que obedeça) e não consegue enfrentar o selvagem.`, 'bad');
    return;
  }
  let mon = opts.mon || (opts.fresh ? null : state.board[sp.id]);
  if (opts.mon) state.board[sp.id] = mon;
  if (!mon) {
    // neblina: às vezes aparece um Pokémon de um tier acima
    const rare = weatherRare(state) && rng.chance(weatherRare(state)) ? Math.min(4, tier + 1) : tier;
    const favorTypes = [...(BIOMES[sp.biome]?.spawn || []), ...weatherSpawn(state)];
    mon = rollWild(rng, rare, { dailyPokemon: state.options.dailyPokemon, shinyCharm: !!p.items.shiny_charm, favorTypes });
    state.board[sp.id] = mon;
  } else {
    log(state, `👀 O ${speciesName(mon.sp)} que já estava aqui continua à espreita (HP ${mon.hp}/${maxHpOf(mon)}).`);
  }
  scaleWildForRoyale(state, rng, p, mon, tier);
  if (mon.shiny) fx(state, { k: 'shiny', pid: p.id });
  startBattle(state, { kind: 'wild', pid: p.id, foe: { kind: 'wild', mon, spaceId: sp.id } });
  state.phase = 'battle';
}

const EVENT_ITEMS = {
  1: [['poke_ball', 5], ['potion', 4], ['bicycle', 2], ['escape_rope', 1], ['great_ball', 1]],
  2: [['poke_ball', 3], ['great_ball', 4], ['potion', 3], ['super_potion', 2], ['revive', 1], ['x_attack', 1]],
  3: [['great_ball', 3], ['ultra_ball', 3], ['super_potion', 3], ['revive', 2], ['evolution_stone', 1], ['flame_ball', 1], ['aqua_ball', 1]],
  4: [['ultra_ball', 4], ['super_potion', 3], ['revive', 2], ['rare_candy', 2], ['evolution_stone', 1], ['shadow_ball', 1], ['mystic_ball', 1], ['master_ball', 0.05], ['trust_ball', 0.06], ['tm', 0.4]],
  5: [['ultra_ball', 4], ['rare_candy', 3], ['revive', 2], ['rainbow_ball', 1], ['master_ball', 0.1], ['trust_ball', 0.12], ['tm', 0.7], ['shiny_charm', 0.1]]
};

const LUCKY_ITEMS = [['rare_candy', 4], ['evolution_stone', 3], ['rainbow_ball', 2], ['tm', 1.2], ['master_ball', 0.15], ['trust_ball', 0.25], ['shiny_charm', 0.3]];

function boardEvent(state, rng, p, sp, forceId = null) {
  const t = sp.tier;
  const cards = cardsForTier(t);
  const card = (forceId && cards.find(c => c.id === forceId)) || rng.weighted(cards.map(c => [c, c.weight]));
  const lore = rng.pick(card.lore).replace(/\{name\}/g, p.name);
  const effects = []; // [{ text, tone }]
  const ev = { k: 'event', pid: p.id, id: card.id, title: card.title, icon: card.icon, tone: card.tone, lore, effects };
  let then = null; // ação depois de mostrar a carta (batalha)

  switch (card.id) {
    case 'travel_invite': {
      const txt = giveTravelQuest(state, rng, p);
      if (txt) effects.push({ text: txt, tone: 'good', icon: '🗺️' });
      else { const g = 60 * t; p.gold += g; effects.push({ text: `Você já conhece as cidades por perto. +${g} de ouro pela viagem.`, tone: 'good', icon: '🪙' }); }
      break;
    }
    case 'lost_bag': {
      const g = rng.int(40, 120) * t;
      p.gold += g;
      effects.push({ text: `+${g} de ouro`, tone: 'good', icon: '🪙' });
      break;
    }
    case 'camper_backpack': {
      let id = rng.weighted(EVENT_ITEMS[t]);
      if (id === 'shiny_charm' && p.items.shiny_charm) id = 'tm'; // o Amuleto não acumula
      const q = ITEMS[id].kind === 'ball' && ITEMS[id].bonus < 2 ? rng.int(1, 3) : 1;
      addItem(p, id, q);
      effects.push({ text: `+${q}x ${ITEMS[id].name}`, tone: id === 'master_ball' ? 'shiny' : 'good', item: id });
      break;
    }
    case 'berry_tree': {
      p.team.forEach(fullHeal);
      effects.push({ text: 'Equipe totalmente curada', tone: 'good', icon: '💚' });
      break;
    }
    case 'route_trainer': case 'rocket_ambush': {
      if (!hasUsable(p)) {
        effects.push({ text: 'Sua equipe está desmaiada — o desafiante foi embora', tone: 'neutral' });
        break;
      }
      const rocket = card.id === 'rocket_ambush';
      const base = rocket ? ROCKET : rng.pick(ROUTE_TRAINERS);
      const size = rocket ? Math.min(3, 1 + Math.ceil(t / 2)) : rng.int(1, Math.min(3, 1 + Math.floor(t / 2)));
      const team = routeTeam(rng, t, size, base.favorite);
      const prize = Math.round(team.reduce((a, m) => a + m.lvl, 0) * (rocket ? 20 : 12));
      ev.trainer = { name: base.name, sprite: base.sprite };
      effects.push({ text: `Batalha contra ${base.name} (${size} Pokémon)`, tone: 'battle', icon: '⚔️' });
      effects.push({ text: `Prêmio: ${prize} de ouro`, tone: 'good', icon: '🪙' });
      if (rocket) effects.push({ text: 'Se perder: roubam 25% do seu ouro', tone: 'bad', icon: '💸' });
      then = () => {
        startBattle(state, { kind: rocket ? 'rocket' : 'trainer', pid: p.id,
          foe: { kind: 'npc', name: base.name, title: rocket ? '' : 'Treinador', sprite: base.sprite, prize, team } });
        state.phase = 'battle';
      };
      break;
    }
    case 'professor_class': {
      const xp = 36 * t;
      effects.push({ text: `+${xp} XP para a equipe`, tone: 'good', icon: '⭐' });
      fx(state, ev);
      log(state, `${card.icon} ${p.name} tirou a carta "${card.title}" → ${effects.map(e => e.text).join(' · ')}`, 'event');
      p.team.filter(m => m.hp > 0).forEach(m => gainXp(m, xp).forEach(msg => log(state, msg, 'good')));
      return;
    }
    case 'rustling_grass': {
      effects.push({ text: `Um Pokémon de tier ${t} saltou do mato!`, tone: 'battle', icon: '🌿' });
      then = () => wildEncounter(state, rng, p, sp, t, { fresh: true });
      break;
    }
    case 'pokemon_egg': case 'ancient_egg': {
      const eggTier = card.id === 'ancient_egg' ? 4 : Math.max(1, t - 1);
      const mon = hatchEgg(rng, eggTier, { ot: p.id });
      ev.mon = { sp: mon.sp, shiny: mon.shiny };
      effects.push({ text: `Nasceu um ${speciesName(mon.sp)}${mon.shiny ? ' ✨SHINY' : ''} (tier ${eggTier})!`, tone: mon.shiny ? 'shiny' : 'good', mon: mon.sp });
      effects.push(placeText(p, mon));
      fx(state, ev);
      log(state, `${card.icon} ${p.name} tirou a carta "${card.title}" → ${effects.map(e => e.text).join(' · ')}`, 'event');
      deliverCapture(state, p.id, mon, null);
      return;
    }
    case 'raid': case 'legend_shrine': {
      if (!hasUsable(p)) {
        effects.push({ text: 'Sua equipe não tem condições de lutar — o lendário desaparece na névoa', tone: 'neutral' });
        break;
      }
      const boss = raidBoss(rng, t, card.id === 'legend_shrine', !!p.items.shiny_charm);
      ev.mon = { sp: boss.sp, shiny: boss.shiny };
      const others = state.players.filter(x => !x.left && x.id !== p.id && hasUsable(x)).length;
      const group = card.id === 'raid' && others >= 1 && !state.options.duel && rng.chance(0.5);
      if (group) {
        ev.title = 'RAID EM GRUPO';
        effects.push({ text: `${speciesName(boss.sp)}${boss.shiny ? ' ✨SHINY' : ''} Nv.${boss.lvl} — todos os treinadores podem lutar juntos!`, tone: 'battle', icon: '🔥' });
        effects.push({ text: 'Cada um escolhe 1 Pokémon; o HP do lendário cresce com o grupo', tone: 'neutral', icon: '👥' });
        effects.push({ text: 'Vencendo, quem causou mais dano tenta capturar primeiro', tone: 'good', icon: '🎯' });
        then = () => startGroupRaid(state, boss, p.id);
      } else {
        effects.push({ text: `${speciesName(boss.sp)}${boss.shiny ? ' ✨SHINY' : ''} Nv.${boss.lvl} — HP de chefe (${maxHpOf(boss)})`, tone: 'battle', icon: '🔥' });
        effects.push({ text: 'Pokébolas não funcionam durante a luta', tone: 'neutral', icon: '🚫' });
        effects.push({ text: 'Vença e depois escolha a Pokébola para tentar capturar', tone: 'good', icon: '🎯' });
        then = () => {
          startBattle(state, { kind: 'raid', pid: p.id, foe: { kind: 'wild', mon: boss } });
          state.phase = 'battle';
        };
      }
      break;
    }
    case 'master_trainer': {
      if (!hasUsable(p)) { effects.push({ text: 'Sua equipe está desmaiada — o Ás foi embora', tone: 'neutral' }); break; }
      const base = rng.pick(ACE_TRAINERS);
      const team = routeTeam(rng, 4, 3, base.favorite).map(m => { m.lvl = Math.min(60, m.lvl + 6); fullHeal(m); return m; });
      const prize = 1500;
      ev.trainer = { name: base.name, sprite: base.sprite };
      effects.push({ text: `Batalha contra ${base.name} (3 Pokémon fortes)`, tone: 'battle', icon: '⚔️' });
      effects.push({ text: `Prêmio: ${prize} de ouro + Rare Candy`, tone: 'good', icon: '🪙' });
      then = () => {
        startBattle(state, { kind: 'ace', pid: p.id,
          foe: { kind: 'npc', name: base.name, title: 'Ás da Liga', sprite: base.sprite, prize, team } });
        state.phase = 'battle';
      };
      break;
    }
    case 'star_shower': {
      if (!hasUsable(p)) { effects.push({ text: 'Sua equipe está desmaiada — o brilho some no céu', tone: 'neutral' }); break; }
      const tier = rng.weighted([[3, 5], [4, 4]]);
      const mon = rollWild(rng, tier, { forceShiny: rng.chance(0.2) }); // 20% de shiny: ainda é raro
      mon.lvl = Math.max(mon.lvl, WILD_LEVELS[5][0]); fullHeal(mon);
      ev.mon = { sp: mon.sp, shiny: true };
      effects.push({ text: `${speciesName(mon.sp)}${mon.shiny ? ' ✨SHINY' : ''} Nv.${mon.lvl} apareceu!`, tone: mon.shiny ? 'shiny' : 'battle', icon: '🌠' });
      then = () => {
        if (mon.shiny) fx(state, { k: 'shiny', pid: p.id });
        startBattle(state, { kind: 'wild', pid: p.id, foe: { kind: 'wild', mon } });
        state.phase = 'battle';
      };
      break;
    }
    case 'league_treasure': {
      const g = rng.int(600, 1000);
      p.gold += g;
      effects.push({ text: `+${g} de ouro`, tone: 'good', icon: '🪙' });
      const id = rng.weighted([['master_ball', 0.1], ['rainbow_ball', 3], ['rare_candy', 3], ['evolution_stone', 2]]);
      addItem(p, id, 1);
      effects.push({ text: `+1x ${ITEMS[id].name}`, tone: id === 'master_ball' ? 'shiny' : 'good', item: id });
      addItem(p, 'ultra_ball', 3);
      effects.push({ text: '+3x Ultra Ball', tone: 'good', item: 'ultra_ball' });
      break;
    }
    case 'mew_blessing': {
      p.team.forEach(fullHeal);
      effects.push({ text: 'Equipe totalmente curada', tone: 'good', icon: '💗' });
      const best = [...p.team].sort((a, b) => b.lvl - a.lvl)[0];
      if (best) {
        const msgs = [...levelUp(best), ...levelUp(best)];
        effects.push({ text: `${speciesName(best.sp)} subiu 2 níveis!`, tone: 'good', icon: '⬆️' });
        fx(state, ev);
        log(state, `${card.icon} ${p.name} tirou a carta "${card.title}" → ${effects.map(e => e.text).join(' · ')}`, 'event');
        (msgs || []).forEach(m => log(state, m, 'good'));
        return;
      }
      break;
    }
    case 'storm': {
      p.skip += 1;
      effects.push({ text: 'Perde a próxima vez', tone: 'bad', icon: '⏸️' });
      break;
    }
    case 'zubat_swarm': {
      let total = 0;
      p.team.forEach(m => {
        if (m.hp <= 1) return;
        const d = Math.min(m.hp - 1, Math.ceil(maxHpOf(m) * 0.25));
        m.hp -= d; total += d;
      });
      effects.push({ text: `Equipe perdeu ${total} HP (ninguém desmaia)`, tone: 'bad', icon: '💥' });
      break;
    }
    case 'toll': {
      const g = Math.min(p.gold, Math.max(20, Math.floor(p.gold * 0.1)));
      p.gold -= g;
      effects.push({ text: `-${g} de ouro`, tone: 'bad', icon: '🪙' });
      break;
    }
    case 'meowth_thief': {
      const stealable = Object.keys(p.items).filter(id => p.items[id] > 0 && ITEMS[id] && ITEMS[id].kind !== 'charm' && ITEMS[id].kind !== 'tm');
      if (!stealable.length) { effects.push({ text: 'Mochila vazia — o Meowth saiu de mãos abanando!', tone: 'good' }); break; }
      const id = rng.pick(stealable);
      takeItem(p, id, 1);
      effects.push({ text: `-1x ${ITEMS[id].name}`, tone: 'bad', item: id });
      break;
    }
    case 'shortcut': {
      effects.push({ text: 'Role o dado de novo!', tone: 'good', icon: '🎲' });
      state.phase = 'roll';
      break;
    }
    case 'lucky_find': {
      let id = rng.weighted(LUCKY_ITEMS);
      if (id === 'shiny_charm' && p.items.shiny_charm) id = 'tm'; // o Amuleto não acumula
      addItem(p, id, 1);
      effects.push({ text: `+1x ${ITEMS[id].name}`, tone: 'shiny', item: id });
      break;
    }
  }
  fx(state, ev);
  log(state, `${card.icon} ${p.name} tirou a carta "${card.title}" → ${effects.map(e => e.text).join(' · ')}`, card.tone === 'bad' ? 'bad' : card.tone === 'battle' ? 'battle' : 'event');
  if (then) then();
}

// ---------------------------------------------------------------- Raid
const RAID_POOL = {
  3: ['raikou', 'entei', 'suicune', 'articuno', 'zapdos', 'moltres'],
  4: ['articuno', 'zapdos', 'moltres', 'lugia', 'ho_oh', 'mew', 'mewtwo', 'rayquaza', 'dialga', 'palkia', 'giratina'],
  5: ['mewtwo', 'mew', 'lugia', 'ho_oh', 'rayquaza', 'dialga', 'palkia', 'giratina', 'reshiram', 'zekrom', 'xerneas', 'yveltal', 'zygarde', 'blacephalon']
};
export const RAID_HP_BONUS = 0.6; // chefe tem +60% de HP

function raidBoss(rng, tier, shrine, charm = false) {
  const pool = RAID_POOL[tier] || RAID_POOL[4];
  const sp = rng.pick(pool.filter(id => SPECIES[id]));
  const lvl = WILD_LEVELS[tier][1] + (shrine ? 0 : 1);
  // lendário também pode vir shiny (1/450; Amuleto Shiny triplica)
  const mon = createMon(rng, sp, lvl, { shiny: rng.chance(BASE_SHINY_RATE * (charm ? 3 : 1)), capTier: 5 });
  mon.bonusHp = Math.round(maxHpOf(mon) * RAID_HP_BONUS);
  mon.hp = maxHpOf(mon);
  mon.wild = true;
  mon.raid = true;
  return mon;
}

export function raidCatchChance(p) {
  return Math.min(0.2, 0.08 + 0.02 * (p.badges?.length || 0));
}

function placeText(p, mon) {
  return p.team.length < TEAM_SIZE
    ? { text: 'Vai para a equipe', tone: 'neutral', icon: '👥' }
    : { text: 'Equipe cheia (6) — vai para o PC', tone: 'neutral', icon: '💻' };
}

/** Prêmio de insígnia (depende de quantas insígnias o jogador tem agora). */
function grantBadgeReward(state, rng, p) {
  const n = p.badges.length;
  const rw = BADGE_REWARDS[n];
  if (!rw) return;
  const effects = [];
  for (const [id, q] of Object.entries(rw.items || {})) {
    if (!ITEMS[id]) continue;
    addItem(p, id, q);
    effects.push({ text: `+${q}x ${ITEMS[id].name}`, tone: id === 'master_ball' ? 'shiny' : 'good', item: id });
  }
  let mon = null;
  if (rw.egg) {
    mon = hatchEgg(rng, rw.egg, { ot: p.id });
    effects.push({ text: `Ovo tier ${rw.egg} chocou: ${speciesName(mon.sp)}${mon.shiny ? ' ✨SHINY' : ''}!`, tone: mon.shiny ? 'shiny' : 'good', mon: mon.sp });
    effects.push(placeText(p, mon));
  }
  const unlocked = Object.entries({ 3: 2, 4: 3, 5: 4 }).filter(([, need]) => need === n).map(([t]) => t);
  if (unlocked.length) effects.push({ text: `Pokémon de tier ${unlocked[0]} agora te obedecem!`, tone: 'good', icon: '🔓' });
  fx(state, { k: 'event', pid: p.id, id: 'badge_reward', title: `Prêmio da ${n}ª insígnia`, icon: '🎁', tone: 'good',
    lore: `A Liga Pokémon recompensa ${p.name}: ${rw.text}.`, effects, mon: mon ? { sp: mon.sp, shiny: mon.shiny } : undefined });
  log(state, `🎁 Prêmio da ${n}ª insígnia para ${p.name}: ${effects.map(e => e.text).join(' · ')}`, 'win');
  if (mon) deliverCapture(state, p.id, mon, null);
}

function routeTeam(rng, tier, size, favorite) {
  const [lo, hi] = WILD_LEVELS[tier];
  const pool = speciesByTier(tier);
  const fav = pool.filter(s => s.types.some(t => favorite.includes(t)));
  const team = [];
  for (let i = 0; i < size; i++) {
    const s = (fav.length && rng.chance(0.7)) ? rng.pick(fav) : rng.pick(pool);
    team.push(createMon(rng, s.id, rng.int(Math.floor((lo + hi) / 2), hi)));
  }
  return team;
}

// ------------------------------------------------------------------ PvP
function challenge(state, rng, p, targetId, now) {
  if (state.phase !== 'action') fail('Só dá para desafiar depois de se mover.');
  if (state.turnFlags.pvp) fail('Só um desafio PvP por turno.');
  const q = getPlayer(state, String(targetId));
  if (!q || q.id === p.id) fail('Adversário inválido.');
  if (q.pos !== p.pos) fail('O adversário precisa estar na mesma casa que você.');
  if (!hasUsable(p)) fail('Você não tem Pokémon de pé que te obedeça.');
  if (!hasUsable(q)) fail(`${q.name} não tem Pokémon em condições de lutar.`);
  state.turnFlags.pvp = true;
  if (q.isBot || rulesOf(state) === 'royale') {
    log(state, rulesOf(state) === 'royale' ? `🤺 ${p.name} desafiou ${q.name}! No Battle Royale não dá para recusar.` : `🤺 ${p.name} desafiou ${q.name} (CPU), que aceitou na hora!`);
    beginPvp(state, p, q);
    return;
  }
  state.pending = { kind: 'pvp_invite', from: p.id, to: q.id };
  state.turnStartedAt = now; // o relógio de inatividade passa a contar para o desafiado
  log(state, `🤺 ${p.name} desafiou ${q.name} para uma batalha PvP! Aguardando resposta...`);
}

function respondInvite(state, rng, actor, accept, now) {
  const inv = state.pending;
  if (actor.id !== inv.to) fail('O convite não é para você.');
  state.pending = null;
  const p = getPlayer(state, inv.from);
  if (!accept) {
    log(state, `🙅 ${actor.name} recusou o desafio de ${p.name}.`);
    return;
  }
  log(state, `🔥 ${actor.name} aceitou o desafio de ${p.name}!`);
  beginPvp(state, p, actor);
}

function beginPvp(state, p, q) {
  startBattle(state, { kind: 'pvp', pid: p.id, foe: { kind: 'player', pid: q.id } });
  state.phase = 'battle';
}

// ------------------------------------------------------------------ fim de batalha
setBattleEndHandler((state, rng, b, outcome) => {
  const p0 = getPlayer(state, b.sides[0].pid);
  const r = outcome.result;
  state.phase = 'action';
  fx(state, { k: 'battle_end', kind: b.kind, result: r, winner: outcome.winner ?? null,
    pids: b.sides.filter(s => s.kind === 'player').map(s => s.pid) });

  if (b.kind === 'wild') {
    const wild = b.sides[1].team[0];
    const sid = b.spaceId;
    if (r === 'captured') {
      delete state.board[sid];
      deliverCapture(state, p0.id, wild, outcome.ball);
    } else if (r === 'escaped') {
      delete state.board[sid];
    } else if (r === 'win' && outcome.winner === 0) {
      delete state.board[sid];
      const g = Math.round(wild.lvl * 5 * getSpecies(wild.sp).tier * (playerCompanionBonus(p0)?.gold || 1));
      p0.gold += g;
      p0.stats.wins += 1;
      log(state, `🏅 ${p0.name} venceu o selvagem e ganhou ${g} de ouro.`, 'good');
    } else if (r === 'win' && outcome.winner === 1) {
      p0.stats.losses += 1;
      knockOut(state, p0);
    }
    return;
  }

  if (b.kind === 'raid') {
    const boss = b.sides[1].team[0];
    if (r === 'win' && outcome.winner === 0) {
      p0.stats.wins += 1;
      p0.stats.raids = (p0.stats.raids || 0) + 1;
      const g = 250 * Math.max(3, getSpecies(boss.sp).tier);
      p0.gold += g;
      addItem(p0, 'rare_candy', 1);
      addItem(p0, 'ultra_ball', 2);
      log(state, `🔥 ${p0.name} venceu a RAID contra ${speciesName(boss.sp)}! +${g} de ouro, Rare Candy e 2 Ultra Balls. Agora escolha a Pokébola!`, 'win');
      progressMission(state, p0.id, { k: 'raid_win' });
      startCatchStage(state, boss, [p0.id]);
    } else if (r !== 'draw') {
      p0.stats.losses += 1;
      log(state, `😓 ${p0.name} não resistiu ao lendário.`, 'bad');
      if (!outcome.surrender && !hasUsable(p0)) knockOut(state, p0, 0);
    }
    return;
  }

  if (b.kind === 'pvp' && state.options.duel) return finishDuel(state, outcome);
  if (b.kind === 'pvp') {
    if (r === 'draw') return;
    const w = getPlayer(state, b.sides[outcome.winner].pid);
    const l = getPlayer(state, b.sides[1 - outcome.winner].pid);
    const pay = Math.floor(l.gold * 0.15);
    l.gold -= pay;
    w.gold += pay;
    w.stats.pvpWins += 1;
    w.stats.wins += 1;
    l.stats.losses += 1;
    log(state, `🏆 ${w.name} venceu o PvP e levou ${pay} de ouro de ${l.name}!`, 'win');
    if (!hasUsable(l)) knockOut(state, l, 0, 'pvp');
    return;
  }

  // Conquista: ginásio neutro ou cerco a cidade de outro jogador
  const cq = conquestBattleEnd(state, rng, b, outcome, p0, {
    badge: pl => { grantBadgeReward(state, rng, pl); progressMission(state, pl.id, { k: 'badge' }); },
    mission: pl => progressMission(state, pl.id, { k: 'trainer_win' })
  });
  if (cq) { if (cq.finish) finishMatch(state, cq.finish, cq.reason); return; }

  // NPC: treinador, rocket, ginásio, elite, campeão
  const foe = b.sides[1];
  if (r === 'draw') return;
  if (outcome.winner === 0) {
    const prize = Math.round(foe.prize * (playerCompanionBonus(p0)?.gold || 1));
    p0.gold += prize;
    p0.stats.wins += 1;
    log(state, `🏆 ${p0.name} venceu ${foe.name} e recebeu ${prize} de ouro!`, 'win');
    progressMission(state, p0.id, { k: 'trainer_win' });
    if (b.kind === 'gym') {
      const gym = GYMS.find(g => g.id === b.ref);
      p0.badges.push(gym.id);
      log(state, `🎖️ ${p0.name} conquistou a ${gym.badge}! (${p0.badges.length}/${GYMS.length})`, 'win');
      fx(state, { k: 'badge', pid: p0.id, badge: gym.id });
      grantBadgeReward(state, rng, p0);
      progressMission(state, p0.id, { k: 'badge' });
    } else if (b.kind === 'elite') {
      p0.eliteStage += 1;
      if (p0.eliteStage < ELITE_FOUR.length) {
        log(state, `➡️ Próximo membro da Elite: ${ELITE_FOUR[p0.eliteStage].name}! (sem cura entre as lutas)`, 'battle');
        state.battle = null;
        startEliteBattle(state, rng, p0);
      } else {
        log(state, `👑 ${p0.name} venceu a Elite dos Quatro! Agora só falta o Campeão na Arena Final.`, 'win');
      }
    } else if (b.kind === 'ace') {
      addItem(p0, 'rare_candy', 1);
      log(state, `🍬 ${p0.name} também ganhou um Rare Candy do Ás da Liga.`, 'good');
    } else if (b.kind === 'champion') {
      p0.champion = true;
      finishMatch(state, p0, 'Derrotou o Campeão da Liga!');
    }
    return;
  }

  // derrota para NPC
  p0.stats.losses += 1;
  if (b.kind === 'elite') {
    p0.eliteStage = 0;
    log(state, `📉 ${p0.name} perdeu na Elite dos Quatro e terá que recomeçar o desafio.`, 'bad');
  }
  if (outcome.surrender && b.kind !== 'rocket') return; // desistiu: sem desmaio
  if (b.kind === 'rocket') {
    const stolen = Math.floor(p0.gold * 0.25);
    p0.gold -= stolen;
    log(state, `🦹 A Equipe Rocket roubou ${stolen} de ouro de ${p0.name}!`, 'bad');
  }
  if (!hasUsable(p0)) knockOut(state, p0, b.kind === 'rocket' || b.kind === 'raid' ? 0 : 0.1);
});

// ------------------------------------------------------------------ bots
export function runBots(state, rng, now) {
  useStateMap(state);
  for (let guard = 0; guard < 400; guard++) {
    if (state.status !== 'playing') break;
    const ids = whoMustAct(state);
    const botId = ids.find(id => getPlayer(state, id)?.isBot);
    if (!botId) break;
    const action = botAction(state, botId);
    try {
      dispatch(state, rng, botId, action, now);
    } catch (e) {
      if (!e.isGameError) throw e;
      // Ação do bot inválida: força o fim do turno para não travar
      const cp = currentPlayer(state);
      if (state.battle && !state.battle.over) {
        state.battle.over = true;
        state.battle.outcome = { result: 'draw' };
        afterBattleStep(state);
        state.phase = 'action';
      } else if (state.pending?.kind === 'pvp_invite') {
        state.pending = null;
      } else if (cp && cp.id === botId) {
        advanceTurn(state, now);
      }
    }
  }
  return state;
}

// Reexporta utilidades úteis para o cliente
export { whoMustAct as mustAct, GameError, sideActive, sideIndexOf };
export { SPACE_LIST, GYMS, ELITE_FOUR, CHAMPION, ITEMS, shopFor };

// ---------------------------------------------------------------- eventos relâmpago (ícone numa casa de evento, com tempo)
export const HOTSPOT_MAX = 2;      // no máximo 2 ao mesmo tempo
export const HOTSPOT_ROUNDS = 4;   // somem depois de 4 rodadas
export const HOTSPOT_CHANCE = 0.4; // chance de surgir um novo a cada rodada
export const HOTSPOT_INFO = {
  chest:   { icon: '🎁', name: 'Baú do Tesouro' },
  raid:    { icon: '🔥', name: 'Raid Relâmpago' },
  mystery: { icon: '❔', name: 'Pokémon Misterioso' }
};

/** Começo de cada rodada: vence os antigos e às vezes cria um novo. */
function tickHotspots(state) {
  if (state.kind === 'duel' || state.status !== 'playing') return;
  const rng = createRng((state.seed ^ (state.turn * 2654435761)) >>> 0);
  const list = (state.hotspots ||= []);
  for (let i = list.length - 1; i >= 0; i--) {
    if (state.turn >= list[i].until) {
      const h = list.splice(i, 1)[0];
      fx(state, { k: 'hotspot_gone', space: h.space, kind: h.kind });
      log(state, `⌛ O ${HOTSPOT_INFO[h.kind].name} em ${getSpace(h.space).name} sumiu.`);
    }
  }
  const royale = rulesOf(state) === 'royale';
  if (list.length >= (royale ? 3 : HOTSPOT_MAX) || rng.next() > (royale ? 0.75 : HOTSPOT_CHANCE)) return;
  const taken = new Set([...list.map(h => h.space), ...state.players.map(p => p.pos)]);
  const spots = SPACE_LIST.filter(x => x.type === 'event' && !taken.has(x.id));
  if (!spots.length) return;
  const sp = rng.pick(spots);
  const kinds = [['chest', 45], ['mystery', 35]];
  if (sp.tier >= 3) kinds.push(['raid', 20]);
  const kind = rng.weighted(kinds);
  const h = { space: sp.id, kind, until: state.turn + HOTSPOT_ROUNDS, tier: sp.tier };
  if (kind === 'mystery') {
    const mt = Math.min(4, sp.tier + 1); // um tier acima do normal da casa
    const mon = rollWild(rng, mt, { dailyPokemon: state.options.dailyPokemon });
    if (!mon.shiny && rng.next() < 0.08) mon.shiny = true; // chance de shiny bem maior
    h.mon = mon;
  }
  list.push(h);
  fx(state, { k: 'hotspot', space: sp.id, kind, rounds: HOTSPOT_ROUNDS });
  log(state, `${HOTSPOT_INFO[kind].icon} ${HOTSPOT_INFO[kind].name} apareceu em ${sp.name}! Some em ${HOTSPOT_ROUNDS} rodadas.`, 'event');
}

function triggerHotspot(state, rng, p, sp, h) {
  state.hotspots = state.hotspots.filter(x => x !== h);
  const t = sp.tier;
  if (h.kind === 'raid') return boardEvent(state, rng, p, sp, t >= 5 ? 'legend_shrine' : 'raid');
  const ev = { k: 'event', pid: p.id, id: 'hotspot_' + h.kind, title: HOTSPOT_INFO[h.kind].name, icon: HOTSPOT_INFO[h.kind].icon, tone: 'good', effects: [] };
  if (h.kind === 'chest') {
    ev.lore = `${p.name} chegou primeiro e abriu o baú!`;
    const g = 120 * t + rng.int(0, 60) * t;
    p.gold += g;
    ev.effects.push({ text: `+${g} de ouro`, tone: 'good', icon: '🪙' });
    for (let i = 0; i < 2; i++) {
      const id = rng.weighted(i === 0 ? EVENT_ITEMS[t] : LUCKY_ITEMS);
      addItem(p, id, 1);
      ev.effects.push({ text: `+1x ${ITEMS[id].name}`, tone: id === 'master_ball' ? 'shiny' : 'good', item: id });
    }
    fx(state, ev);
    log(state, `🎁 ${p.name} abriu o Baú do Tesouro → ${ev.effects.map(e => e.text).join(' · ')}`, 'event');
    return;
  }
  // Pokémon Misterioso: a silhueta vira um selvagem mais forte (e com mais chance de shiny)
  const mon = h.mon;
  ev.lore = `A silhueta saltou da sombra... é um ${speciesName(mon.sp)}${mon.shiny ? ' ✨SHINY✨' : ''}!`;
  ev.mon = { sp: mon.sp, shiny: !!mon.shiny };
  ev.tone = mon.shiny ? 'shiny' : 'battle';
  ev.effects.push({ text: `${speciesName(mon.sp)} Nv. ${mon.lvl} quer batalhar!`, tone: 'battle', icon: '⚔️' });
  fx(state, ev);
  log(state, `❔ ${p.name} encontrou o Pokémon Misterioso: ${speciesName(mon.sp)}${mon.shiny ? ' ✨' : ''}!`, 'event');
  if (!hasUsable(p)) { log(state, `😵 ${p.name} não tem Pokémon de pé — o misterioso fugiu.`, 'bad'); return; }
  wildEncounter(state, rng, p, sp, getSpecies(mon.sp).tier, { mon });
}

// Usado só nos testes automatizados
export const _internals = {
  tickHotspots,
  land(state, pid, spaceId, seed = 1) {
    const st = clone(state);
    st.fx = [];
    resolveSpace(st, createRng(seed), getPlayer(st, pid), getSpace(spaceId));
    return st;
  },
  boardEvent(state, pid, spaceId, cardId, seed = 1) {
    const st = clone(state);
    const rng = createRng(seed);
    st.fx = [];
    boardEvent(st, rng, getPlayer(st, pid), getSpace(spaceId), cardId);
    return st;
  }
};

// os auxiliares de teste também ativam o mapa da partida antes de rodar
for (const k of Object.keys(_internals)) {
  const f = _internals[k];
  if (typeof f === 'function') _internals[k] = (st, ...a) => { useStateMap(st); return f(st, ...a); };
}
