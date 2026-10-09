// --- src/systems/gym.js ---
// Subsistema de Ginásios Oficiais e Líderes de Kanto

import { gameState, getCurrentPlayer } from '../core/state.js';
import { SUPABASE_STORAGE_URL } from '../config/supabase-config.js';
import { calculateTypeAdvantageMultiplier } from './battle.js';

let currentGymBattleSession = null;
let gymAttemptedThisTurn = {}; 

export const GYM_LEADERS_CATALOG = [
    { 
        city: "Pewter City", 
        leader: "Brock", 
        type: "Pedra", 
        badgeKey: "boulder",
        badgeName: "Insígnia da Rocha", 
        rewardGold: 300, 
        format: 1,
        pokemons: [
            { id: 'onix', name: "Onix", level: 3, str: 6, hp: 24, type: "Pedra/Terra", image: `${SUPABASE_STORAGE_URL}monsters/095.png` }
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
            { id: 'starmie', name: "Starmie", level: 4, str: 7, hp: 28, type: "Água/Psíquico", image: `${SUPABASE_STORAGE_URL}monsters/121.png` }
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
            { id: 'voltorb', name: "Voltorb", level: 4, str: 7, hp: 26, type: "Elétrico", image: `${SUPABASE_STORAGE_URL}monsters/101.png` },
            { id: 'raichu', name: "Raichu", level: 5, str: 8, hp: 32, type: "Elétrico", image: `${SUPABASE_STORAGE_URL}monsters/026.png` }
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
            { id: 'tangela', name: "Tangela", level: 5, str: 8, hp: 30, type: "Grama", image: `${SUPABASE_STORAGE_URL}monsters/114.png` },
            { id: 'vileplume', name: "Vileplume", level: 6, str: 9, hp: 36, type: "Grama/Veneno", image: `${SUPABASE_STORAGE_URL}monsters/045.png` }
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
            { id: 'koffing', name: "Koffing", level: 5, str: 8, hp: 30, type: "Veneno", image: `${SUPABASE_STORAGE_URL}monsters/109.png` },
            { id: 'weezing', name: "Weezing", level: 6, str: 9, hp: 38, type: "Veneno", image: `${SUPABASE_STORAGE_URL}monsters/110.png` }
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
            { id: 'arcanine', name: "Arcanine", level: 6, str: 9, hp: 38, type: "Fogo", image: `${SUPABASE_STORAGE_URL}monsters/059.png` },
            { id: 'magmar', name: "Magmar", level: 6, str: 9, hp: 36, type: "Fogo", image: `${SUPABASE_STORAGE_URL}monsters/126.png` }
        ]
    }
];

export function initiateGymSequence(cityName) {
    const cp = getCurrentPlayer();
    const gymInfo = GYM_LEADERS_CATALOG.find(g => g.city.toLowerCase() === cityName.toLowerCase());
    
    if (!gymInfo) {
        return;
    }

    const attemptKey = `${gameState.currentPlayerIndex}_${gymInfo.city}`;
    if (gymAttemptedThisTurn[attemptKey]) {
        return;
    }

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
    const leaderTeam = gymInfo.pokemons || [gymInfo.pokemon];
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
        openTeamSelectionModalForGym();
    };
}

function openTeamSelectionModalForGym() {
    const cp = getCurrentPlayer();
    const formatLimit = currentGymBattleSession ? currentGymBattleSession.format : 1;
    let selectedIndices = [];

    let selModal = document.getElementById('team-selection-modal');
    if (!selModal) {
        selModal = document.createElement('div');
        selModal.id = 'team-selection-modal';
        selModal.className = 'fixed inset-0 bg-black/90 z-[400] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(selModal);
    }

    function renderSelectionGrid() {
        let teamGridHtml = '';
        if (cp.activeTeam) {
            cp.activeTeam.forEach((mon, idx) => {
                const isFainted = (mon.currentHp !== undefined ? mon.currentHp : mon.maxHp) <= 0;
                const isSelected = selectedIndices.includes(idx);
                const monImgSrc = mon.isShiny && mon.shinyImage ? mon.shinyImage : (mon.image || '');

                teamGridHtml += `
                    <div data-index="${idx}" class="gym-select-card p-3 rounded-2xl border-2 ${isSelected ? 'border-amber-400 bg-amber-950/80 scale-105' : 'border-amber-900/60'} ${isFainted ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-amber-500'} flex flex-col justify-between h-36 transition-all text-white">
                        <div class="flex justify-between items-center text-[10px] font-bold text-amber-300">
                            <span>${mon.name}</span>
                            <span>Nv.${mon.level || 1}</span>
                        </div>
                        <div class="my-auto flex justify-center bg-black/40 rounded p-1">
                            <img src="${monImgSrc}" class="w-14 h-14 object-contain">
                        </div>
                        <div class="text-[9px] text-center font-bold ${isFainted ? 'text-red-400' : 'text-emerald-400'}">
                            ${isFainted ? 'DESMAIADO' : `HP: ${mon.currentHp !== undefined ? mon.currentHp : mon.maxHp}/${mon.maxHp}`}
                        </div>
                    </div>
                `;
            });
        }

        const canConfirm = selectedIndices.length === formatLimit;

        selModal.innerHTML = `
            <div class="trainer-card max-w-2xl w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
                <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                    <span class="text-xs font-black text-amber-400 font-cinzel">🛡 SELEÇÃO DE EQUIPA (${selectedIndices.length}/${formatLimit})</span>
                    <button id="gym-sel-close" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800">✕ Cancelar</button>
                </div>
                <div class="grid grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1" id="gym-team-grid-box">
                    ${teamGridHtml}
                </div>
                <div class="flex gap-2">
                    <button id="gym-sel-back" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer">
                        Voltar / Desistir
                    </button>
                    <button id="gym-sel-confirm" ${canConfirm ? '' : 'disabled'} class="flex-2 ${canConfirm ? 'bg-amber-500 hover:bg-amber-400 text-black cursor-pointer shadow-lg' : 'bg-slate-800 text-slate-500 cursor-not-allowed'} font-black py-3 rounded-xl text-xs uppercase tracking-wider transition-all">
                        Confirmar e Iniciar
                    </button>
                </div>
            </div>
        `;

        // Event Listeners dinâmicos
        selModal.querySelectorAll('.gym-select-card').forEach(el => {
            el.onclick = () => {
                const idx = Number(el.getAttribute('data-index'));
                const mon = cp.activeTeam[idx];
                const isFainted = (mon.currentHp !== undefined ? mon.currentHp : mon.maxHp) <= 0;
                if (isFainted) return;

                const exists = selectedIndices.indexOf(idx);
                if (exists > -1) {
                    selectedIndices.splice(exists, 1);
                } else {
                    if (selectedIndices.length < formatLimit) {
                        selectedIndices.push(idx);
                    }
                }
                renderSelectionGrid();
            };
        });

        document.getElementById('gym-sel-close').onclick = () => selModal.remove();
        document.getElementById('gym-sel-back').onclick = () => selModal.remove();
        const confirmBtn = document.getElementById('gym-sel-confirm');
        if (confirmBtn && canConfirm) {
            confirmBtn.onclick = () => {
                selModal.remove();
                if (currentGymBattleSession) {
                    currentGymBattleSession.challengerTeam = selectedIndices;
                }
            };
        }
    }

    renderSelectionGrid();
    selModal.classList.remove('hidden');
}
