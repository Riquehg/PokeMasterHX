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

export const ABILITIES = {
  intimidate: { name: 'Intimidação', icon: '😠', desc: 'Ao entrar na batalha, o ataque do adversário cai um nível (−30%).' },
  levitate: { name: 'Levitação', icon: '🎈', desc: 'Flutua: imune a golpes de Terra.' },
  sturdy: { name: 'Robustez', icon: '🪨', desc: 'Com o HP cheio, aguenta qualquer golpe e fica com 1 HP.' },
  blaze: { name: 'Chama', icon: '🔥', pinch: 'fire', desc: 'Com 1/3 do HP ou menos, golpes de Fogo causam +50%.' },
  torrent: { name: 'Torrente', icon: '🌊', pinch: 'water', desc: 'Com 1/3 do HP ou menos, golpes de Água causam +50%.' },
  overgrow: { name: 'Supercrescimento', icon: '🌿', pinch: 'grass', desc: 'Com 1/3 do HP ou menos, golpes de Planta causam +50%.' }
};
export const PINCH_MULT = 1.5;

const LISTS = {
  intimidate: 'ekans arbok growlithe arcanine tauros gyarados hitmontop snubbull granbull stantler mightyena masquerain salamence shinx luxio luxray staravia staraptor herdier stoutland sandile krokorok krookodile scraggy scrafty litten torracat incineroar',
  levitate: 'gastly haunter gengar koffing weezing misdreavus mismagius unown vibrava flygon lunatone solrock baltoy claydol duskull chimecho chingling bronzor bronzong carnivine rotom uxie mesprit azelf cresselia latias latios tynamo eelektrik eelektross cryogonal hydreigon',
  sturdy: 'geodude graveler golem magnemite magneton magnezone onix steelix sudowoodo bonsly shuckle pineco forretress skarmory nosepass probopass aron lairon aggron regirock relicanth shieldon bastiodon tirtouga carracosta roggenrola boldore gigalith sawk carbink'
};
const BY_SP = {};
for (const [ab, s] of Object.entries(LISTS)) for (const sp of s.split(' ')) if (SPECIES[sp]) BY_SP[sp] = ab;
// iniciais (e as evoluções deles): Chama / Torrente / Supercrescimento
const STARTERS = 'bulbasaur charmander squirtle chikorita cyndaquil totodile treecko torchic mudkip turtwig chimchar piplup snivy tepig oshawott chespin fennekin froakie rowlet litten popplio';
for (const base of STARTERS.split(' ')) {
  let sp = base, guard = 0;
  while (sp && SPECIES[sp] && guard++ < 4) {
    const t = SPECIES[base].types[0];
    if (!BY_SP[sp]) BY_SP[sp] = t === 'fire' ? 'blaze' : t === 'water' ? 'torrent' : 'overgrow';
    sp = SPECIES[sp].evolvesTo;
  }
}
/** Habilidade da espécie (Megas usam a da base). */
export function abilityOf(sp) {
  if (!sp) return null;
  return BY_SP[sp] || (SPECIES[sp]?.megaBase && BY_SP[SPECIES[sp].megaBase]) || null;
}
export const ABILITY_SPECIES = BY_SP;
