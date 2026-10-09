// --- src/systems/gym.js ---
// Subsistema de Ginásios Oficiais e Líderes de Kanto com Insígnias e Arena

import { gameState, getCurrentPlayer } from '../core/state.js';
import { SUPABASE_STORAGE_URL } from '../config/constants.js';
import { saveGameProgress } from '../core/storage.js';
import { emitSocket } from '../core/socket.js';

let currentGymBattleSession = null;
let gymAttemptedThisTurn = {}; 

export const GYM_LEADERS_CATALOG = [
    { 
        city: "Pewter City", 
        leader: "Brock", 
        type: "Pedra", 
        badgeKey: "boulder",
        badgeName: "Insígnia da Rocha", 
        badgeIcon: `${SUPABASE_STORAGE_URL}sprites/badges/boulder.png`,
        rewardGold: 300, 
        format: 1,
        pokemons: [
            { id: 'onix', name: "Onix", level: 3, str: 6, hp: 24, maxHp: 24, currentHp: 24, type: "Pedra/Terra", image: `${SUPABASE_STORAGE_URL}monsters/095.png` }
        ] 
    },
    { 
        city: "Cerulean City", 
        leader: "Misty", 
        type: "Água", 
        badgeKey: "cascade",
        badgeName: "Insígnia da Cascata", 
        badgeIcon: `${SUPABASE_STORAGE_URL}sprites/badges/cascade.png`,
        rewardGold: 400, 
        format: 1,
        pokemons: [
            { id: 'starmie', name: "Starmie", level: 4, str: 7, hp: 28, maxHp: 28, currentHp: 28, type: "Água/Psíquico", image: `${SUPABASE_STORAGE_URL}monsters/121.png` }
        ] 
    },
    { 
        city: "Vermilion City", 
        leader: "Lt. Surge", 
        type: "Elétrico", 
        badgeKey: "thunder",
        badgeName: "Insígnia do Trovão", 
        badgeIcon: `${SUPABASE_STORAGE_URL}sprites/badges/thunder.png`,
        rewardGold: 500, 
        format: 2,
        pokemons: [
            { id: 'voltorb', name: "Voltorb", level: 4, str: 7, hp: 26, maxHp: 26, currentHp: 26, type: "Elétrico", image: `${SUPABASE_STORAGE_URL}monsters/101.png` },
            { id: 'raichu', name: "Raichu", level: 5, str: 8, hp: 32, maxHp: 32, currentHp: 32, type: "Elétrico", image: `${SUPABASE_STORAGE_URL}monsters/026.png` }
        ] 
    },
    { 
        city: "Celadon City", 
        leader: "Erika", 
        type: "Grama", 
        badgeKey: "rainbow",
        badgeName: "Insígnia do Arco-Íris", 
        badgeIcon: `${SUPABASE_STORAGE_URL}sprites/badges/rainbow.png`,
        rewardGold: 600, 
        format: 2,
        pokemons: [
            { id: 'tangela', name: "Tangela", level: 5, str: 8, hp: 30, maxHp: 30, currentHp: 30, type: "Grama", image: `${SUPABASE_STORAGE_URL}monsters/114.png` },
            { id: 'vileplume', name: "Vileplume", level: 6, str: 9, hp: 36, maxHp: 36, currentHp: 36, type: "Grama/Veneno", image: `${SUPABASE_STORAGE_URL}monsters/045.png` }
        ] 
    },
    { 
        city: "Fuchsia City", 
        leader: "Koga", 
        type: "Veneno", 
        badgeKey: "soul",
        badgeName: "Insígnia da Alma", 
        badgeIcon: `${SUPABASE_STORAGE_URL}sprites/badges/soul.png`,
        rewardGold: 700, 
        format: 2,
        pokemons: [
            { id: 'koffing', name: "Koffing", level: 5, str: 8, hp: 30, maxHp: 30, currentHp: 30, type: "Veneno", image: `${SUPABASE_STORAGE_URL}monsters/109.png` },
            { id: 'weezing', name: "Weezing", level: 6, str: 9, hp: 38, maxHp: 38, currentHp: 38, type: "Veneno", image: `${SUPABASE_STORAGE_URL}monsters/110.png` }
        ] 
    },
    { 
        city: "Cinnabar Island", 
        leader: "Blaine", 
        type: "Fogo", 
        badgeKey: "volcano",
        badgeName: "Insígnia do Vulcão", 
        badgeIcon: `${SUPABASE_STORAGE_URL}sprites/badges/volcano.png`,
        rewardGold: 850, 
        format: 2,
        pokemons: [
            { id: 'arcanine', name: "Arcanine", level: 6, str: 9, hp: 38, maxHp: 38, currentHp: 38, type: "Fogo", image: `${SUPABASE_STORAGE_URL}monsters/059.png` },
            { id: 'magmar', name: "Magmar", level: 6, str: 9, hp: 36, maxHp: 36, currentHp: 36, type: "Fogo", image: `${SUPABASE_STORAGE_URL}monsters/126.png` }
        ]
    }
];

export function initiateGymSequence(cityName) {
    const cp = getCurrentPlayer();
    const gymInfo = GYM_LEADERS_CATALOG.find(g => g.city.toLowerCase() === cityName.toLowerCase());
    
    if (!gymInfo) return;

    currentGymBattleSession = {
        gym: gymInfo,
        format: gymInfo.format || 1,
        challengerTeam: []
    };

    showGymVsScreen(gymInfo);
}

function showGymVsScreen(gymInfo) {
    let vsModal = document.getElementById('gym-vs-modal');
    if (!vsModal) {
        vsModal = document.createElement('div');
        vsModal.id = 'gym-vs-modal';
        vsModal.className = 'fixed inset-0 bg-black/95 z-[450] flex flex-col items-center justify-center p-6 text-white backdrop-blur-md';
        document.body.appendChild(vsModal);
    }

    let leaderFileName = gymInfo.leader.toLowerCase().replace(/[^a-z]/g, '');
    const leaderSpriteUrl = `${SUPABASE_STORAGE_URL}leaders/${encodeURIComponent(leaderFileName)}.png`;

    let leaderPokemonsHtml = '';
    const leaderTeam = gymInfo.pokemons || [];
    leaderTeam.forEach(pk => {
        leaderPokemonsHtml += `<img src="${pk.image}" class="w-12 h-12 object-contain bg-black/60 rounded-xl p-1.5 border border-red-600 shadow" title="${pk.name} Nv.${pk.level}">`;
    });

    vsModal.innerHTML = `
        <div class="text-center space-y-2 mb-8">
            <span class="text-xs font-black text-amber-400 uppercase tracking-widest font-cinzel">Ginásio Oficial de ${gymInfo.city}</span>
            <h2 class="text-2xl font-black text-white font-cinzel tracking-wider">LÍDER ${gymInfo.leader.toUpperCase()}</h2>
            <p class="text-xs text-amber-300 font-bold">Formato de Batalha: ${gymInfo.format}x${gymInfo.format}</p>
        </div>

        <div class="flex items-center justify-center gap-8 my-4 w-full max-w-2xl">
            <div class="flex flex-col items-center border-4 border-amber-500 rounded-3xl p-5 bg-gradient-to-b from-amber-950 to-black shadow-2xl w-48">
                <img src="${leaderSpriteUrl}" class="w-24 h-24 object-contain mb-2 drop-shadow-[0_0_10px_rgba(255,215,0,0.6)]" onerror="this.src='https://api.iconify.design/noto:man-raising-hand.svg'">
                <span class="text-xs font-black text-amber-300 uppercase">Líder</span>
            </div>
            
            <div class="text-3xl font-black text-red-500 animate-pulse font-cinzel">VS</div>
            
            <div class="flex flex-col items-center border-4 border-red-600 rounded-3xl p-5 bg-gradient-to-b from-red-950 to-black shadow-2xl w-48 space-y-2">
                <div class="flex flex-wrap justify-center gap-1.5 min-h-[48px]">
                    ${leaderPokemonsHtml}
                </div>
                <span class="text-xs font-black text-red-300 uppercase">Cartel Inimigo</span>
            </div>
        </div>

        <button id="gym-accept-btn" class="mt-8 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-black px-8 py-3 rounded-2xl text-xs uppercase tracking-wider shadow-2xl transition-all transform hover:scale-105 cursor-pointer">
            Preparar Equipa e Aceitar Desafio <i class="fa-solid fa-arrow-right ml-1"></i>
        </button>
    `;
    vsModal.classList.remove('hidden');

    document.getElementById('gym-accept-btn').onclick = () => {
        vsModal.remove();
        launchGymBattleArenaFixed(gymInfo);
    };
}

function launchGymBattleArenaFixed(gymInfo) {
    if (typeof window.openBattleArena === 'function') {
        window.openBattleArena({
            type: 'gym',
            format: gymInfo.format || 1,
            data: gymInfo
        });
    } else {
        alert("Arena de combate TCG de ginásio iniciada com sucesso!");
    }
}

window.initiateGymSequence = initiateGymSequence;
