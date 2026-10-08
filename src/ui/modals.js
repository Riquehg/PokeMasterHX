// --- src/ui/modals.js ---
// Módulo de Gerenciamento de Pop-ups, Fichas de Treinador e Modais de Cidades

import { SUPABASE_STORAGE_URL } from '../config/constants.js';
import { gameState, getCurrentPlayer, ensureValidGameState } from '../core/state.js';
import { saveGameProgress, saveMonsterToVault } from '../core/storage.js';
import { openPokemartModal } from '../systems/inventory.js';

// Exibe um pop-up de alerta ou notificação customizado na tela
export function showCustomPopup(title, message, showCloseBtn = true) {
    let popup = document.getElementById('custom-popup-modal');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'custom-popup-modal';
        popup.className = 'fixed inset-0 bg-black/80 z-[500] flex items-center justify-center p-4 backdrop-blur-sm';
        document.body.appendChild(popup);
    }

    popup.innerHTML = `
        <div class="trainer-card max-w-sm w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white text-center">
            <h3 class="text-sm font-black text-amber-400 font-cinzel">${title}</h3>
            <p class="text-xs text-slate-200 leading-relaxed">${message}</p>
            ${showCloseBtn ? `<button onclick="document.getElementById('custom-popup-modal').remove()" class="bg-amber-600 hover:bg-amber-500 text-black font-black px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer w-full">OK</button>` : ''}
        </div>
    `;
    popup.classList.remove('hidden');
    popup.classList.add('flex');
}

// Abre a Ficha de Treinador (Trainer Card) detalhada de um jogador específico
export function openSpecificTrainerCardModal(playerIndex = 0) {
    ensureValidGameState();
    const players = gameState.players || [];
    const player = players[playerIndex] || getCurrentPlayer();
    if (!player) return;

    let modal = document.getElementById('trainer-card-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'trainer-card-modal';
        modal.className = 'fixed inset-0 bg-black/9org0 z-[400] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(modal);
    }

    // Renderiza a equipe ativa
    let teamHtml = '';
    const activeTeam = player.activeTeam || [];
    for (let i = 0; i < 6; i++) {
        const mon = activeTeam[i];
        if (mon) {
            teamHtml += `
                <div class="bg-black/60 border border-amber-600/60 p-2 rounded-xl flex flex-col items-center text-center relative group">
                    <img src="${mon.image}" class="w-12 h-12 object-contain my-1" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    <span class="text-[9px] font-bold text-white truncate max-w-[70px]">${mon.name}</span>
                    <span class="text-[8px] text-amber-300">Nv.${mon.level || 1}</span>
                    <button onclick="sendMonsterToVault('${mon.uniqueId}')" class="absolute top-1 right-1 bg-red-900/80 hover:bg-red-700 text-white text-[8px] px-1 rounded cursor-pointer" title="Enviar para o Cofre">📦</button>
                </div>
            `;
        } else {
            teamHtml += `
                <div class="border border-dashed border-slate-700 p-2 rounded-xl flex items-center justify-center h-20 bg-black/20">
                    <span class="text-[9px] text-slate-600">Vazio</span>
                </div>
            `;
        }
    }

    modal.innerHTML = `
        <div class="trainer-card max-w-xl w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <div class="flex items-center gap-3">
                    <img src="${SUPABASE_STORAGE_URL}player_0${player.avatarId || 1}.png" class="w-10 h-10 object-contain">
                    <div>
                        <h2 class="text-sm font-black text-amber-400 font-cinzel">${player.name}</h2>
                        <p class="text-[10px] text-slate-400">🪙 Ouro: ${player.gold || 0} | Zona Atual: #${player.currentZone || 5}</p>
                    </div>
                </div>
                <button onclick="document.getElementById('trainer-card-modal').remove()" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800 cursor-pointer">✕</button>
            </div>
            
            <div>
                <h4 class="text-[11px] font-bold text-amber-300 mb-2">Equipa Ativa (Até 6 Anima)</h4>
                <div class="grid grid-cols-6 gap-2">
                    ${teamHtml}
                </div>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// Abre o modal de opções da Cidade (Centro Pokémon, Poké Mart ou Ginásio)
export function openCityModal(cityName) {
    let modal = document.getElementById('city-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'city-modal';
        modal.className = 'fixed inset-0 bg-black/90 z-[380] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white text-center">
            <h3 class="text-sm font-black text-amber-400 font-cinzel">🏛️ ${cityName.toUpperCase()}</h3>
            <p class="text-xs text-slate-300">O que pretendes fazer nesta cidade?</p>
            
            <div class="grid grid-cols-2 gap-3 pt-2">
                <button onclick="document.getElementById('city-modal').remove(); openPokemartModal();" class="bg-amber-600 hover:bg-amber-500 text-black font-black p-3 rounded-xl text-xs transition-colors cursor-pointer">🛒 Poké Mart</button>
                <button onclick="document.getElementById('city-modal').remove(); healAllTeamMonsters();" class="bg-blue-600 hover:bg-blue-500 text-white font-black p-3 rounded-xl text-xs transition-colors cursor-pointer">🏥 Centro Pokémon</button>
            </div>
            
            <button onclick="document.getElementById('city-modal').remove()" class="mt-4 text-xs text-slate-400 hover:text-white underline cursor-pointer">Fechar</button>
        </div>
    `;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// Cura todos os monstros da equipe ativa no Centro Pokémon
window.healAllTeamMonsters = function() {
    const cp = getCurrentPlayer();
    if (!cp || !Array.isArray(cp.activeTeam)) return;

    cp.activeTeam.forEach(mon => {
        if (mon) {
            mon.currentHp = mon.maxHp || mon.hp || 20;
        }
    });

    saveGameProgress();
    showCustomPopup("Centro Pokémon", "🏥 Todos os Anima da tua equipa ativa foram totalmente curados e recuperaram o PV máximo!", true);
};

// Atalho global para enviar monstro para o cofre
window.sendMonsterToVault = function(uniqueId) {
    saveMonsterToVault(uniqueId);
    openSpecificTrainerCardModal(gameState.currentPlayerIndex || 0);
};