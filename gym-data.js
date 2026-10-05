// --- BASE DE DADOS DOS LÍDERES DE GINÁSIO (EMBUTIDO NO ENGINE) ---
const GYM_LEADERS_CATALOG = [
    { 
        city: "Pewter City", 
        leader: "Brock", 
        type: "Pedra", 
        badgeKey: "boulder",
        badgeName: "Insígnia da Rocha", 
        rewardGold: 300, 
        format: 1,
        pokemons: [
            { id: 'onix', name: "Onix", level: 3, str: 7, hp: 28, type: "Pedra/Terra", image: "assets/monsters/onix.png" }
        ] 
    },
    { 
        city: "Cerulean City", 
        leader: "Misty", 
        type: "Água", 
        badgeKey: "cascade",
        badgeName: "Insígnia da Cascata", 
        rewardGold: 400, 
        format: 1,
        pokemons: [
            { id: 'starmie', name: "Starmie", level: 4, str: 8, hp: 30, type: "Água/Psíquico", image: "assets/monsters/starmie.png" }
        ] 
    },
    { 
        city: "Vermilion City", 
        leader: "Lt. Surge", 
        type: "Elétrico", 
        badgeKey: "thunder",
        badgeName: "Insígnia do Trovão", 
        rewardGold: 500, 
        format: 3,
        pokemons: [
            { id: 'voltorb', name: "Voltorb", level: 4, str: 7, hp: 24, type: "Elétrico", image: "assets/monsters/100.png" },
            { id: 'raichu', name: "Raichu", level: 5, str: 9, hp: 32, type: "Elétrico", image: "assets/monsters/026.png" }
        ] 
    },
    { 
        city: "Celadon City", 
        leader: "Erika", 
        type: "Grama", 
        badgeKey: "rainbow",
        badgeName: "Insígnia do Arco-Íris", 
        rewardGold: 600, 
        format: 3,
        pokemons: [
            { id: 'tangela', name: "Tangela", level: 4, str: 7, hp: 25, type: "Grama", image: "assets/monsters/tangela.png" },
            { id: 'vileplume', name: "Vileplume", level: 5, str: 9, hp: 34, type: "Grama/Veneno", image: "assets/monsters/vileplume.png" }
        ] 
    },
    { 
        city: "Fuchsia City", 
        leader: "Koga", 
        type: "Veneno", 
        badgeKey: "soul",
        badgeName: "Insígnia da Alma", 
        rewardGold: 700, 
        format: 3,
        pokemons: [
            { id: 'koffing', name: "Koffing", level: 5, str: 8, hp: 28, type: "Veneno", image: "assets/monsters/koffing.png" },
            { id: 'weezing', name: "Weezing", level: 6, str: 10, hp: 36, type: "Veneno", image: "assets/monsters/weezing.png" }
        ] 
    },
    { 
        city: "Cinnabar Island", 
        leader: "Blaine", 
        type: "Fogo", 
        badgeKey: "volcano",
        badgeName: "Insígnia do Vulcão", 
        rewardGold: 850, 
        format: 3,
        pokemons: [
            { id: 'arcanine', name: "Arcanine", level: 6, str: 10, hp: 38, type: "Fogo", image: "assets/monsters/arcanine.png" },
            { id: 'magmar', name: "Magmar", level: 6, str: 10, hp: 35, type: "Fogo", image: "assets/monsters/magmar.png" }
        ]
    },
    { 
        city: "Indigo Plateau", 
        leader: "Blue / Campeão", 
        type: "Variado", 
        badgeKey: "volcano",
        badgeName: "Insígnia da Liga", 
        rewardGold: 1000, 
        format: 3,
        pokemons: [
            { id: 'arcanine', name: "Arcanine", level: 6, str: 10, hp: 35, type: "Fogo", image: "assets/monsters/arcanine.png" },
            { id: 'dragonite', name: "Dragonite", level: 7, str: 11, hp: 40, type: "Dragão/Voador", image: "assets/monsters/dragonite.png" }
        ] 
    }
];