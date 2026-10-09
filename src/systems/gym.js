// --- src/systems/gym.js ---
import { gameState, getCurrentPlayer } from '../core/state.js';
import { SUPABASE_STORAGE_URL } from '../config/constants.js';
import { saveGameProgress } from '../core/storage.js';
import { emitSocket } from '../core/socket.js';

export const GYM_LEADERS_CATALOG = [
    {
        city: 'Pewter City',
        leader: 'Brock',
        badgeName: 'Boulder',
        badgeIcon: 'https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/badges/boulder.png',
        prize: 300,
        format: 1,
        pokemons: [
            { id: 'geodude', name: 'Geodude', level: 3, type: 'Rock/Ground', image: 'https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/monsters/074.png', currentHp: 20, maxHp: 20, str: 6 }
        ]
    },
    {
        city: 'Cerulean City',
        leader: 'Misty',
        badgeName: 'Cascade',
        badgeIcon: 'https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/badges/cascade.png',
        prize: 400,
        format: 1,
        pokemons: [
            { id: 'starmie', name: 'Starmie', level: 4, type: 'Water/Psychic', image: 'https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/monsters/121.png', currentHp: 25, maxHp: 25, str: 7 }
        ]
    },
    {
        city: 'Vermilion City',
        leader: 'Lt. Surge',
        badgeName: 'Thunder',
        badgeIcon: 'https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/badges/thunder.png',
        prize: 500,
        format: 1,
        pokemons: [
            { id: 'raichu', name: 'Raichu', level: 6, type: 'Electric', image: 'https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/monsters/026.png', currentHp: 30, maxHp: 30, str: 9 }
        ]
    },
    {
        city: 'Celadon City',
        leader: 'Erika',
        badgeName: 'Rainbow',
        badgeIcon: 'https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/badges/rainbow.png',
        prize: 600,
        format: 1,
        pokemons: [
            { id: 'vileplume', name: 'Vileplume', level: 8, type: 'Grass/Poison', image: 'https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/monsters/045.png', currentHp: 35, maxHp: 35, str: 11 }
        ]
    },
    {
        city: 'Fuchsia City',
        leader: 'Koga',
        badgeName: 'Soul',
        badgeIcon: 'https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/badges/soul.png',
        prize: 700,
        format: 1,
        pokemons: [
            { id: 'weezing', name: 'Weezing', level: 10, type: 'Poison', image: 'https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/monsters/110.png', currentHp: 40, maxHp: 40, str: 13 }
        ]
    },
    {
        city: 'Cinnabar Island',
        leader: 'Blaine',
        badgeName: 'Volcano',
        badgeIcon: 'https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/badges/volcano.png',
        prize: 800,
        format: 1,
        pokemons: [
            { id: 'arcanine', name: 'Arcanine', level: 12, type: 'Fire', image: 'https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/monsters/059.png', currentHp: 50, maxHp: 50, str: 16 }
        ]
    }
];

export function initiateGymSequence(cityName) {
    const gymInfo = GYM_LEADERS_CATALOG.find(g => g.city.toLowerCase() === cityName.toLowerCase()) || GYM_LEADERS_CATALOG[1];
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
        <div class="text-center space-y-2 mb-6">
            <span class="text-xs font-black text-amber-400 uppercase tracking-widest font-cinzel">Ginásio Oficial de ${gymInfo.city}</span>
            <h2 class="text-2xl font-black text-white font-cinzel tracking-wider">LÍDER ${gymInfo.leader.toUpperCase()}</h2>
            <div class="flex items-center justify-center gap-2 mt-2">
                <span class="text-xs text-slate-300 font-bold">Insígnia em Disputa:</span>
                <img src="${gymInfo.badgeIcon}" class="w-10 h-10 object-contain drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]" title="${gymInfo.badgeName}">
                <span class="text-xs font-black text-amber-300 uppercase">${gymInfo.badgeName}</span>
            </div>
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

        <div class="flex gap-4 mt-6">
            <button id="gym-accept-btn" class="bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-black px-8 py-3 rounded-2xl text-xs uppercase tracking-wider shadow-2xl transition-all transform hover:scale-105 cursor-pointer">
                Preparar Equipa e Aceitar Desafio <i class="fa-solid fa-arrow-right ml-1"></i>
            </button>
            <button onclick="document.getElementById('gym-vs-modal').remove()" class="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-6 py-3 rounded-2xl text-xs uppercase cursor-pointer">
                Voltar
            </button>
        </div>
    `;
    vsModal.classList.remove('hidden');

    document.getElementById('gym-accept-btn').onclick = () => {
        vsModal.remove();
        launchGymBattleArenaDirect(gymInfo);
    };
}

function launchGymBattleArenaDirect(gymInfo) {
    if (typeof window.openBattleArena === 'function') {
        window.openBattleArena({
            type: 'gym',
            format: gymInfo.format || 1,
            data: gymInfo
        });
    } else if (typeof window.openEncounterModalWithPokemon === 'function' && gymInfo.pokemons && gymInfo.pokemons.length > 0) {
        // Redirecionamento seguro para a arena de combate se openBattleArena não estiver carregada
        window.openEncounterModalWithPokemon(gymInfo.pokemons[0]);
    } else {
        alert(`Batalha de Ginásio contra ${gymInfo.leader} iniciada! (Modo Arena em preparação)`);
    }
}

window.initiateGymSequence = initiateGymSequence;
window.GYM_LEADERS_CATALOG = GYM_LEADERS_CATALOG;
