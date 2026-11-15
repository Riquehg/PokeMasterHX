// Tabela oficial de efetividade (Geração 6+), 18 tipos.
// Chaves internas em inglês; rótulos em português só na interface.

export const TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'
];

export const TYPE_LABELS = {
  normal: 'Normal', fire: 'Fogo', water: 'Água', electric: 'Elétrico', grass: 'Grama',
  ice: 'Gelo', fighting: 'Lutador', poison: 'Veneno', ground: 'Terra', flying: 'Voador',
  psychic: 'Psíquico', bug: 'Inseto', rock: 'Pedra', ghost: 'Fantasma', dragon: 'Dragão',
  dark: 'Sombrio', steel: 'Aço', fairy: 'Fada'
};

export const TYPE_COLORS = {
  normal: '#A8A77A', fire: '#EE8130', water: '#6390F0', electric: '#F7D02C', grass: '#7AC74C',
  ice: '#96D9D6', fighting: '#C22E28', poison: '#A33EA1', ground: '#E2BF65', flying: '#A98FF3',
  psychic: '#F95587', bug: '#A6B91A', rock: '#B6A136', ghost: '#735797', dragon: '#6F35FC',
  dark: '#705746', steel: '#B7B7CE', fairy: '#D685AD'
};

// atacante -> { defensor: multiplicador } (ausente = 1)
const CHART = {
  normal:   { rock: 0.5, ghost: 0, steel: 0.5 },
  fire:     { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water:    { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass:    { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice:      { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison:   { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground:   { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying:   { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic:  { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug:      { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock:     { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost:    { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon:   { dragon: 2, steel: 0.5, fairy: 0 },
  dark:     { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel:    { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy:    { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 }
};

// Aceita rótulos antigos em português (com ou sem acento) para compatibilidade com saves antigos.
const ALIASES = {
  grama: 'grass', fogo: 'fire', agua: 'water', eletrico: 'electric', gelo: 'ice', lutador: 'fighting',
  veneno: 'poison', venenoso: 'poison', terra: 'ground', voador: 'flying', psiquico: 'psychic',
  inseto: 'bug', pedra: 'rock', fantasma: 'ghost', dragao: 'dragon', sombrio: 'dark', trevas: 'dark',
  aco: 'steel', fada: 'fairy'
};

export function normalizeType(t) {
  const k = String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (CHART[k]) return k;
  return ALIASES[k] || null;
}

/** Multiplicador de um tipo de ataque contra um tipo de defesa. */
export function single(attackType, defenseType) {
  const row = CHART[attackType];
  if (!row) return 1;
  const v = row[defenseType];
  return v === undefined ? 1 : v;
}

/** Multiplicador de um tipo de ataque contra um defensor (1 ou 2 tipos): produto, como nos jogos. */
export function against(attackType, defenderTypes) {
  return defenderTypes.reduce((m, d) => m * single(attackType, d), 1);
}

/**
 * O atacante usa o melhor dos seus tipos (golpe STAB mais efetivo).
 * Retorna { mult, type } — mult ∈ {0, 0.25, 0.5, 1, 2, 4}.
 */
export function bestAttack(attackerTypes, defenderTypes) {
  let best = { mult: -1, type: attackerTypes[0] };
  for (const a of attackerTypes) {
    const m = against(a, defenderTypes);
    if (m > best.mult) best = { mult: m, type: a };
  }
  return best;
}

export function effectivenessLabel(mult) {
  if (mult === 0) return 'Não afeta';
  if (mult >= 4) return 'Super efetivo x4!';
  if (mult >= 2) return 'Super efetivo!';
  if (mult <= 0.25) return 'Muito pouco efetivo';
  if (mult < 1) return 'Pouco efetivo';
  return '';
}
