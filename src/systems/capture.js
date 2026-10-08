// --- src/systems/capture.js ---
import { gameState, getCurrentPlayer, ensureValidGameState } from '../core/state.js';
import { saveGameProgress } from '../core/storage.js';
import { currentEncounterState } from './battle.js';

// Dispara o fluxo de escolha de Poké Balls para captura
export function triggerCaptureFlow(wildPokemon) {
    if (!wildPokemon) return;

    const cp = getCurrentPlayer();
    if (!cp) return;

    // Garante que o inventário do jogador existe
    if (!Array.isArray(cp.inventory)) cp.inventory = [];

    let modal = document.getElementById('capture-flow-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'capture-flow-modal';
        modal.className = 'fixed inset-0 bg-black/9org0 z-[420] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(modal);
    }

    // Filtra as Poké Balls e esferas disponíveis na mochila
    const captureItems = cp.inventory.filter(item => item && (item.type === 'sphere' || item.category === 'capture' || item.id.includes('ball')));

    let ballsHtml = '';
    if (captureItems.length > 0) {
        captureItems.forEach((item, index) => {
            ballsHtml += `
                <div onclick="attemptCatchWithSpecificBall('${item.id}', ${wildPokemon.waypointId || 0})" class="bg-black/60 border border-amber-600/60 p-3 rounded-xl flex items-center justify-between cursor-pointer hover:border-amber-400 transition-all text-white">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">${item.icon || '🔴'}</span>
                        <div>
                            <p class="text-xs font-bold">${item.name}</p>
                            <p class="text-[9px] text-slate-400">${item.desc || 'Esfera de captura'}</p>
                        </div>
                    </div>
                    <span class="bg-amber-600 text-black font-black px-2.5 py-1 rounded text-[10px]">Usar</span>
                </div>
            `;
        });
    } else {
        // Fallback caso não tenha Poké Balls na mochila (adiciona uma padrão para teste)
        ballsHtml = `
            <div onclick="attemptCatchWithSpecificBall('poke_ball', ${wildPokemon.waypointId || 0})" class="bg-black/60 border border-amber-600/60 p-3 rounded-xl flex items-center justify-between cursor-pointer hover:border-amber-400 transition-all text-white">
                <div class="flex items-center gap-2">
                    <span class="text-xl">🔴</span>
                    <div>
                        <p class="text-xs font-bold">Poké Ball (Padrão)</p>
                        <p class="text-[9px] text-slate-400">Esfera clássica padrão</p>
                    </div>
                </div>
                <span class="bg-amber-600 text-black font-black px-2.5 py-1 rounded text-[10px]">Usar</span>
            </div>
        `;
    }

    modal.innerHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <span class="text-xs font-black text-amber-400 font-cinzel">🎯 ESCOLHER ESFERA DE CAPTURA</span>
                <button onclick="document.getElementById('capture-flow-modal').remove()" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800 cursor-pointer">✕</button>
            </div>
            <p class="text-[10px] text-slate-300">Escolha uma Poké Ball ou esfera especial da sua mochila para tentar capturar o <strong>${wildPokemon.name}</strong>:</p>
            <div class="space-y-2 max-h-56 overflow-y-auto pr-1">
                ${ballsHtml}
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
}

// Tenta a captura usando uma esfera específica
window.attemptCatchWithSpecificBall = function(ballItemId, waypointId) {
    const modal = document.getElementById('capture-flow-modal');
    if (modal) modal.remove();

    ensureValidGameState();
    const cp = getCurrentPlayer();
    const wild = currentEncounterState.wildPokemon;

    if (!wild) {
        alert("Nenhum Pokémon em foco para captura.");
        return;
    }

    // Rolagem do dado de captura (1 a 6)
    const diceRoll = Math.floor(Math.random() * 6) + 1;
    
    // Bônus baseado no tipo de esfera
    let sphereBonus = 0;
    if (ballItemId.includes('great')) sphereBonus = 1;
    if (ballItemId.includes('ultra')) sphereBonus = 2;
    if (ballItemId.includes('master') || ballItemId.includes('rainbow')) sphereBonus = 4;
    if (ballItemId.includes('mystic') || ballItemId.includes('flame') || ballItemId.includes('aqua')) sphereBonus = 2;
    if (ballItemId.includes('electric') || ballItemId.includes('shadow')) sphereBonus = 3;

    const totalCapturePower = diceRoll + sphereBonus;
    const requiredThreshold = wild.level ? (3 + Math.floor(wild.level / 2)) : 4;

    console.log(`🎯 Tentativa de captura em ${wild.name}: Rolagem=${diceRoll} + Bônus=${sphereBonus} = Total ${totalCapturePower} (Necessário: ${requiredThreshold})`);

    if (totalCapturePower >= requiredThreshold || ballItemId.includes('master')) {
        alert(`🎉 PARABÉNS! Capturaste com sucesso o ${wild.name}!`);

        // Cria o objeto do Anima capturado com identificador único
        const caughtMonster = {
            ...wild,
            uniqueId: 'mon_' + Date.now() + '_' + Math.random().toString(36.substr(2, 5)),
            currentHp: wild.maxHp || wild.hp || 20
        };

        // Adiciona à equipa ativa se houver espaço (< 6), senão vai para a PC Box
        if (cp.activeTeam.length < 6) {
            cp.activeTeam.push(caughtMonster);
        } else {
            if (!Array.isArray(cp.pcBox)) cp.pcBox = [];
            cp.pcBox.push(caughtMonster);
            alert(`📦 A tua equipa ativa está cheia! O ${wild.name} foi enviado para a PC Box.`);
        }

        // Fecha o modal de encontro selvagem
        const encModal = document.getElementById('encounter-modal');
        if (encModal) {
            encModal.classList.add('hidden');
            encModal.classList.remove('flex');
        }

        currentEncounterState.wildPokemon = null;
        saveGameProgress();
    } else {
        alert(`❌ A captura falhou! O ${wild.name} conseguiu escapar da Poké Ball (Resultado: ${totalCapturePower}).`);
    }
};