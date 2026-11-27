// 🧭 v60 — Habilidades de campo: Pokémon da equipe ajudam no tabuleiro (fora da batalha), com recarga.
// v64: só Pokémon ESPECÍFICOS sabem cada habilidade (como nos jogos: quem aprende Teleport, Sweet Scent, Tailwind,
// Surf, Dig…), não mais o tipo. Formas regionais, Megas e Gigantamax herdam da espécie base.
// Para usar: ter na equipe um desses Pokémon, de pé (HP > 0), que obedeça e com nível mínimo. Uma por turno,
// antes de rolar o dado. Pensadas para ajudar sem quebrar o jogo: recarga longa e efeitos modestos.
import { getSpecies } from './pokemon.js';
import { canUse } from '../rules/helpers.js';

const SP = txt => new Set(txt.split(' '));
export const FIELD_SPECIES = {
  teleport: SP('abra kadabra alakazam mew mewtwo natu xatu ralts kirlia gardevoir gallade espeon drowzee hypno slowbro slowking girafarig farigiraf meditite medicham beldum metang metagross chimecho chingling bronzor bronzong elgyem beheeyem sigilyph gothita gothorita gothitelle solosis duosion reuniclus espurr meowstic hatenna hattrem hatterene indeedee jirachi celebi uxie mesprit azelf latias latios deoxys hoopa victini unown smoochum jynx mr_mime mime_jr exeggutor starmie porygon porygon2 porygon_z cresselia lunatone solrock baltoy claydol orbeetle dottler oranguru bruxish calyrex armarouge flittle espathra rabsca'),
  aroma: SP('oddish gloom vileplume bellossom bellsprout weepinbell victreebel bulbasaur ivysaur venusaur chikorita bayleef meganium roselia roserade budew combee vespiquen comfey spritzee aromatisse cherubi cherrim tropius sunkern sunflora hoppip skiploom jumpluff lilligant petilil floette florges flabebe bounsweet steenee tsareena cutiefly ribombee applin flapple appletun dipplin hydrapple shroomish breloom paras parasect vivillon beautifly butterfree illumise volbeat gossifleur eldegoss smoliv dolliv arboliva shaymin alcremie milcery slurpuff swirlix sewaddle swadloon leavanny cottonee whimsicott'),
  tailwind: SP('pidgey pidgeotto pidgeot spearow fearow charizard dragonite togekiss starly staravia staraptor fletchling fletchinder talonflame corviknight skarmory hoothoot noctowl taillow swellow rufflet braviary swablu altaria aerodactyl pidove tranquill unfezant wingull pelipper salamence flygon noivern articuno zapdos moltres lugia ho_oh rayquaza tornadus crobat golbat honchkrow murkrow mandibuzz vullaby toucannon pikipek trumbeak rookidee corvisquire kilowattrel wattrel bombirdier flamigo farfetchd doduo dodrio emolga hawlucha oricorio yveltal'),
  surf: SP('lapras gyarados vaporeon blastoise wartortle squirtle feraligatr croconaw totodile swampert marshtomp mudkip empoleon prinplup piplup samurott dewott oshawott greninja frogadier froakie primarina brionne popplio inteleon drizzile sobble quaquaval quaxwell quaxly milotic kingdra seadra horsea sharpedo carvanha wailord wailmer dewgong seel golduck psyduck tentacruel tentacool dragonair dratini lanturn chinchou mantine mantyke floatzel buizel walrein sealeo spheal kyogre suicune manaphy phione palkia relicanth gorebyss huntail clamperl staryu poliwrath poliwhirl poliwag politoed slowpoke azumarill marill dondozo wiglett wugtrio barraskewda arrokuda drednaw chewtle basculin basculegion alomomola jellicent frillish lumineon finneon seaking goldeen cloyster shellder kabutops omastar tatsugiri palafin finizen veluza'),
  dig: SP('diglett dugtrio sandshrew sandslash cubone marowak drilbur excadrill gible gabite garchomp phanpy donphan rhyhorn rhydon rhyperior sandile krokorok krookodile mudbray mudsdale wooper quagsire clodsire onix steelix geodude graveler golem nincada ninjask trapinch vibrava flygon hippopotas hippowdon gligar gliscor groudon landorus golett golurk rolycoly carkol coalossal silicobra sandaconda nacli naclstack garganacl orthworm great_tusk ting_lu larvitar pupitar tyranitar swinub piloswine mamoswine nosepass probopass zygarde torterra grotle turtwig camerupt numel barboach whiscash gastrodon shellos stunfisk palpitoad seismitoad'),
};
const knows = (sp, id) => { const set = FIELD_SPECIES[id]; return !!sp && !!set && (set.has(sp.id) || set.has(sp.form) || set.has(sp.megaBase) || set.has(sp.gmaxOf)); };

export const FIELD_SKILLS = {
  teleport: { name: 'Teletransporte', icon: '🌀', who: 'Abra, Alakazam, Gardevoir, Espeon, Metagross…', minLvl: 18, cd: 8, replacesRoll: true,
    desc: 'Leva você até uma cidade que você já visitou (no lugar de rolar o dado).' },
  aroma: { name: 'Aroma Doce', icon: '🌸', who: 'Oddish, Bulbasaur, Roselia, Combee, Comfey…', minLvl: 12, cd: 5, replacesRoll: true,
    desc: 'Atrai um Pokémon selvagem para a casa 🌿 onde você está (no lugar de rolar). 25% de vir de um tier acima.' },
  tailwind: { name: 'Vento a Favor', icon: '💨', who: 'Pidgeot, Charizard, Dragonite, Togekiss, Talonflame…', minLvl: 12, cd: 4, replacesRoll: false,
    desc: 'Sopra a seu favor: +2 casas na próxima rolagem.' },
  dig: { name: 'Escavar', icon: '⛏️', who: 'Diglett, Sandslash, Garchomp, Excadrill, Donphan…', minLvl: 15, cd: 7, replacesRoll: false,
    desc: 'Cava e acha um item (Poção, Pokébola, Great Ball, Reviver ou, raramente, um item de evolução).' },
  surf: { name: 'Surfar', icon: '🌊', who: 'Lapras, Gyarados, Blastoise, Milotic, Greninja…', minLvl: 15, cd: 5, replacesRoll: true,
    desc: 'Surfa com você: rola o dado duas vezes e fica com o maior.' }
};

/** Pokémon da equipe que pode usar a habilidade (o de maior nível), ou null. */
/** A espécie sabe a habilidade? */
export const speciesKnows = (spId, id) => knows(getSpecies(spId), id);

export function fieldUser(p, id) {
  const sk = FIELD_SKILLS[id];
  if (!sk || !p) return null;
  return [...(p.team || [])].filter(m => m.hp > 0 && m.lvl >= sk.minLvl && canUse(p, m) && knows(getSpecies(m.sp), id))
    .sort((a, b) => b.lvl - a.lvl)[0] || null;
}

/** Turnos que faltam para usar de novo (0 = pronto). */
export const fieldCooldown = (state, p, id) => Math.max(0, (p.fieldCd?.[id] || 0) - (state.turn || 0));

/** Lista para a interface: { id, ...skill, mon, wait }. */
export function fieldOptions(state, p) {
  return Object.entries(FIELD_SKILLS).map(([id, sk]) => ({ id, ...sk, mon: fieldUser(p, id), wait: fieldCooldown(state, p, id) })).filter(o => o.mon);
}
