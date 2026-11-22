// 🏗️ v48 — Expansões da Fazenda compradas com OURO (preço sobe a cada compra). Ajudam a gastar o ouro que sobra.
import { slotsFor } from './farm.js';
import { plotsFor } from './garden.js';
import { benchesFor } from './workshop.js';
import { DECOR_MAX } from './farm.js';
import { INCUBATOR_MAX } from './daycare.js';

export const EXPANSIONS = {
  slots: { name: 'Vaga extra de Pokémon', icon: '🐾', prices: [5000, 12000, 25000, 50000], desc: '+1 Pokémon morando na Fazenda (além do que o nível dá).' },
  plots: { name: 'Canteiro extra', icon: '🌱', prices: [4000, 10000, 22000], desc: '+1 canteiro na Horta (além dos 8 do nível).' },
  bench: { name: 'Bancada extra na Oficina', icon: '🔨', prices: [20000, 45000], desc: '+1 bancada para fabricar ao mesmo tempo.' },
  decor: { name: 'Mais espaço de decoração', icon: '🎨', prices: [3000, 8000, 15000], desc: '+10 enfeites na Fazenda.' },
  incub: { name: 'Incubadora maior', icon: '🐣', prices: [8000, 20000], desc: '+1 ovo esperando na Creche.' }
};
export const expLevel = (farm, k) => Math.max(0, Math.min(EXPANSIONS[k]?.prices.length || 0, farm?.exp?.[k] || 0));
export const nextExpPrice = (farm, k) => EXPANSIONS[k]?.prices[expLevel(farm, k)] ?? null;
export const slotsMaxOf = farm => slotsFor(farm.lvl) + expLevel(farm, 'slots');
export const plotsMaxOf = farm => plotsFor(farm.lvl) + expLevel(farm, 'plots');
export const benchesOf = farm => benchesFor(farm.lvl) + expLevel(farm, 'bench');
export const decorMaxOf = farm => DECOR_MAX + 10 * expLevel(farm, 'decor');
export const incubMaxOf = farm => INCUBATOR_MAX + expLevel(farm, 'incub');
