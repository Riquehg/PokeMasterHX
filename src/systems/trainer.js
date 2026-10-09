// --- src/systems/trainer.js ---
// Módulo do Trainer's Card, Ficha do Treinador e Detalhes do Anima

import { SUPABASE_STORAGE_URL } from '../config/constants.js';
import { gameState, getCurrentPlayer } from '../core/state.js';

// ------------------------------------------------------------
// CORES DE TIERS
// ------------------------------------------------------------
function getTierColorClass(tierOrColor) {
    const val = String(tierOrColor).toLowerCase();
    if (val === '1' || val === 'rosa') return 'bg-gradient-to-b from-pink-950 via-pink-900 to-black border-pink-500';
    if (val === '2' || val === 'verde') return 'bg-gradient-to-b from-emerald-950 via-emerald-900 to-black border-emerald-500';
    if (val === '3' || val === 'azul') return 'bg-gradient-to-b from-blue-950 via-blue-900 to-black border-blue-500';
    if (val === '4' || val === 'vermelho') return 'bg-gradient-to-b from-red-950 via-red-900 to-black border-red-500';
    if (val === '5' || val === 'amarelo') return 'bg-gradient-to-b from-amber-950 via-amber-900 to-black border-amber-400';
    return 'bg-gradient-to-b from-amber-950 via-amber-900 to-black border-amber-600';
}

// ------------------------------------------------------------
// ATUALIZAÇÃO DE INSÍGNIAS NA UI
// ------------------------------------------------------------
function updateTrainerCardBadges(cp) {
    const badgesArray = cp.badges || [];
    const allBadges = ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'volcano'];
    
    allBadges.forEach(badgeKey => {
        const imgEl = document.getElementById(`badge-${badgeKey}`);
        if (imgEl) {
            if (badgesArray.includes(badgeKey)) {
                imgEl.classList.remove('grayscale', 'opacity-40');
                imgEl.classList.add('drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]', 'scale-110');
            } else {
                imgEl.classList.add('grayscale', 'opacity-40');
                imgEl.classList.remove('drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]', 'scale-110');
            }
        }
    });
}

// ------------------------------------------------------------
// ABRIR TRAINER'S CARD ESPECÍFICO (Com suporte a PvP / Troca)
// ------------------------------------------------------------
export function openSpecificTrainerCardModal(playerIndex) {
    const cp = gameState.players[playerIndex] || gameState.players[0];
    const loggedPlayer = getCurrentPlayer();
    
    const areOnSameTile = (loggedPlayer.currentZone === cp.currentZone) && (loggedPlayer.name !== cp.name);

    let cardModal = document.getElementById('trainer-card-modal-full');
    if (!cardModal) {
        cardModal = document.createElement('div');
        cardModal.id = 'trainer-card-modal-full';
        cardModal.className = 'fixed inset-0 bg-black/85 z-[350] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(cardModal);
    }

    let teamSlotsHtml = '';
    for (let i = 0; i < 6; i++) {
        let mon = cp.activeTeam[i];
        if (mon) {
            let curHp = mon.currentHp !== undefined ? mon.currentHp : (mon.maxHp || 20);
            let maxHp = mon.maxHp || mon.hp || 20;
            const shinyBadgeModal = mon.isShiny ? '<span class="bg-amber-400 text-black font-black text-[7px] px-1 rounded-full animate-pulse">✨ SHINY</span>' : '';
            const tierColorBg = getTierColorClass(mon.tier || 1);
            const auraClassModal = mon.auraEffect || '';
            const monImgSrc = mon.isShiny && mon.shinyImage ? mon.shinyImage : (mon.image || '');
            
            teamSlotsHtml += `
                <div onclick="window.openPokemonDetailModal('${mon.uniqueId || mon.id}', 'team')" class="${tierColorBg} border-2 ${mon.isShiny ? 'border-amber-400 shiny-card-glow' : ''} ${auraClassModal} rounded-xl p-2 flex flex-col justify-between h-28 text-white shadow relative cursor-pointer hover:scale-105 transition-transform">
                    <div class="flex justify-between items-center text-[9px] font-bold">
                        <span class="truncate">${mon.name}</span>
                        ${shinyBadgeModal}
                        <span>Nv.${mon.level || 1}</span>
                    </div>
                    <div class="my-auto flex justify-center bg-black/40 rounded-lg p-1">
                        <img src="${monImgSrc}" class="w-10 h-10 object-contain drop-shadow" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    </div>
                    <div class="text-[8px] text-center font-black bg-black/60 text-amber-300 rounded p-0.5">
                        HP: ${curHp}/${maxHp} | STR: ${mon.str || 4}
                    </div>
                </div>
            `;
        } else {
            teamSlotsHtml += `
                <div class="bg-slate-900/60 border border-slate-700 rounded-xl flex items-center justify-center text-slate-500 text-[10px] h-28">
                    Vazio
                </div>
            `;
        }
    }

    const badgeCount = Array.isArray(cp.badges) ? cp.badges.length : (typeof cp.badges === 'number' ? cp.badges : 0);
    const badgesArray = cp.badges || [];
    const allBadgesDef = [
        { key: 'boulder', title: 'Insígnia da Rocha' },
        { key: 'cascade', title: 'Insígnia da Cascata' },
        { key: 'thunder', title: 'Insígnia do Trovão' },
        { key: 'rainbow', title: 'Insígnia do Arco-Íris' },
        { key: 'soul', title: 'Insígnia da Alma' },
        { key: 'volcano', title: 'Insígnia do Vulcão' }
    ];

    let badgesHtml = '';
    allBadgesDef.forEach(b => {
        const hasIt = badgesArray.includes(b.key);
        const cls = hasIt ? 'drop-shadow-[0_0_8px_rgba(255,215,0,0.8)] scale-110' : 'grayscale opacity-40';
        badgesHtml += `<img id="badge-${b.key}" src="${SUPABASE_STORAGE_URL}badges/${b.key}.png" class="w-7 h-7 object-contain transition-transform ${cls}" alt="${b.key}" title="${b.title}">`;
    });

    let interactionButtonsHtml = '';
    if (areOnSameTile) {
        interactionButtonsHtml = `
            <div class="bg-purple-950/40 border-2 border-purple-600/60 p-3 rounded-xl flex flex-wrap gap-2 items-center justify-between mt-3">
                <span class="text-[10px] text-purple-300 font-bold">📍 Estão na mesma casa! Ações disponíveis:</span>
                <div class="flex gap-2 w-full">
                    <button onclick="document.getElementById('trainer-card-modal-full').remove(); if(typeof triggerPvPBattleArena === 'function') triggerPvPBattleArena('${cp.name}');" class="flex-1 bg-red-700 hover:bg-red-600 text-white font-black py-2 rounded-lg text-[10px] uppercase shadow cursor-pointer">
                        ⚔ Desafiar PvP
                    </button>
                    <button onclick="document.getElementById('trainer-card-modal-full').remove(); if(typeof openTradeModal === 'function') openTradeModal('${loggedPlayer.name}', '${cp.name}');" class="flex-1 bg-blue-700 hover:bg-blue-600 text-white font-black py-2 rounded-lg text-[10px] uppercase shadow cursor-pointer">
                        🔄 Propor Troca
                    </button>
                </div>
            </div>
        `;
    }

    cardModal.innerHTML = `
        <div class="max-w-4xl w-full p-6 bg-gradient-to-b from-[#0f172a] to-[#020617] border-4 border-blue-600 rounded-2xl shadow-2xl space-y-4 text-white relative">
            <div class="flex justify-between items-center border-b border-blue-900/60 pb-2">
                <span class="text-xs font-black text-blue-400 font-cinzel tracking-wider">TRAINER'S CARD (${cp.name}) - Zona #${cp.currentZone}</span>
                <button onclick="document.getElementById('trainer-card-modal-full').remove()" class="text-blue-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-blue-950/60 rounded border border-blue-800 cursor-pointer">✕</button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                <div class="bg-black/60 border-2 border-blue-900 p-4 rounded-xl flex flex-col items-center justify-center space-y-2">
                    <img src="${SUPABASE_STORAGE_URL}player_0${cp.avatarId || 1}.png" class="w-20 h-20 object-contain drop-shadow-[0_0_10px_rgba(59,130,246,0.6)]" onerror="this.src='https://api.iconify.design/noto:boy.svg'">
                    <span class="text-xs font-black text-amber-400">${cp.name}</span>
                    <span class="text-[10px] text-slate-300">Ouro: ${cp.gold} 🪙</span>
                </div>

                <div class="md:col-span-3 grid grid-cols-3 gap-2">
                    ${teamSlotsHtml}
                </div>
            </div>

            ${interactionButtonsHtml}

            <div class="border-t border-blue-900/60 pt-3 flex justify-between items-center">
                <span class="text-xs font-bold text-slate-300">LEAGUE BADGES: (<span id="badges-count-text">${badgeCount}</span> / 6)</span>
                <div class="flex items-center gap-2">
                    ${badgesHtml}
                </div>
            </div>
        </div>
    `;
    cardModal.classList.remove('hidden');
    updateTrainerCardBadges(cp);
}

export function openTrainerCardModal() {
    openSpecificTrainerCardModal(gameState.currentPlayerIndex || 0);
}

// ------------------------------------------------------------
// FICHA DETALHADA DO POKÉMON
// ------------------------------------------------------------
const TYPE_ADVANTAGES = {
    "Fogo": { strongAgainst: ["Grama", "Inseto", "Gelo", "Aço"], weakAgainst: ["Água", "Fogo", "Pedra", "Dragão"] },
    "Água": { strongAgainst: ["Fogo", "Terra", "Pedra"], weakAgainst: ["Água", "Grama", "Dragão"] },
    "Grama": { strongAgainst: ["Água", "Terra", "Pedra"], weakAgainst: ["Fogo", "Grama", "Veneno", "Voador", "Inseto", "Dragão", "Aço"] },
    "Elétrico": { strongAgainst: ["Água", "Voador"], weakAgainst: ["Elétrico", "Grama", "Dragão"] },
    "Psíquico": { strongAgainst: ["Lutador", "Veneno"], weakAgainst: ["Psíquico", "Aço"] },
    "Lutador": { strongAgainst: ["Normal", "Gelo", "Pedra", "Sombrio", "Aço"], weakAgainst: ["Veneno", "Voador", "Psíquico", "Inseto"] }
};

export function openPokemonDetailModal(monsterIdOrUniqueId, fromArea = 'team') {
    const cp = getCurrentPlayer();
    let monster = null;
    if (fromArea === 'team') {
        monster = cp.activeTeam.find(m => m.uniqueId === monsterIdOrUniqueId || m.id === monsterIdOrUniqueId);
    } else if (fromArea === 'pcbox') {
        monster = cp.pcBox.find(m => m.uniqueId === monsterIdOrUniqueId || m.id === monsterIdOrUniqueId);
    }
    if (!monster) return;

    let detailModal = document.getElementById('pokemon-detail-modal');
    if (!detailModal) {
        detailModal = document.createElement('div');
        detailModal.id = 'pokemon-detail-modal';
        detailModal.className = 'fixed inset-0 bg-black/85 z-[350] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(detailModal);
    }

    const typeKey = monster.type ? monster.type.split('/')[0].trim() : 'Normal';
    const xpCurrent = monster.xp || 0;
    const curHp = monster.currentHp !== undefined ? monster.currentHp : (monster.hp || 20);
    const maxHp = monster.maxHp || monster.hp || 20;
    const isFainted = curHp <= 0;
    
    let evolutionText = 'Forma Final';
    if (monster.evolvesTo) {
        evolutionText = `Evolui no Nv. ${monster.evolutionLevel || 16}`;
    }

    const typeInfo = TYPE_ADVANTAGES[typeKey] || { strongAgainst: [], weakAgainst: [] };
    const strongList = typeInfo.strongAgainst.length > 0 ? typeInfo.strongAgainst.join(', ') : 'Nenhuma específica';
    const weakList = typeInfo.weakAgainst.length > 0 ? typeInfo.weakAgainst.join(', ') : 'Nenhuma específica';
    const shinyBanner = monster.isShiny ? '<div class="bg-amber-400 text-black font-black text-[9px] text-center rounded py-0.5 animate-pulse">✨ POKÉMON SHINY RARO ✨</div>' : '';
    const tierCardBg = getTierColorClass(monster.tier || 1);
    const auraDetailClass = monster.auraEffect || '';
    const monImgUrl = monster.isShiny && monster.shinyImage ? monster.shinyImage : (monster.image || '');

    detailModal.innerHTML = `
        <div class="trainer-card max-w-md w-full p-5 space-y-3 border-4 ${isFainted ? 'border-red-600' : (monster.isShiny ? 'border-amber-400 shiny-card-glow' : 'border-amber-500')} ${auraDetailClass} rounded-2xl ${tierCardBg} shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-1.5">
                <span class="text-xs font-black text-amber-400 font-cinzel tracking-wider">FICHA TÉCNICA DO ANIMA</span>
                <button onclick="document.getElementById('pokemon-detail-modal').remove()" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800 cursor-pointer">✕</button>
            </div>

            ${shinyBanner}
            ${isFainted ? '<div class="bg-red-950/80 border border-red-500 text-red-200 text-center py-1 rounded text-xs font-black animate-pulse">⚠ ANIMA DESMAIADO (HP 0)</div>' : ''}

            <div class="grid grid-cols-2 gap-3 items-center">
                <div class="bg-black/60 border-2 border-amber-700/60 p-3 rounded-xl flex flex-col items-center justify-center h-32">
                    <img src="${monImgUrl}" alt="${monster.name}" class="w-20 h-20 object-contain drop-shadow-[0_0_10px_rgba(255,215,0,0.6)] ${isFainted ? 'grayscale opacity-50' : ''}" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                </div>
                <div class="space-y-1.5 text-xs">
                    <div>
                        <h3 class="text-base font-black text-white">${monster.name}</h3>
                        <p class="text-[10px] text-amber-400 font-bold uppercase">Tipo: ${monster.type || 'Normal'}</p>
                    </div>
                    <div class="bg-black/40 p-2 rounded-lg border border-amber-900/40 space-y-0.5 text-[10px]">
                        <div class="flex justify-between"><span>Nível:</span> <span class="font-bold text-amber-300">Nv. ${monster.level || 1}</span></div>
                        <div class="flex justify-between"><span>Força (STR):</span> <span class="font-bold text-amber-300">${monster.str || 4}</span></div>
                        <div class="flex justify-between"><span>Vida (HP):</span> <span class="font-bold ${isFainted ? 'text-red-400' : 'text-emerald-400'}">${curHp} / ${maxHp}</span></div>
                    </div>
                </div>
            </div>

            <div class="bg-black/60 p-2.5 rounded-xl border border-amber-900/60 space-y-1.5 text-[10px]">
                <p class="text-amber-300 font-bold border-b border-amber-900/40 pb-0.5">⚡ Ecossistema de Tipos (TCG):</p>
                <div class="text-emerald-400"><span class="font-bold">Vantagem:</span> ${strongList}</div>
                <div class="text-red-400"><span class="font-bold">Desvantagem:</span> ${weakList}</div>
            </div>

            <div class="space-y-1 bg-black/50 p-2.5 rounded-xl border border-amber-900/50">
                <div class="flex justify-between text-[10px] font-bold text-slate-300">
                    <span>Experiência (XP):</span>
                    <span>${xpCurrent} / 100</span>
                </div>
                <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-amber-900">
                    <div class="bg-gradient-to-r from-amber-500 to-yellow-400 h-full transition-all duration-300" style="width: ${Math.min(xpCurrent, 100)}%;"></div>
                </div>
                <p class="text-[9px] text-slate-400 text-right pt-0.5">✨ ${evolutionText}</p>
            </div>

            <button onclick="document.getElementById('pokemon-detail-modal').remove()" class="w-full bg-amber-600 hover:bg-amber-500 text-black font-black py-2 rounded-xl text-xs uppercase shadow transition-all cursor-pointer">
                Fechar Ficha
            </button>
        </div>
    `;
    detailModal.classList.remove('hidden');
}

// Expõe as funções globalmente para os cliques no HTML
window.openTrainerCardModal = openTrainerCardModal;
window.openSpecificTrainerCardModal = openSpecificTrainerCardModal;
window.openPokemonDetailModal = openPokemonDetailModal;
