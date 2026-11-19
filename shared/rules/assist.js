// Eventos que deixam a partida mais equilibrada e dinâmica:
//  👴 Ajuda do Professor: a cada 4 rodadas, quem tem menos Pokémon recebe ajuda (uma Insígnia de Incentivo, uma vez
//     por partida, se estiver bem atrás nas insígnias; senão itens e um Pokémon novo).
//  🗺️ Convite de viagem: carta de evento que pede para visitar uma cidade onde você nunca foi, dentro de algumas rodadas.
import { SPACE_LIST, getSpace } from '../data/board.js';
import { GYMS, LEAGUE_GATE_SPACES } from '../data/trainers.js';
import { ITEMS } from '../data/items.js';
import { createRng } from './rng.js';
import { log, fx, addItem, giveMon, speciesName } from './helpers.js';
import { rollWild } from './monsters.js';
import { distancesFrom } from './movement.js';

export const HELP_EVERY = 4;           // rodadas
export const HELP_GAP = 2;             // precisa ter pelo menos 2 Pokémon a menos que o líder
export const QUEST_ROUNDS = 6;         // prazo do convite de viagem

const count = p => p.team.length + p.box.length;

/** Começo de rodada: Ajuda do Professor e prazos dos convites. */
export function assistTick(state) {
  if (state.kind === 'duel' || state.rules === 'royale' || state.status !== 'playing') return;
  // convites vencidos
  for (const p of state.players) {
    if (p.quest && state.turn > p.quest.until) {
      log(state, `⌛ ${p.name} não chegou a ${getSpace(p.quest.space)?.name} a tempo. O convite expirou.`);
      fx(state, { k: 'quest_expired', pid: p.id, space: p.quest.space });
      p.quest = null;
    }
  }
  if (state.turn < HELP_EVERY || state.turn % HELP_EVERY !== 0) return;
  const players = state.players.filter(p => !p.left && !p.out);
  if (players.length < 2) return;
  const most = Math.max(...players.map(count));
  const low = [...players].sort((a, b) => count(a) - count(b) || a.badges.length - b.badges.length || a.gold - b.gold)[0];
  if (most - count(low) < HELP_GAP) return;
  const rng = createRng((state.seed ^ (state.turn * 0x45d9f3b) ^ 0x1b873593) >>> 0);
  const ev = { k: 'event', pid: low.id, id: 'professor_help', title: 'Ajuda do Professor', icon: '👴', tone: 'good',
    lore: `O Professor Carvalho viu que ${low.name} está com poucos Pokémon e mandou uma ajuda pelo Pidgeot-correio!`, effects: [] };
  const leader = Math.max(...players.map(p => p.badges.length));
  if (!low.helpBadge && leader - low.badges.length >= 2) {
    // Insígnia de Incentivo: a primeira que falta, na ordem dos ginásios (uma vez por partida)
    const g = GYMS.find(x => !low.badges.includes(x.id));
    if (g) {
      low.badges.push(g.id);
      low.helpBadge = true;
      ev.effects.push({ text: `Insígnia de Incentivo: ${g.badge || g.id}`, tone: 'shiny', icon: '🏅' });
      fx(state, { k: 'badge', pid: low.id, badge: g.id, gift: true });
    }
  }
  // sempre: um Pokémon do tier da região e alguns itens
  const tier = Math.max(1, Math.min(4, getSpace(low.pos)?.tier || 1));
  const mon = rollWild(rng, tier, { dailyPokemon: state.options.dailyPokemon });
  const where = giveMon(low, mon);
  ev.effects.push({ text: `${speciesName(mon.sp)} Nv.${mon.lvl} entrou ${where === 'team' ? 'na equipe' : 'no PC'}`, tone: 'good', icon: '🎁' });
  addItem(low, 'great_ball', 3);
  addItem(low, 'potion', 2);
  ev.effects.push({ text: '+3 Great Ball · +2 Potion', tone: 'good', icon: '🎒' });
  ev.mon = { sp: mon.sp, shiny: !!mon.shiny };
  fx(state, ev);
  log(state, `👴 Ajuda do Professor para ${low.name}: ${ev.effects.map(e => e.text).join(' · ')}.`, 'event');
}

/** Carta "Convite de viagem": escolhe uma cidade ainda não visitada. Devolve o texto do efeito (ou null). */
export function giveTravelQuest(state, rng, p) {
  if (p.quest) return null;
  const dist = distancesFrom(p, p.pos);
  const blocked = new Set(LEAGUE_GATE_SPACES);
  const options = SPACE_LIST.filter(s => s.type === 'city' && !s.gate && !blocked.has(s.id) && !p.visited.includes(s.id) && dist[s.id] >= 3 && dist[s.id] <= 18);
  if (!options.length) return null;
  options.sort((a, b) => dist[a.id] - dist[b.id]);
  const sp = rng.pick(options.slice(0, 3));
  p.quest = { space: sp.id, until: state.turn + QUEST_ROUNDS, tier: sp.tier };
  fx(state, { k: 'quest', pid: p.id, space: sp.id, rounds: QUEST_ROUNDS });
  return `Visite ${sp.name} em até ${QUEST_ROUNDS} rodadas (${dist[sp.id]} casas daqui)`;
}

/** Chegou na cidade do convite: prêmio. */
export function questVisit(state, rng, p, sp) {
  if (!p.quest || p.quest.space !== sp.id) return;
  const t = Math.max(1, sp.tier);
  const gold = 150 * t + 100;
  p.gold += gold;
  addItem(p, 'ultra_ball', 2);
  const effects = [{ text: `+${gold} de ouro`, tone: 'good', icon: '🪙' }, { text: '+2 Ultra Ball', tone: 'good', item: 'ultra_ball' }];
  if (rng.chance(0.04)) { addItem(p, 'trust_ball', 1); effects.push({ text: `+1 ${ITEMS.trust_ball.name}!`, tone: 'shiny', item: 'trust_ball' }); }
  else { addItem(p, 'rare_candy', 1); effects.push({ text: '+1 Rare Candy', tone: 'good', item: 'rare_candy' }); }
  p.quest = null;
  fx(state, { k: 'event', pid: p.id, id: 'quest_done', title: 'Convite cumprido!', icon: '🗺️', tone: 'good', lore: `${p.name} chegou a ${sp.name} e foi recebido como convidado de honra!`, effects });
  log(state, `🗺️ ${p.name} cumpriu o convite de viagem para ${sp.name}: ${effects.map(e => e.text).join(' · ')}.`, 'good');
}
