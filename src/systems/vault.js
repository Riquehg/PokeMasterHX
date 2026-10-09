// --- src/systems/vault.js ---
// Sistema de Cofre Global de Pokémon (Vault / Herança), Gestão de Equipa e Trocas Online

import { gameState, getCurrentPlayer, ensureValidGameState } from '../core/state.js';
import { saveGameProgress } from '../core/storage.js';

export function saveMonsterToVault(uniqueId) {
    const cp = getCurrentPlayer();
    
    let monster = cp.activeTeam ? cp.activeTeam.find(m => m.uniqueId === uniqueId) : null;
    if (!monster && cp.pcBox) {
        monster = cp.pcBox.find(m => m.uniqueId === uniqueId);
    }
    
    if (!monster) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup("Erro", "Pokémon não encontrado para guardar no cofre.", false);
        }
        return;
    }

    let vault = [];
    try {
        const rawVault = localStorage.getItem('pokemon_master_trainer_vault');
        if (rawVault) vault = JSON.parse(rawVault);
    } catch (e) {
        vault = [];
    }
    
    if (vault.some(m => m.uniqueId === monster.uniqueId)) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup("Aviso", "Este Pokémon já se encontra guardado no Cofre Global!", false);
        }
        return;
    }

    const vaultMon = { ...monster, currentHp: monster.maxHp || monster.hp };
    vault.push(vaultMon);
    
    localStorage.setItem('pokemon_master_trainer_vault', JSON.stringify(vault));
    if (typeof showCustomPopup === 'function') {
        showCustomPopup("📦 Guardado no Cofre!", `O teu ${vaultMon.name} (Nv.${vaultMon.level || 1}) foi guardado com sucesso no Cofre Global! Podes resgatá-lo numa nova partida.`, true);
    }
    if (typeof appendAdventureLog === 'function') {
        appendAdventureLog(`Pokémon ${vaultMon.name} guardado no Cofre Global.`);
    }
}

export function openVaultModal() {
    let vaultModal = document.getElementById('global-vault-modal');
    
    if (!vaultModal) {
        vaultModal = document.createElement('div');
        vaultModal.id = 'global-vault-modal';
        vaultModal.className = 'fixed inset-0 bg-black/90 z-[500] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(vaultModal);
    }

    renderVaultModalContent(vaultModal);
    vaultModal.classList.remove('hidden');
}

export function closeVaultModal() {
    const vaultModal = document.getElementById('global-vault-modal');
    if (vaultModal) {
        vaultModal.classList.add('hidden');
    }
}

export function renderVaultModalContent(modalElement) {
    const cp = typeof getCurrentPlayer === 'function' ? getCurrentPlayer() : (gameState?.players?.[0] || {});
    const activeTeam = cp.activeTeam || [];
    const pcBox = cp.pcBox || cp.box || [];

    // Renderiza Slots Ativos (Equipe)
    let activeSlotsHtml = '';
    for (let i = 0; i < 6; i++) {
        const mon = activeTeam[i];
        if (mon) {
            const spriteUrl = mon.image || `https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/monsters/${String(mon.dexNumber || '001').padStart(3, '0')}.png`;
            activeSlotsHtml += `
                <div class="bg-blue-950/80 border-2 border-amber-400 p-2 rounded-xl flex flex-col items-center justify-between relative group shadow-md">
                    <span class="absolute top-1 left-1 bg-black/60 text-[8px] text-amber-300 px-1 rounded">#${i+1}</span>
                    <img src="${spriteUrl}" class="w-12 h-12 object-contain drop-shadow my-1" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    <div class="text-center w-full truncate">
                        <p class="text-[10px] font-bold text-white truncate">${mon.name}</p>
                        <p class="text-[8px] text-amber-300">Nv. ${mon.level || 1}</p>
                    </div>
                    <button onclick="window.movePokemonToBox(${i})" class="mt-1 bg-red-800 hover:bg-red-700 text-white text-[8px] font-bold px-2 py-0.5 rounded cursor-pointer w-full">
                        Guardar 📥
                    </button>
                </div>
            `;
        } else {
            activeSlotsHtml += `
                <div class="bg-black/40 border-2 border-dashed border-blue-500/40 p-2 rounded-xl flex flex-col items-center justify-center text-slate-500 min-h-[90px]">
                    <span class="text-[9px]">Vazio #${i+1}</span>
                </div>
            `;
        }
    }

    // Renderiza Slots do Cofre / PC Box
    let pcSlotsHtml = '';
    if (pcBox.length === 0) {
        pcSlotsHtml = `
            <div class="col-span-full text-center py-8 text-slate-400 text-xs">
                O seu cofre global está vazio. Capture mais Pokémon nas partidas para armazená-los aqui!
            </div>
        `;
    } else {
        pcBox.forEach((mon, index) => {
            const spriteUrl = mon.image || `https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/monsters/${String(mon.dexNumber || '001').padStart(3, '0')}.png`;
            pcSlotsHtml += `
                <div class="bg-purple-950/60 border border-purple-500/60 p-2 rounded-xl flex flex-col items-center justify-between relative shadow hover:border-amber-400 transition-all">
                    <img src="${spriteUrl}" class="w-12 h-12 object-contain drop-shadow my-1" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    <div class="text-center w-full truncate">
                        <p class="text-[10px] font-bold text-white truncate">${mon.name}</p>
                        <p class="text-[8px] text-purple-300">Nv. ${mon.level || 1}</p>
                    </div>
                    <button onclick="window.movePokemonToTeam(${index})" class="mt-1 bg-emerald-700 hover:bg-emerald-600 text-white text-[8px] font-bold px-2 py-0.5 rounded cursor-pointer w-full">
                        Usar no Time 🚀
                    </button>
                </div>
            `;
        });
    }

    modalElement.innerHTML = `
        <div class="trainer-card max-w-4xl w-full p-6 space-y-5 border-4 border-purple-600 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-purple-900 pb-2">
                <span class="text-xs font-black text-purple-300 font-cinzel">
                    <i class="fa-solid fa-box-archive"></i> COFRE GLOBAL / GERENCIADOR DE EQUIPE
                </span>
                <button type="button" onclick="closeVaultModal()" class="text-purple-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-purple-800 cursor-pointer">
                    ✕ Fechar
                </button>
            </div>

            <!-- EQUIPE ATIVA -->
            <div class="space-y-2">
                <p class="text-[11px] font-bold text-amber-300">Equipe Ativa (Máximo 6 Pokémon):</p>
                <div class="grid grid-cols-6 gap-2 bg-black/50 p-3 rounded-xl border border-blue-900/60">
                    ${activeSlotsHtml}
                </div>
            </div>

            <!-- COFRE / PC BOX -->
            <div class="space-y-2">
                <p class="text-[11px] font-bold text-purple-300">Pokémon Armazenados no Cofre (PC Box):</p>
                <div class="grid grid-cols-6 gap-2 bg-black/60 p-3 rounded-xl border border-purple-900/60 max-h-56 overflow-y-auto">
                    ${pcSlotsHtml}
                </div>
            </div>
        </div>
    `;
}

export function movePokemonToBox(teamIndex) {
    const cp = typeof getCurrentPlayer === 'function' ? getCurrentPlayer() : (gameState?.players?.[0] || {});
    if (!cp.activeTeam || !cp.activeTeam[teamIndex]) return;

    if (!cp.pcBox) cp.pcBox = [];

    const removedMon = cp.activeTeam.splice(teamIndex, 1)[0];
    cp.pcBox.push(removedMon);

    const modal = document.getElementById('global-vault-modal');
    if (modal) renderVaultModalContent(modal);
    if (typeof window.renderHubActiveTeam === 'function') window.renderHubActiveTeam(cp);
    if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
}

export function movePokemonToTeam(boxIndex) {
    const cp = typeof getCurrentPlayer === 'function' ? getCurrentPlayer() : (gameState?.players?.[0] || {});
    if (!cp.pcBox || !cp.pcBox[boxIndex]) return;

    if (!cp.activeTeam) cp.activeTeam = [];
    if (cp.activeTeam.length >= 6) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup('Equipe Cheia', 'Sua equipe ativa já possui 6 Pokémon. Guarde um na Box antes de adicionar outro.', false);
        }
        return;
    }

    const selectedMon = cp.pcBox.splice(boxIndex, 1)[0];
    cp.activeTeam.push(selectedMon);

    const modal = document.getElementById('global-vault-modal');
    if (modal) renderVaultModalContent(modal);
    if (typeof window.renderHubActiveTeam === 'function') window.renderHubActiveTeam(cp);
    if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
}

// --- EXPOSIÇÃO GLOBAL PARA O HTML E EVENTOS DO MOTOR ---
window.saveMonsterToVault = saveMonsterToVault;
window.openVaultModal = openVaultModal;
window.closeVaultModal = closeVaultModal;
window.movePokemonToBox = movePokemonToBox;
window.movePokemonToTeam = movePokemonToTeam;
