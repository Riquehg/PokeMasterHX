// Gera shared/data/dexdata.js — Pokédex completa (Gen 1–9 + formas regionais e de batalha) a partir dos CSVs do PokeAPI
// (scripts/data/pokeapi/) e da lista de sprites do Pokémon HOME (scripts/data/sprites-home.txt).
// As 806 espécies que já existiam mantêm id, nome, tier, HP e força (equilíbrio do jogo); muda só a evolução (agora fiel).
// Uso: node scripts/build-dex.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = f => join(root, 'scripts/data/pokeapi', f);
const csv = f => {
  const [head, ...lines] = readFileSync(P(f), 'utf8').replace(/\r/g, '').split('\n').filter(Boolean);
  const h = head.split(',');
  return lines.map(l => { const c = l.split(','); const o = {}; h.forEach((k, i) => (o[k] = c[i] ?? '')); return o; });
};
const OLD = (await import(join(root, 'scripts/data/dexold.mjs'))).OLD_RAW; // catálogo antigo (806)
const { ABILITIES } = await import(join(root, 'shared/data/battlegear.js'));

const pokemon = csv('pokemon.csv');
const species = csv('pokemon_species.csv');
const forms = csv('pokemon_forms.csv');
const evo = csv('pokemon_evolution.csv');
const typesCsv = csv('pokemon_types.csv');
const stats = csv('pokemon_stats.csv');
const pab = csv('pokemon_abilities.csv');
const abil = csv('abilities.csv');
const names = csv('pokemon_species_names.csv');
const sprites = new Set(readFileSync(join(root, 'scripts/data/sprites-home.txt'), 'utf8').split('\n').map(s => s.trim()).filter(Boolean));

const TYPE = ['', 'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy'];
const spById = Object.fromEntries(species.map(s => [s.id, s]));
const pkById = Object.fromEntries(pokemon.map(p => [p.id, p]));
const formToPk = Object.fromEntries(forms.map(f => [f.id, f.pokemon_id]));
const enName = {};
for (const n of names) if (n.local_language_id === '9') enName[n.pokemon_species_id] = n.name;
const typesOf = {};
for (const t of typesCsv) (typesOf[t.pokemon_id] ||= [])[+t.slot - 1] = TYPE[+t.type_id];
const st = {};
for (const s of stats) (st[s.pokemon_id] ||= {})[s.stat_id] = +s.base_stat;
const bst = pid => Object.values(st[pid] || {}).reduce((a, b) => a + b, 0);
const defAvg = pid => Math.round(((st[pid]?.[3] || 60) + (st[pid]?.[5] || 60)) / 2);
const abName = Object.fromEntries(abil.map(a => [a.id, a.identifier.replace(/-/g, '_')]));
const abOf = pid => {
  const list = pab.filter(a => a.pokemon_id === String(pid)).sort((a, b) => +a.slot - +b.slot).map(a => abName[a.ability_id]);
  return list.find(k => ABILITIES[k]) || '';
};

// ---------------------------------------------------------------- espécies base
const OLD_BY_DEX = {};
for (const r of OLD) OLD_BY_DEX[r[0]] = r;
const slug = s => s.replace(/-/g, '_');
const stemOf = ident => ident.replace(/-/g, '');                   // mr-mime → mrmime (nome do arquivo do HOME)
const defaultPk = {};                                                // species id → pokemon id padrão
for (const p of pokemon) if (p.is_default === '1') defaultPk[p.species_id] = p.id;

const out = [];        // linhas finais
const byPk = {};       // pokemon id → id do jogo
const rowById = {};
// v59: Paradoxos "lendários" de Scarlet/Violet (versões dos lendários) também contam como Lendários (tier 5)
const PARADOX_LEGEND = ['walking-wake', 'iron-leaves', 'gouging-fire', 'raging-bolt', 'iron-boulder', 'iron-crown'];
const legendFlag = sp => sp.is_legendary === '1' || sp.is_mythical === '1' || PARADOX_LEGEND.includes(sp.identifier);
const ULTRA = ['nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana', 'guzzlord', 'poipole', 'naganadel', 'stakataka', 'blacephalon'];

for (const s of species) {
  const dex = +s.id;
  const pk = defaultPk[s.id];
  const o = OLD_BY_DEX[dex];
  const row = { dex, pk, stem: stemOf(s.identifier), gen: +s.generation_id, myth: s.is_mythical === '1' };
  if (o) {
    Object.assign(row, { id: o[1], name: o[2], types: o[3].split('/'), tier: o[4], hp: o[5], str: o[6], legendary: !!o[9], role: o[10], oldEvo: o[7], oldLvl: o[8] });
    if (legendFlag(s) && (!row.legendary || row.tier !== 5)) { // v59: lendário oficial que estava em tier menor (ex.: Type: Null, Silvally)
      const B = bst(pk);
      Object.assign(row, { legendary: true, tier: 5, hp: Math.max(row.hp, Math.round((0.065 * B - 4.5) * 1.15)), str: Math.max(row.str, Math.round(B / 60 - 0.8)) });
    }
  } else {
    const B = bst(pk), L = legendFlag(s);
    const evolves = species.some(x => x.evolves_from_species_id === s.id);
    const isBasic = !s.evolves_from_species_id;
    let tier, hp, str;
    if (L) { tier = 5; hp = Math.round((0.065 * B - 4.5) * 1.15); str = Math.round(B / 60 - 0.8); }
    else {
      tier = B >= 580 || (!evolves && B >= 515) ? 4 : B >= 450 ? 3 : B >= 330 ? 2 : 1;
      if (isBasic && tier > 1 && evolves) tier = Math.min(tier, 2);
      hp = Math.max(12, Math.round(0.065 * B - 4.5));
      str = Math.max(3, Math.round(B / 60 - 1.3));
    }
    Object.assign(row, { id: slug(s.identifier), name: enName[s.id] || s.identifier, types: typesOf[pk].filter(Boolean), tier, hp, str, legendary: L, role: null, def: defAvg(pk), ab: abOf(pk) });
  }
  out.push(row); rowById[row.id] = row; byPk[pk] = row.id;
}

// ---------------------------------------------------------------- formas que viram espécies
const REGION = { alola: 'de Alola', galar: 'de Galar', hisui: 'de Hisui', paldea: 'de Paldea' };
const FORM_SPECIES = {
  // pokemon identifier: [sufixo do id, nome, sufixo do arquivo]
  'deoxys-attack': ['attack', 'Deoxys Ataque'], 'deoxys-defense': ['defense', 'Deoxys Defesa'], 'deoxys-speed': ['speed', 'Deoxys Velocidade'],
  'wormadam-sandy': ['sandy', 'Wormadam Areia'], 'wormadam-trash': ['trash', 'Wormadam Lixo'],
  'shaymin-sky': ['sky', 'Shaymin Céu'], 'giratina-origin': ['origin', 'Giratina Origem'],
  'dialga-origin': ['origin', 'Dialga Origem'], 'palkia-origin': ['origin', 'Palkia Origem'],
  'rotom-heat': ['heat', 'Rotom Calor'], 'rotom-wash': ['wash', 'Rotom Lavagem'], 'rotom-frost': ['frost', 'Rotom Gélido'],
  'rotom-fan': ['fan', 'Rotom Ventilador'], 'rotom-mow': ['mow', 'Rotom Corte'],
  'basculin-white-striped': ['white_striped', 'Basculin Listra Branca', 'whitestriped'],
  'tornadus-therian': ['therian', 'Tornadus Therian'], 'thundurus-therian': ['therian', 'Thundurus Therian'],
  'landorus-therian': ['therian', 'Landorus Therian'], 'enamorus-therian': ['therian', 'Enamorus Therian'],
  'kyurem-black': ['black', 'Kyurem Negro'], 'kyurem-white': ['white', 'Kyurem Branco'],
  'hoopa-unbound': ['unbound', 'Hoopa Libertado'],
  'lycanroc-midnight': ['midnight', 'Lycanroc Meia-Noite'], 'lycanroc-dusk': ['dusk', 'Lycanroc Crepúsculo'],
  'oricorio-pom-pom': ['pom_pom', 'Oricorio Pompom', 'pompom'], 'oricorio-pau': ['pau', "Oricorio Pa'u"], 'oricorio-sensu': ['sensu', 'Oricorio Sensu'],
  'necrozma-dusk': ['dusk_mane', 'Necrozma Juba Crepuscular', 'duskmane'], 'necrozma-dawn': ['dawn_wings', 'Necrozma Asas da Alvorada', 'dawnwings'],
  'zygarde-10': ['10', 'Zygarde 10%', '10'], 'zygarde-complete': ['complete', 'Zygarde Completo'],
  'calyrex-ice': ['ice', 'Calyrex Cavaleiro de Gelo'], 'calyrex-shadow': ['shadow', 'Calyrex Cavaleiro Sombrio'],
  'urshifu-rapid-strike': ['rapid_strike', 'Urshifu Golpe Fluido', 'rapidstrike'],
  'zacian-crowned': ['crowned', 'Zacian Espada Coroada'], 'zamazenta-crowned': ['crowned', 'Zamazenta Escudo Coroado'],
  'toxtricity-low-key': ['low_key', 'Toxtricity Grave', 'lowkey'],
  'ursaluna-bloodmoon': ['bloodmoon', 'Ursaluna Lua de Sangue'],
  'ogerpon-wellspring-mask': ['wellspring', 'Ogerpon Máscara Nascente', 'wellspring'],
  'ogerpon-hearthflame-mask': ['hearthflame', 'Ogerpon Máscara Fornalha', 'hearthflame'],
  'ogerpon-cornerstone-mask': ['cornerstone', 'Ogerpon Máscara Alicerce', 'cornerstone']
};
const TAUROS = { 'tauros-paldea-combat-breed': ['paldea_combat', 'Tauros de Paldea (Combate)', 'paldeacombat'],
  'tauros-paldea-blaze-breed': ['paldea_blaze', 'Tauros de Paldea (Chamas)', 'paldeablaze'],
  'tauros-paldea-aqua-breed': ['paldea_aqua', 'Tauros de Paldea (Água)', 'paldeaaqua'] };
for (const p of pokemon) {
  if (p.is_default === '1') continue;
  let def = FORM_SPECIES[p.identifier] || TAUROS[p.identifier];
  const m = p.identifier.includes('totem') ? null : /^(.+?)-(alola|galar|hisui|paldea)(-standard)?$/.exec(p.identifier);
  const base = rowById[byPk[defaultPk[p.species_id]]];
  if (!def && m) def = [m[2], `${base.name} ${REGION[m[2]]}`, m[2]];
  if (!def) continue;
  const [suf, name, fileSuf] = def;
  const B0 = bst(base.pk), B = bst(p.id), k = B0 ? B / B0 : 1;
  const row = {
    dex: base.dex, pk: p.id, id: `${base.id}_${suf}`, name, types: typesOf[p.id].filter(Boolean),
    tier: base.tier, hp: Math.max(10, Math.round(base.hp * k)), str: Math.max(3, Math.round(base.str * k * 10) / 10),
    legendary: base.legendary, role: base.role, def: defAvg(p.id), ab: abOf(p.id), gen: base.gen, myth: base.myth,
    stem: `${base.stem}-${fileSuf || suf.replace(/_/g, '')}`, form: base.id, region: m ? m[2] : null
  };
  // regionais básicos que ainda evoluem ficam no tier do básico; os demais seguem o BST
  out.push(row); rowById[row.id] = row; byPk[p.id] = row.id;
}

// ---------------------------------------------------------------- ☠️ lendários corrompidos (v58, pedido do usuário — não existem nos jogos principais)
// formas extras sem versão shiny; sprite própria em pokemon/<arquivo>.png (sem ela, usa a da espécie base)
const CORRUPT = [
  { base: 'mewtwo', id: 'mewtwo_armor', name: 'Mewtwo Armadura', types: ['psychic', 'steel'], file: 'mewtwo-armor', hp: 1.12, str: 1.0, def: 30 },
  { base: 'mewtwo', id: 'mewtwo_shadow', name: 'Mewtwo Sombrio', types: ['psychic', 'dark'], file: 'mewtwo-shadow', hp: 1.0, str: 1.15, def: 0 },
  { base: 'lugia', id: 'lugia_shadow', name: 'Lugia Sombrio', types: ['dark', 'flying'], file: 'lugia-shadow', hp: 1.0, str: 1.15, def: 0 }
];
for (const c of CORRUPT) {
  const b = rowById[c.base];
  const row = { dex: b.dex, pk: b.pk, id: c.id, name: c.name, types: c.types, tier: 5, hp: Math.round(b.hp * c.hp), str: Math.round(b.str * c.str * 10) / 10,
    legendary: true, role: c.id.endsWith('shadow') ? null : b.role, def: defAvg(b.pk) + c.def, ab: abOf(b.pk), gen: b.gen, myth: false, stem: c.file, form: b.id, region: null, corrupt: true };
  out.push(row); rowById[row.id] = row;
}

// ---------------------------------------------------------------- arquivos de sprite
const miss = [];
for (const r of out) {
  if (!sprites.has(r.stem) && !r.corrupt) miss.push(`${r.id} (${r.stem})`);
  r.fem = sprites.has(`${r.stem}-f`) ? 1 : 0;
  r.gmax = sprites.has(`${r.stem}-gmax`) ? 1 : 0;
}
// variações só visuais: <stem>-<x> que não é forma-espécie, nem fêmea, Mega, Gigantamax, Totem ou forma de batalha
const NOT_VARIANT = /^(f|mega.*|gmax|.*totem|blade|zen|galarzen|pirouette|busted.*|school|noice|hangry|gulping|gorging|sunny|rainy|snowy|sunshine|hero|ash|bond|eternamax|ultra|stellar|terastal|.*tera|meteor|eternal|starter.*|primal|lowkey-gmax|rapidstrike-gmax)$/;
const usedStems = new Set(out.map(r => r.stem));
for (const r of out.filter(x => !x.form)) {
  if (['arceus', 'silvally'].includes(r.id)) continue; // tipo muda com a Placa/Memória: fica para depois
  const v = [...sprites].filter(f => f.startsWith(r.stem + '-') && !usedStems.has(f)).map(f => f.slice(r.stem.length + 1))
    .filter(x => !NOT_VARIANT.test(x) && !x.startsWith('f-') && !x.endsWith('-f'));
  if (v.length) r.variants = v;
}

// ---------------------------------------------------------------- evoluções (fiéis aos jogos)
const ITEM = {
  80: 'sun_stone', 81: 'moon_stone', 82: 'fire_stone', 83: 'thunder_stone', 84: 'water_stone', 85: 'leaf_stone', 107: 'shiny_stone',
  108: 'dusk_stone', 109: 'dawn_stone', 885: 'ice_stone', 110: 'oval_stone', 198: 'kings_rock', 203: 'deep_sea_tooth', 204: 'deep_sea_scale',
  210: 'metal_coat', 212: 'dragon_scale', 229: 'up_grade', 298: 'protector', 299: 'electirizer', 300: 'magmarizer', 301: 'dubious_disc',
  302: 'reaper_cloth', 303: 'razor_claw', 304: 'razor_fang', 580: 'prism_scale', 686: 'whipped_dream', 687: 'sachet',
  1167: 'strawberry_sweet', 1168: 'strawberry_sweet', 1169: 'strawberry_sweet', 1170: 'strawberry_sweet', 1171: 'strawberry_sweet', 1172: 'strawberry_sweet', 1173: 'strawberry_sweet',
  1174: 'sweet_apple', 1175: 'tart_apple', 1311: 'cracked_pot', 1312: 'cracked_pot', 1633: 'galarica_cuff', 1643: 'galarica_wreath',
  1675: 'scroll_of_darkness', 1676: 'scroll_of_waters', 1677: 'malicious_armor', 2045: 'auspicious_armor', 2109: 'syrupy_apple',
  2110: 'unremarkable_teacup', 2111: 'unremarkable_teacup', 2160: 'linking_cord', 2230: 'black_augurite', 2231: 'peat_block', 2232: 'metal_alloy'
};
const sidOfForm = (formId, speciesId) => {
  if (formId) { const pk = formToPk[formId]; if (byPk[pk]) return byPk[pk]; }
  return byPk[defaultPk[speciesId]];
};
const edges = {};       // `${from}>${to}` → melhor aresta
const rank = e => (e.item ? 3 : e.lvl && !e.fb ? 2 : 1);
const unknownItems = new Set();
for (const r of evo) {
  const toSp = r.evolved_species_id;
  const fromSp = spById[toSp]?.evolves_from_species_id;
  if (!fromSp) continue;
  const trig = +r.evolution_trigger_id;
  if ([4, 6, 7].includes(trig)) continue;                                   // Shedinja; torre do Urshifu (os pergaminhos já vêm em outra linha)
  const reqPk = r.required_pokemon_form_id ? formToPk[r.required_pokemon_form_id] : null;
  if (r.region_id && (!reqPk || pkById[reqPk]?.is_default === '1')) continue; // evolução regional de um básico comum (ex.: Pikachu → Raichu de Alola em Alola)
  const from = sidOfForm(r.required_pokemon_form_id, fromSp);
  const to = sidOfForm(r.evolved_pokemon_form_id, toSp);
  if (!from || !to || from === to) continue;
  const e = { to };
  if ((trig === 1 || trig === 10) && r.held_item_id && ITEM[r.held_item_id]) { // v59: "sobe de nível segurando X" → só com o item (Sneasel, Gligar, Happiny...)
    e.item = ITEM[r.held_item_id];
  } else if (trig === 1 || trig === 10) {
    if (r.minimum_level) e.lvl = +r.minimum_level; else e.fb = 1;
    if (r.time_of_day === 'day' || r.time_of_day === 'night') e.time = r.time_of_day;
  } else if (trig === 2) e.item = r.held_item_id ? ITEM[r.held_item_id] : 'linking_cord';
  else if (trig === 3) e.item = ITEM[r.trigger_item_id];
  else if (trig === 5) e.item = 'strawberry_sweet';
  else e.fb = 1;                                                            // condições especiais (golpes críticos, estilo etc.) → nível
  if ((trig === 2 && r.held_item_id && !ITEM[r.held_item_id]) || (trig === 3 && !ITEM[r.trigger_item_id])) { unknownItems.add(r.held_item_id || r.trigger_item_id); continue; }
  if (r.gender_id === '1') e.sex = 'f'; else if (r.gender_id === '2') e.sex = 'm';
  // forma só visual do básico pedida (ex.: Burmy Areia → Wormadam Areia; Rockruff Ritmo Próprio → Lycanroc Crepúsculo)
  const reqForm = forms.find(f => f.id === r.required_pokemon_form_id);
  const fromRow = rowById[from];
  if (reqForm && reqForm.form_identifier && rowById[to]?.form) {
    const vv = { 'own-tempo': 'dusk' }[reqForm.form_identifier] || reqForm.form_identifier.replace(/-/g, '');
    if ((fromRow.variants || []).includes(vv)) e.v = vv;
  }
  const k = `${from}>${to}`;
  if (edges[k] && edges[k].sex && e.sex && edges[k].sex !== e.sex) { delete edges[k].sex; continue; } // as duas formas de sexo viram a mesma espécie
  if (!edges[k] || rank(e) > rank(edges[k])) edges[k] = { ...e, from };
}
// nível das evoluções "por amizade/condição especial": o do jogo antigo quando havia, senão 25 (básico) / 40 (estágio 2)
const evoFrom = {};
for (const e of Object.values(edges)) {
  const F = rowById[e.from];
  if (e.fb) {
    e.lvl = F.oldEvo === e.to && F.oldLvl ? F.oldLvl : (F.oldLvl || (Object.values(edges).some(x => x.to === e.from) ? 40 : 25));
    delete e.fb;
  }
  const { from, ...rest } = e;
  (evoFrom[from] ||= []).push(rest);
}
// regionais sem linha própria de evolução herdam a do básico, se o alvo regional existir (ex.: Growlithe de Hisui → Arcanine de Hisui)
for (const r of out.filter(x => x.region)) {
  if (evoFrom[r.id]) continue;
  const baseEv = evoFrom[r.form] || [];
  for (const e of baseEv) {
    const t = `${e.to}_${r.region}`;
    if (rowById[t]) (evoFrom[r.id] ||= []).push({ ...e, to: t });
  }
}
// v59: Eevee só evolui com item (nos jogos Espeon/Umbreon/Sylveon são por amizade — aqui viram Sol/Lua/Brilhante,
// como em vários jogos de fã), para não virar um deles sozinho ao subir de nível
const EEVEE_ITEM = { espeon: 'sun_stone', umbreon: 'moon_stone', sylveon: 'shiny_stone' };
for (const e of evoFrom.eevee || []) if (EEVEE_ITEM[e.to]) { e.item = EEVEE_ITEM[e.to]; delete e.lvl; delete e.time; }
for (const r of out) r.evos = evoFrom[r.id] || [];

// ---------------------------------------------------------------- saída
const pad = n => String(n);
const lines = out.map(r => {
  const x = {};
  if (r.def != null) x.d = r.def;
  if (r.ab != null) x.a = r.ab;
  if (r.evos.length) x.e = r.evos;
  if (r.stem !== r.id.replace(/_/g, '')) x.f = r.stem;
  if (r.form) x.fm = r.form;
  if (r.region) x.rg = r.region;
  if (r.variants) x.v = r.variants;
  if (r.fem) x.fe = 1;
  if (r.gmax) x.gx = 1;
  if (r.myth) x.my = 1;
  const gr = +spById[String(r.dex)].gender_rate; // −1 sem sexo · 0 só machos · 8 só fêmeas · n = n/8 fêmeas
  if (gr !== 4) x.gr = gr;
  if (ULTRA.includes(r.id)) x.ub = 1;
  if (r.corrupt) x.cr = 1; // ☠️ corrompido: sem shiny
  x.g = r.gen;
  return '  ' + JSON.stringify([r.dex, r.id, r.name, r.types.join('/'), r.tier, r.hp, r.str, r.legendary ? 1 : 0, r.role || null, x]);
});
const src = `// Catálogo de espécies — Pokédex nacional #001–#${pad(Math.max(...out.map(r => r.dex)))} + formas regionais e de batalha.
// GERADO por scripts/build-dex.mjs (dados do PokeAPI + sprites do Pokémon HOME). Não edite à mão.
// [dex, id, nome, tipos, tier, hpBase, forçaBase, lendário, papel, extras]
// extras: d = DEF base, a = habilidade, e = evoluções [{to, lvl?, item?, sex?, time?}], f = arquivo da sprite (sem .png),
//         fm = forma de (espécie base), rg = região, v = variações visuais, fe = tem sprite de fêmea, gx = tem Gigantamax,
//         my = mítico, ub = ultracriatura, cr = corrompido (sem shiny), gr = proporção de fêmeas em oitavos (−1 sem sexo; padrão 4), g = geração
export const DEX_RAW = [
${lines.join(',\n')}
];
`;
writeFileSync(join(root, 'shared/data/dexdata.js'), src);
const c = {}; out.forEach(r => (c[r.tier] = (c[r.tier] || 0) + 1));
console.log('espécies:', out.length, '(formas:', out.filter(r => r.form).length + ')', 'por tier:', c);
console.log('sem sprite:', miss.length, miss.join(', '));
console.log('itens desconhecidos:', [...unknownItems].join(' '));
console.log('com variações:', out.filter(r => r.variants).map(r => `${r.id}(${r.variants.length})`).join(' '));
