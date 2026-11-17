// Companheiros: NPCs que acompanham o seu treinador e dão um bônus.
// Ganhos completando missões; ficam salvos na conta e você escolhe qual levar.
// sprite: caminho no bucket "sprites" (pasta/arquivo). Os líderes de Kanto usam os arquivos que já existem em leaders/.
export const COMPANIONS = {
  misty:   { name: 'Misty',      sprite: 'leaders/misty.png',      icon: '💧', bonus: { types: ['water'], dmg: 0.15 },               desc: '+15% de dano em golpes de Água' },
  brock:   { name: 'Brock',      sprite: 'leaders/Brock.png',      icon: '🪨', bonus: { types: ['rock', 'ground'], dmg: 0.15 },      desc: '+15% de dano em golpes de Pedra e Terra' },
  surge:   { name: 'Lt. Surge',  sprite: 'leaders/Lt. Surge.png',  icon: '⚡', bonus: { types: ['electric'], dmg: 0.15, inflict: 'electric' }, desc: '+15% em golpes Elétricos e mais chance de paralisar' },
  erika:   { name: 'Erika',      sprite: 'leaders/Erika.png',      icon: '🌿', bonus: { types: ['grass'], dmg: 0.15 },               desc: '+15% de dano em golpes de Planta' },
  koga:    { name: 'Koga',       sprite: 'leaders/Koga.png',       icon: '☠️', bonus: { types: ['poison'], dmg: 0.15, inflict: 'poison' }, desc: '+15% em golpes de Veneno e mais chance de envenenar' },
  blaine:  { name: 'Blaine',     sprite: 'leaders/Blaine.png',     icon: '🔥', bonus: { types: ['fire'], dmg: 0.15, inflict: 'fire' }, desc: '+15% em golpes de Fogo e mais chance de queimar' },
  sabrina: { name: 'Sabrina',    sprite: 'companions/sabrina.png', icon: '🔮', bonus: { types: ['psychic'], dmg: 0.15 },             desc: '+15% de dano em golpes Psíquicos' },
  lorelei: { name: 'Lorelei',    sprite: 'leaders/lorelei.png',    icon: '❄️', bonus: { types: ['ice'], dmg: 0.15, inflict: 'ice' }, desc: '+15% em golpes de Gelo e mais chance de congelar' },
  bruno:   { name: 'Bruno',      sprite: 'leaders/bruno.png',      icon: '🥊', bonus: { types: ['fighting'], dmg: 0.15 },            desc: '+15% de dano em golpes de Luta' },
  agatha:  { name: 'Agatha',     sprite: 'leaders/agatha.png',     icon: '👻', bonus: { types: ['ghost'], dmg: 0.15 },               desc: '+15% de dano em golpes Fantasma' },
  lance:   { name: 'Lance',      sprite: 'leaders/lance.png',      icon: '🐉', bonus: { types: ['dragon'], dmg: 0.15 },              desc: '+15% de dano em golpes de Dragão' },
  bugsy:   { name: 'Bugsy',      sprite: 'companions/bugsy.png',   icon: '🐛', bonus: { types: ['bug'], dmg: 0.15 },                 desc: '+15% de dano em golpes de Inseto' },
  falkner: { name: 'Falkner',    sprite: 'companions/falkner.png', icon: '🪶', bonus: { types: ['flying'], dmg: 0.15 },              desc: '+15% de dano em golpes Voadores' },
  whitney: { name: 'Whitney',    sprite: 'companions/whitney.png', icon: '⭐', bonus: { types: ['normal'], dmg: 0.15 },              desc: '+15% de dano em golpes Normais' },
  jasmine: { name: 'Jasmine',    sprite: 'companions/jasmine.png', icon: '⚙️', bonus: { types: ['steel'], dmg: 0.15 },               desc: '+15% de dano em golpes de Aço' },
  karen:   { name: 'Karen',      sprite: 'companions/karen.png',   icon: '🌑', bonus: { types: ['dark'], dmg: 0.15 },                desc: '+15% de dano em golpes Sombrios' },
  valerie: { name: 'Valerie',    sprite: 'companions/valerie.png', icon: '🧚', bonus: { types: ['fairy'], dmg: 0.15 },               desc: '+15% de dano em golpes de Fada' },
  oak:     { name: 'Prof. Oak',  sprite: 'companions/oak.png',     icon: '🎓', bonus: { xp: 1.25 },                                  desc: '+25% de XP para a equipe' },
  joy:     { name: 'Enfermeira Joy', sprite: 'companions/joy.png', icon: '💗', bonus: { potion: 1.5 },                               desc: 'Poções curam 50% a mais' },
  rocket:  { name: 'Jessie & James', sprite: 'trainers/rocket.png', icon: '🚀', bonus: { gold: 1.2 },                                desc: '+20% de ouro nas vitórias' }
};

/** Companheiro temático de cada tipo (prêmio das missões de tipo). */
export const COMPANION_BY_TYPE = {
  water: 'misty', rock: 'brock', ground: 'brock', electric: 'surge', grass: 'erika', poison: 'koga', fire: 'blaine', psychic: 'sabrina',
  ice: 'lorelei', fighting: 'bruno', ghost: 'agatha', dragon: 'lance', bug: 'bugsy', flying: 'falkner', normal: 'whitney', steel: 'jasmine',
  dark: 'karen', fairy: 'valerie'
};

export const getCompanion = id => (id && COMPANIONS[id]) || null;
