// ⚔️ v41 — Itens de batalha (segurados) e Habilidades.
// Itens: feitos na 🔨 Oficina (farm longo), ficam na Mochila da conta e são "segurados" por um Pokémon da Coleção
// (1 item por Pokémon — Megapedra OU item de batalha). Nada disso se compra com diamantes.
// Habilidades: fixas por espécie (simples e visíveis no card). Nem todo Pokémon tem uma.
import { SPECIES } from './pokemon.js';
import { TYPES, TYPE_LABELS } from '../rules/types.js';

export const GEAR = {
  leftovers: { name: 'Restos', emoji: '🍎', desc: 'No fim de cada rodada recupera 1/12 do HP.' },
  focus_sash: { name: 'Faixa de Foco', emoji: '🎗️', desc: 'Com o HP cheio, aguenta um golpe que derrubaria e fica com 1 HP (1 vez por batalha).' },
  quick_claw: { name: 'Garra Rápida', emoji: '🐾', desc: '20% de chance de atacar primeiro na rodada.' },
  choice_band: { name: 'Faixa Escolhida', emoji: '🎀', desc: '+25% de dano, mas só pode usar golpes de ataque (nada de cura, buff ou debuff).' }
};
export const PLATE_MULT = 1.2, BAND_MULT = 1.25, QUICK_CLAW = 0.2, LEFTOVERS_FRAC = 12;
for (const t of TYPES) GEAR[`plate_${t}`] = { name: `Placa ${TYPE_LABELS[t]}`, emoji: '🔷', plate: t, desc: `+20% de dano nos golpes do tipo ${TYPE_LABELS[t]}.` };
export const isGear = id => !!GEAR[id];

// ✨ v43 — habilidades REAIS de cada espécie (PokeAPI), adaptadas ao jogo de dado. Cada uma tem um efeito de verdade.
// grupos: pinch (aperto), absorb (absorve um tipo), resist (reduz dano), contact (pune quem bate), stat (protege/sobe ataque),
//         status (imunidade), weather (velocidade no clima), luck (dado), switch (ao sair), drawback (lado ruim).
export const ABILITIES = {
  // 🔥 aperto: com 1/3 do HP ou menos, golpes do tipo +50%
  overgrow: { name: 'Supercrescimento', icon: '🌿', pinch: 'grass', desc: 'Com 1/3 do HP ou menos, golpes de Planta causam +50%.' },
  blaze: { name: 'Chama', icon: '🔥', pinch: 'fire', desc: 'Com 1/3 do HP ou menos, golpes de Fogo causam +50%.' },
  torrent: { name: 'Torrente', icon: '🌊', pinch: 'water', desc: 'Com 1/3 do HP ou menos, golpes de Água causam +50%.' },
  swarm: { name: 'Enxame', icon: '🐝', pinch: 'bug', desc: 'Com 1/3 do HP ou menos, golpes de Inseto causam +50%.' },
  // 🧲 absorve um tipo (imune)
  levitate: { name: 'Levitação', icon: '🎈', immune: 'ground', desc: 'Flutua: imune a golpes de Terra.' },
  volt_absorb: { name: 'Absorve Volt', icon: '⚡', absorb: 'electric', heal: 0.25, desc: 'Golpes Elétricos não causam dano: recupera 25% do HP.' },
  water_absorb: { name: 'Absorve Água', icon: '💧', absorb: 'water', heal: 0.25, desc: 'Golpes de Água não causam dano: recupera 25% do HP.' },
  dry_skin: { name: 'Pele Seca', icon: '🦎', absorb: 'water', heal: 0.25, weakTo: 'fire', desc: 'Água cura 25% do HP em vez de causar dano; Fogo causa +25%.' },
  flash_fire: { name: 'Fogo Interior', icon: '🔥', absorb: 'fire', flash: true, desc: 'Imune a Fogo; depois de absorver, os golpes de Fogo dele causam +50%.' },
  lightning_rod: { name: 'Para-raios', icon: '🌩️', absorb: 'electric', boost: true, desc: 'Atrai golpes Elétricos: não sofre dano e o ataque sobe.' },
  storm_drain: { name: 'Escoadouro', icon: '🌀', absorb: 'water', boost: true, desc: 'Atrai golpes de Água: não sofre dano e o ataque sobe.' },
  sap_sipper: { name: 'Come-Seiva', icon: '🌱', absorb: 'grass', boost: true, desc: 'Golpes de Planta não causam dano e o ataque sobe.' },
  // 🛡️ reduz dano
  thick_fat: { name: 'Gordura Espessa', icon: '🐋', desc: 'Recebe metade do dano de Fogo e Gelo.' },
  heatproof: { name: 'À Prova de Calor', icon: '🧯', desc: 'Recebe metade do dano de Fogo.' },
  multiscale: { name: 'Multiescamas', icon: '🐉', desc: 'Com o HP cheio, recebe metade do dano.' },
  filter: { name: 'Filtro', icon: '🧪', desc: 'Golpes super efetivos causam 25% menos.' },
  solid_rock: { name: 'Rocha Sólida', icon: '🪨', desc: 'Golpes super efetivos causam 25% menos.' },
  prism_armor: { name: 'Armadura Prisma', icon: '🔷', desc: 'Golpes super efetivos causam 25% menos.' },
  sturdy: { name: 'Robustez', icon: '🪨', desc: 'Com o HP cheio, aguenta qualquer golpe e fica com 1 HP.' },
  battle_armor: { name: 'Armadura de Batalha', icon: '🛡️', noCrit: true, desc: 'Não sofre crítico (o 🎲6 vira golpe normal).' },
  shell_armor: { name: 'Casco', icon: '🐚', noCrit: true, desc: 'Não sofre crítico (o 🎲6 vira golpe normal).' },
  unaware: { name: 'Indiferente', icon: '😶', desc: 'Ignora quando o adversário aumenta o próprio ataque.' },
  sand_veil: { name: 'Véu de Areia', icon: '🏜️', evade: 'sand', desc: 'Na tempestade de areia, os golpes contra ele erram mais (+1 no dado).' },
  snow_cloak: { name: 'Manto de Neve', icon: '🌨️', evade: 'snow', desc: 'Na nevasca, os golpes contra ele erram mais (+1 no dado).' },
  // 🌵 pune quem bate
  static: { name: 'Estática', icon: '⚡', contact: 'paralysis', desc: 'Quem acerta ele tem 30% de chance de ficar paralisado.' },
  flame_body: { name: 'Corpo Chamejante', icon: '🔥', contact: 'burn', desc: 'Quem acerta ele tem 30% de chance de se queimar.' },
  poison_point: { name: 'Ponto Venenoso', icon: '☠️', contact: 'poison', desc: 'Quem acerta ele tem 30% de chance de ser envenenado.' },
  effect_spore: { name: 'Esporos', icon: '🍄', contact: 'spore', desc: 'Quem acerta ele tem 30% de chance de ficar envenenado, paralisado ou dormindo.' },
  rough_skin: { name: 'Pele Áspera', icon: '🦈', recoil: 8, desc: 'Quem acerta ele perde 1/8 do HP.' },
  iron_barbs: { name: 'Farpas de Ferro', icon: '📌', recoil: 8, desc: 'Quem acerta ele perde 1/8 do HP.' },
  // 💪 ataque
  huge_power: { name: 'Força Enorme', icon: '💪', atk: 1.5, desc: 'Ataque ×1,5.' },
  pure_power: { name: 'Força Pura', icon: '🧘', atk: 1.5, desc: 'Ataque ×1,5.' },
  hustle: { name: 'Afobação', icon: '💨', atk: 1.4, missUp: 1, desc: 'Ataque +40%, mas todo golpe erra no 🎲1.' },
  guts: { name: 'Coragem', icon: '😤', desc: 'Com alguma condição (queimado, envenenado...), ataque ×1,5 e a queimadura não enfraquece.' },
  technician: { name: 'Técnico', icon: '🎯', desc: 'Golpes rápidos (poder 100% ou menos) causam +50%.' },
  tough_claws: { name: 'Garras Duras', icon: '🦀', desc: 'Todos os golpes de dano causam +20%.' },
  adaptability: { name: 'Adaptabilidade', icon: '🧬', desc: 'Golpes do próprio tipo ficam ainda mais fortes (STAB +50% em vez de +20%).' },
  sheer_force: { name: 'Força Bruta', icon: '🦍', desc: 'Golpes de dano +30%, mas nunca causam condição.' },
  serene_grace: { name: 'Graça Serena', icon: '🕊️', desc: 'Dobra a chance dos golpes causarem condição.' },
  moxie: { name: 'Ousadia', icon: '😈', desc: 'Ao derrubar um Pokémon, o ataque sobe.' },
  beast_boost: { name: 'Impulso Bestial', icon: '🌀', desc: 'Ao derrubar um Pokémon, o ataque sobe.' },
  justified: { name: 'Justiceiro', icon: '⚖️', desc: 'Quando leva um golpe Sombrio, o ataque sobe.' },
  defiant: { name: 'Desafiador', icon: '😠', desc: 'Quando o adversário baixa o ataque dele, o ataque sobe 2 níveis (no total, +1).' },
  competitive: { name: 'Competitivo', icon: '🏆', desc: 'Quando o adversário baixa o ataque dele, o ataque sobe 2 níveis (no total, +1).' },
  mold_breaker: { name: 'Quebra-Molde', icon: '🔨', desc: 'Ignora as habilidades de defesa do adversário (Levitação, Robustez, absorções...).' },
  // 🎲 dado
  super_luck: { name: 'Sorte Grande', icon: '🍀', desc: 'Crítico no 🎲5 ou 🎲6.' },
  sniper: { name: 'Atirador', icon: '🎯', desc: 'Crítico causa ×2 em vez de ×1,5.' },
  compound_eyes: { name: 'Olhos Compostos', icon: '👁️', desc: 'Golpes imprecisos erram 1 número a menos no dado.' },
  no_guard: { name: 'Sem Guarda', icon: '🥊', desc: 'Nenhum golpe erra — nem os dele, nem os contra ele.' },
  // 🧱 protege o ataque
  clear_body: { name: 'Corpo Puro', icon: '💎', guard: true, desc: 'O ataque dele não pode ser baixado (Intimidação, golpes de debuff).' },
  white_smoke: { name: 'Fumaça Branca', icon: '🌫️', guard: true, desc: 'O ataque dele não pode ser baixado.' },
  full_metal_body: { name: 'Corpo de Metal', icon: '🤖', guard: true, desc: 'O ataque dele não pode ser baixado.' },
  hyper_cutter: { name: 'Hipercortador', icon: '✂️', guard: true, desc: 'O ataque dele não pode ser baixado.' },
  inner_focus: { name: 'Foco Interior', icon: '🧘', desc: 'Imune à Intimidação.' },
  intimidate: { name: 'Intimidação', icon: '😠', desc: 'Ao entrar na batalha, o ataque do adversário cai um nível (−30%).' },
  // 💊 condições
  immunity: { name: 'Imunidade', icon: '💉', blocks: ['poison'], desc: 'Não pode ser envenenado.' },
  limber: { name: 'Flexível', icon: '🤸', blocks: ['paralysis'], desc: 'Não pode ser paralisado.' },
  insomnia: { name: 'Insônia', icon: '👀', blocks: ['sleep'], desc: 'Não pode dormir.' },
  vital_spirit: { name: 'Espírito Vital', icon: '✨', blocks: ['sleep'], desc: 'Não pode dormir.' },
  water_veil: { name: 'Véu d\'Água', icon: '💧', blocks: ['burn'], desc: 'Não pode se queimar.' },
  magma_armor: { name: 'Armadura de Magma', icon: '🌋', blocks: ['freeze'], desc: 'Não pode congelar.' },
  leaf_guard: { name: 'Folha Protetora', icon: '🍃', desc: 'No sol forte, não pega nenhuma condição.' },
  shield_dust: { name: 'Pó Escudo', icon: '🦋', desc: 'Golpes do adversário nunca causam condição nele.' },
  shed_skin: { name: 'Troca de Pele', icon: '🐍', desc: 'No fim de cada rodada, 30% de chance de curar a própria condição.' },
  natural_cure: { name: 'Cura Natural', icon: '🌸', desc: 'Ao sair da batalha (trocar), cura a própria condição.' },
  regenerator: { name: 'Regenerador', icon: '♻️', desc: 'Ao sair da batalha (trocar), recupera 1/3 do HP.' },
  ice_body: { name: 'Corpo de Gelo', icon: '🧊', heals: ['snow'], desc: 'Na nevasca, recupera 1/16 do HP por rodada.' },
  rain_dish: { name: 'Prato de Chuva', icon: '🌧️', heals: ['rain', 'storm'], desc: 'Na chuva, recupera 1/16 do HP por rodada.' },
  // 🌦️ velocidade no clima
  swift_swim: { name: 'Nado Veloz', icon: '🏊', fast: ['rain', 'storm'], desc: 'Na chuva/tempestade, velocidade ×2.' },
  chlorophyll: { name: 'Clorofila', icon: '☀️', fast: ['sun'], desc: 'No sol forte, velocidade ×2.' },
  sand_rush: { name: 'Corrida na Areia', icon: '🏜️', fast: ['sand'], desc: 'Na tempestade de areia, velocidade ×2.' },
  slush_rush: { name: 'Corrida na Neve', icon: '⛷️', fast: ['snow'], desc: 'Na nevasca, velocidade ×2.' },
  // 😴 lado ruim (Pokémon muito fortes nos jogos)
  truant: { name: 'Preguiça', icon: '🦥', desc: 'Só ataca uma rodada sim, outra não.' },
  slow_start: { name: 'Início Lento', icon: '🐢', desc: 'Nas 5 primeiras rodadas em campo, ataque pela metade.' }
};
export const PINCH_MULT = 1.5;
import { ABILITY_BY_DEX } from './abilitymap.js';
/** Habilidade da espécie (pela Pokédex; Megas usam a da forma base). */
export function abilityOf(sp) {
  const S = SPECIES[sp];
  if (!S) return null;
  const k = ABILITY_BY_DEX[(S.dex | 0) - 1];
  return k && ABILITIES[k] ? k : null;
}
