// --- MÓDULO DE ARENA DE BATALHA TCG (battle-arena.js) ---

let currentBattleSession = {
    mode: 'gym', // 'gym' ou 'pvp'
    challenger: null,
    defender: null, // Líder de Ginásio ou outro Jogador
    format: 1, // 1, 3 ou 6
    playerTeam: [], // Cópia dos Pokémon escolhidos para a batalha
    enemyTeam: [],  // Equipa adversária
    activePlayerIndex: 0,
    activeEnemyIndex: 0,
    preBattleItemsUsed: 0
};

// Ponto de entrada chamado pela engine principal
function openBattleArena(config) {
    const cp = getCurrentPlayer();
    
    if (!cp.activeTeam || cp.activeTeam.length === 0) {
        showCustomPopup("Aviso", "🚫 Precisas de ter pelo menos um Pokémon na Equipa Ativa!", false);
        return;
    }

    // Verificar se há pelo menos um Pokémon com vida
    const hasHealthy = cp.activeTeam.some(m => (m.currentHp !== undefined ? m.currentHp : m.maxHp) > 0);
    if (!hasHealthy) {
        showCustomPopup("Equipa Desmaiada", "⚠ Todos os Pokémon da tua equipa ativa estão desmaiados (HP 0)! Visita um Centro Pokémon.", false);
        return;
    }

    currentBattleSession.mode = config.type || 'gym';
    currentBattleSession.format = config.format || 1;
    currentBattleSession.preBattleItemsUsed = 0;

    if (currentBattleSession.mode === 'gym') {
        const gym = config.data;
        currentBattleSession.challenger = cp;
        currentBattleSession.defender = {
            name: `Líder ${gym.leader} (${gym.city})`,
            isGymLeader: true,
            badgeKey: gym.badgeKey,
            rewardGold: gym.rewardGold,
            team: gym.pokemons || [gym.pokemon]
        };
    } else {
        currentBattleSession.challenger = cp;
        currentBattleSession.defender = {
            name: config.opponent.name,
            isGymLeader: false,
            team: config.opponent.activeTeam.filter(m => (m.currentHp !== undefined ? m.currentHp : m.maxHp) > 0)
        };
    }

    // Abrir modal de seleção de equipa com base no formato (1x1, 3x3, etc.)
    openArenaTeamSelectionModal();
}

function openArenaTeamSelectionModal() {
    const cp = getCurrentPlayer();
    const formatLimit = currentBattleSession.format;
    let selectedIndices = [];

    let modal = document.getElementById('arena-team-sel-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'arena-team-sel-modal';
        modal.className = 'fixed inset-0 bg-black/90 z-[450] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(modal);
    }

    function renderGrid() {
        let html = '';
        cp.activeTeam.forEach((mon, idx) => {
            const isFainted = (mon.currentHp !== undefined ? mon.currentHp : mon.maxHp) <= 0;
            const isSelected = selectedIndices.includes(idx);
            const tierBg = typeof getTierColorClass === 'function' ? getTierColorClass(mon.tier || 1) : 'bg-slate-900 border-amber-600';
            const auraCls = mon.auraEffect || '';

            html += `
                <div onclick="${isFainted ? '' : `toggleArenaSelection(${idx})`}" class="${tierBg} ${auraCls} p-3 rounded-2xl border-2 ${isSelected ? 'border-amber-400 bg-amber-950/80 scale-105 shadow-[0_0_15px_rgba(255,215,0,0.5)]' : 'border-amber-900/60'} ${isFainted ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-amber-500'} flex flex-col justify-between h-36 transition-all text-white">
                    <div class="flex justify-between items-center text-[10px] font-bold text-amber-300">
                        <span>${mon.name}</span>
                        <span>Nv.${mon.level || 1}</span>
                    </div>
                    <div class="my-auto flex justify-center bg-black/40 rounded p-1">
                        <img src="${mon.isShiny && mon.shinyImage ? mon.shinyImage : (mon.image || '')}" class="w-14 h-14 object-contain">
                    </div>
                    <div class="text-[9px] text-center font-bold ${isFainted ? 'text-red-400' : 'text-emerald-400'}">
                        ${isFainted ? 'DESMAIADO' : `HP: ${mon.currentHp !== undefined ? mon.currentHp : mon.maxHp}/${mon.maxHp}`}
                    </div>
                </div>
            `;
        });

        const canProceed = selectedIndices.length === formatLimit;

        modal.innerHTML = `
            <div class="trainer-card max-w-2xl w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
                <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                    <span class="text-xs font-black text-amber-400 font-cinzel">🏟 SELEÇÃO DE EQUIPA TCG (${selectedIndices.length}/${formatLimit})</span>
                    <button onclick="document.getElementById('arena-team-sel-modal').remove();" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800">✕ Cancelar</button>
                </div>
                <div class="grid grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1">
                    ${html}
                </div>
                <div class="flex gap-2">
                    <button onclick="document.getElementById('arena-team-sel-modal').remove();" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all">
                        Voltar / Desistir
                    </button>
                    <button onclick="confirmArenaTeamAndStart([${selectedIndices.join(',')}])" ${canProceed ? '' : 'disabled'} class="flex-2 ${canProceed ? 'bg-amber-500 hover:bg-amber-400 text-black cursor-pointer shadow-lg' : 'bg-slate-800 text-slate-500 cursor-not-allowed'} font-black py-3 rounded-xl text-xs uppercase tracking-wider transition-all">
                        Confirmar e Entrar na Arena
                    </button>
                </div>
            </div>
        `;
    }

    window.toggleArenaSelection = function(idx) {
        const pos = selectedIndices.indexOf(idx);
        if (pos > -1) {
            selectedIndices.splice(pos, 1);
        } else {
            if (selectedIndices.length < formatLimit) {
                selectedIndices.push(idx);
            } else {
                showCustomPopup("Limite Atingido", `Este formato restringe a equipa a exatamente ${formatLimit} Pokémon!`, false);
            }
        }
        renderGrid();
    };

    renderGrid();
    modal.classList.remove('hidden');
}

function renderPreBattleContent(modalEl) {
    const cp = getCurrentPlayer();
    const activeMon = currentBattleSession.playerTeam[currentBattleSession.activePlayerIndex];

    let inventoryHtml = '';
    cp.inventory.forEach((item, itemIdx) => {
        if (!item || item.count <= 0) return;
        const isRevive = item.type === 'revive';
        const isHeal = item.type === 'heal';
        const isBattle = item.type === 'battle';

        if (!isHeal && !isBattle && !isRevive) return;

        inventoryHtml += `
            <div class="flex items-center justify-between bg-black/60 p-2.5 rounded-xl border border-amber-900/60">
                <div class="flex items-center gap-2">
                    <span class="text-xl">${item.icon || '🎒'}</span>
                    <div>
                        <p class="text-xs font-bold text-white">${item.name} (${item.count})</p>
                        <p class="text-[9px] text-slate-400">${item.desc}</p>
                    </div>
                </div>
                <button onclick="useItemInPreBattle('${item.id}', ${itemIdx})" class="bg-amber-600 hover:bg-amber-500 text-black font-black px-3 py-1 rounded-lg text-[10px] shadow">
                    Usar
                </button>
            </div>
        `;
    });

    modalEl.innerHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <span class="text-xs font-black text-amber-400 font-cinzel">🧪 FASE PRÉ-BATALHA</span>
                <button onclick="document.getElementById('arena-prebattle-modal').remove();" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800">✕ Desistir</button>
            </div>

            <div class="bg-black/50 p-3 rounded-2xl border border-amber-900/40 flex items-center gap-3">
                <img src="${activeMon.image}" class="w-12 h-12 object-contain" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                <div>
                    <p class="text-xs font-bold text-white">${activeMon.name} (Nv.${activeMon.level})</p>
                    <p class="text-[10px] text-emerald-400 font-bold">HP: ${activeMon.currentHp} / ${activeMon.maxHp} | STR: ${activeMon.str}</p>
                </div>
            </div>

            <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
                ${inventoryHtml || '<p class="text-[10px] text-slate-400 text-center py-4">Sem itens de suporte/cura disponíveis na mochila.</p>'}
            </div>

            <div class="flex gap-2">
                <button onclick="document.getElementById('arena-prebattle-modal').remove();" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-xs uppercase tracking-wider">
                    Fugir / Cancelar
                </button>
                <button onclick="closePreBattleAndLaunchArena()" class="flex-2 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-xl transition-all cursor-pointer">
                    Iniciar Combate ⚔️
                </button>
            </div>
        </div>
    `;
}

function renderArenaCombatUI(modalEl) {
    const pMon = currentBattleSession.playerTeam[currentBattleSession.activePlayerIndex];
    const eMon = currentBattleSession.enemyTeam[currentBattleSession.activeEnemyIndex];

    let pReservesHtml = '';
    currentBattleSession.playerTeam.forEach((m, idx) => {
        if (idx === currentBattleSession.activePlayerIndex) return;
        const isFaint = m.currentHp <= 0;
        pReservesHtml += `
            <div class="flex items-center gap-1.5 bg-black/60 border ${isFaint ? 'border-red-800 opacity-40' : 'border-amber-600'} rounded-xl p-1.5 px-3 text-[10px]">
                <img src="${m.image}" class="w-6 h-6 object-contain" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                <div>
                    <p class="font-bold text-white">${m.name}</p>
                    <p class="${isFaint ? 'text-red-400' : 'text-emerald-400'}">HP: ${m.currentHp}/${m.maxHp}</p>
                </div>
            </div>
        `;
    });

    modalEl.innerHTML = `
        <div class="flex justify-between items-center bg-black/80 px-4 py-2 border-b border-red-900">
            <span class="text-xs font-bold text-amber-400">ARENA DE BATALHA (${currentBattleSession.format}x${currentBattleSession.format})</span>
            <button onclick="if(confirm('Tem a certeza que deseja abandonar a batalha? Irá contar como derrota.')) { document.getElementById('main-battle-arena-modal').remove(); concludeArenaBattle(false); }" class="bg-red-950 border border-red-600 hover:bg-red-900 text-red-200 text-xs px-3 py-1 rounded font-bold">🏳 Desistir / Fugir</button>
        </div>

        <!-- TOPO: INIMIGO EM DESTAQUE -->
        <div class="flex justify-between items-center bg-gradient-to-b from-red-950/80 to-black/80 border-2 border-red-600 p-4 rounded-3xl shadow-2xl my-2">
            <div class="flex items-center gap-4">
                <div class="w-24 h-24 bg-black/60 rounded-2xl border border-red-500 flex items-center justify-center p-2">
                    <img src="${eMon.image}" class="w-20 h-20 object-contain drop-shadow-[0_0_10px_rgba(239,68,68,0.6)]" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                </div>
                <div>
                    <span class="text-[10px] font-black text-red-400 uppercase tracking-widest">${currentBattleSession.defender.name}</span>
                    <h3 class="text-lg font-black text-white">${eMon.name} <span class="text-xs text-amber-400">(Nv.${eMon.level})</span></h3>
                    <p class="text-xs font-bold text-red-300 mt-1">HP: ${eMon.currentHp} / ${eMon.maxHp} | STR: ${eMon.str}</p>
                </div>
            </div>
        </div>

        <!-- CENTRO: AVISO / STATUS -->
        <div class="text-center my-auto space-y-2">
            <h2 class="text-2xl font-black text-amber-400 font-cinzel tracking-widest animate-pulse">TURNO DE COMBATE TCG</h2>
            <p class="text-xs text-slate-300">Pressione para resolver a ronda com base na força e dados!</p>
            <button onclick="executeArenaTurn()" class="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black px-8 py-3 rounded-2xl text-xs uppercase tracking-wider shadow-2xl transition-all transform hover:scale-105 cursor-pointer">
                ⚔️ Atacar / Rolar Dado de Combate
            </button>
        </div>

        <!-- FUNDO: JOGADOR ATIVO -->
        <div class="space-y-3 my-2">
            <div class="flex gap-2 overflow-x-auto pb-1 justify-center">
                ${pReservesHtml}
            </div>

            <div class="flex justify-between items-center bg-gradient-to-t from-amber-950/80 to-black/80 border-2 border-amber-500 p-4 rounded-3xl shadow-2xl">
                <div class="flex items-center gap-4">
                    <div class="w-24 h-24 bg-black/60 rounded-2xl border border-amber-400 flex items-center justify-center p-2">
                        <img src="${pMon.image}" class="w-20 h-20 object-contain drop-shadow-[0_0_10px_rgba(255,215,0,0.6)]" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    </div>
                    <div>
                        <span class="text-[10px] font-black text-amber-400 uppercase tracking-widest">${currentBattleSession.challenger.name} (Você)</span>
                        <h3 class="text-lg font-black text-white">${pMon.name} <span class="text-xs text-amber-300">(Nv.${pMon.level})</span></h3>
                        <p class="text-xs font-bold text-emerald-400 mt-1">HP: ${pMon.currentHp} / ${pMon.maxHp} | STR: ${pMon.str}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

window.confirmArenaTeamAndStart = function(indexes) {
    const modal = document.getElementById('arena-team-sel-modal');
    if (modal) modal.remove();

    const cp = getCurrentPlayer();
    currentBattleSession.playerTeam = indexes.map(i => {
        let m = cp.activeTeam[i];
        return { ...m, currentHp: m.currentHp !== undefined ? m.currentHp : m.maxHp };
    });

    currentBattleSession.enemyTeam = currentBattleSession.defender.team.map(m => ({
        ...m,
        currentHp: m.hp || 25,
        maxHp: m.hp || 25,
        str: m.str || 5,
        level: m.level || 5
    }));

    currentBattleSession.activePlayerIndex = 0;
    currentBattleSession.activeEnemyIndex = 0;

    // Abre estritamente a fase pré-batalha sem rodar dados
    openPreBattlePhaseModal();
};

// --- FASE PRÉ-BATALHA: USO DE ITENS & POÇÕES ---
function openPreBattlePhaseModal() {
    let modal = document.getElementById('arena-prebattle-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'arena-prebattle-modal';
        modal.className = 'fixed inset-0 bg-black/90 z-[460] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(modal);
    }

    renderPreBattleContent(modal);
    modal.classList.remove('hidden');
}

function renderPreBattleContent(modalEl) {
    const cp = getCurrentPlayer();
    const activeMon = currentBattleSession.playerTeam[currentBattleSession.activePlayerIndex];

    let inventoryHtml = '';
    cp.inventory.forEach((item, itemIdx) => {
        if (!item || item.count <= 0) return;
        const isRevive = item.type === 'revive';
        const isHeal = item.type === 'heal';
        const isBattle = item.type === 'battle';

        if (!isHeal && !isBattle && !isRevive) return;

        inventoryHtml += `
            <div class="flex items-center justify-between bg-black/60 p-2.5 rounded-xl border border-amber-900/60">
                <div class="flex items-center gap-2">
                    <span class="text-xl">${item.icon || '🎒'}</span>
                    <div>
                        <p class="text-xs font-bold text-white">${item.name} (${item.count})</p>
                        <p class="text-[9px] text-slate-400">${item.desc}</p>
                    </div>
                </div>
                <button onclick="useItemInPreBattle('${item.id}', ${itemIdx})" class="bg-amber-600 hover:bg-amber-500 text-black font-black px-3 py-1 rounded-lg text-[10px] shadow">
                    Usar
                </button>
            </div>
        `;
    });

    modalEl.innerHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <span class="text-xs font-black text-amber-400 font-cinzel">🧪 FASE PRÉ-BATALHA</span>
                <span class="text-[10px] text-amber-300">Preparar Combatente</span>
            </div>

            <div class="bg-black/50 p-3 rounded-2xl border border-amber-900/40 flex items-center gap-3">
                <img src="${activeMon.image}" class="w-12 h-12 object-contain" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                <div>
                    <p class="text-xs font-bold text-white">${activeMon.name} (Nv.${activeMon.level})</p>
                    <p class="text-[10px] text-emerald-400 font-bold">HP: ${activeMon.currentHp} / ${activeMon.maxHp} | STR: ${activeMon.str}</p>
                </div>
            </div>

            <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
                ${inventoryHtml || '<p class="text-[10px] text-slate-400 text-center py-4">Sem itens de suporte/cura disponíveis na mochila.</p>'}
            </div>

            <button onclick="closePreBattleAndLaunchArena()" class="w-full bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-xl transition-all cursor-pointer">
                Avançar para o Combate ⚔️
            </button>
        </div>
    `;
}

window.closePreBattleAndLaunchArena = function() {
    const preModal = document.getElementById('arena-prebattle-modal');
    if (preModal) preModal.remove();
    launchMainArenaCombatInterface();
};

window.useItemInPreBattle = function(itemId, itemIndex) {
    const cp = getCurrentPlayer();
    let item = cp.inventory.find(i => i.id === itemId);
    let activeMon = currentBattleSession.playerTeam[currentBattleSession.activePlayerIndex];

    if (!item || item.count <= 0) return;

    if (item.type === 'heal') {
        if (activeMon.currentHp >= activeMon.maxHp) {
            showCustomPopup("Aviso", "O Pokémon já está com HP máximo!", false);
            return;
        }
        item.count--;
        activeMon.currentHp = Math.min(activeMon.maxHp, activeMon.currentHp + item.value);
        showCustomPopup("Sucesso", `💊 ${item.name} aplicada! HP atual: ${activeMon.currentHp}/${activeMon.maxHp}`, true);
    } else if (item.type === 'battle') {
        item.count--;
        activeMon.str = (activeMon.str || 4) + (item.value || 2);
        showCustomPopup("Sucesso", `🧪 ${item.name} aplicada! STR aumentada para ${activeMon.str}`, true);
    } else if (item.type === 'revive') {
        if (activeMon.currentHp > 0) {
            showCustomPopup("Bloqueado", "⚠ O Revive só pode ser aplicado se o Pokémon ativo estiver desmaiado (HP 0)!", false);
            return;
        }
        item.count--;
        activeMon.currentHp = Math.floor(activeMon.maxHp / 2);
        showCustomPopup("Sucesso", `🌟 Revive aplicado! Anima revivido com ${activeMon.currentHp} HP.`, true);
    }

    const preModal = document.getElementById('arena-prebattle-modal');
    if (preModal) renderPreBattleContent(preModal);
};

// --- INTERFACE PRINCIPAL DA ARENA TCG ---
function launchMainArenaCombatInterface() {
    let arenaModal = document.getElementById('main-battle-arena-modal');
    if (!arenaModal) {
        arenaModal = document.createElement('div');
        arenaModal.id = 'main-battle-arena-modal';
        arenaModal.className = 'fixed inset-0 bg-black/95 z-[480] flex flex-col justify-between p-6 backdrop-blur-md text-white';
        document.body.appendChild(arenaModal);
    }

    renderArenaCombatUI(arenaModal);
    arenaModal.classList.remove('hidden');
}

function renderArenaCombatUI(modalEl) {
    const pMon = currentBattleSession.playerTeam[currentBattleSession.activePlayerIndex];
    const eMon = currentBattleSession.enemyTeam[currentBattleSession.activeEnemyIndex];

    let pReservesHtml = '';
    currentBattleSession.playerTeam.forEach((m, idx) => {
        if (idx === currentBattleSession.activePlayerIndex) return;
        const isFaint = m.currentHp <= 0;
        pReservesHtml += `
            <div class="flex items-center gap-1.5 bg-black/60 border ${isFaint ? 'border-red-800 opacity-40' : 'border-amber-600'} rounded-xl p-1.5 px-3 text-[10px]">
                <img src="${m.image}" class="w-6 h-6 object-contain" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                <div>
                    <p class="font-bold text-white">${m.name}</p>
                    <p class="${isFaint ? 'text-red-400' : 'text-emerald-400'}">HP: ${m.currentHp}/${m.maxHp}</p>
                </div>
            </div>
        `;
    });

    let eReservesHtml = '';
    currentBattleSession.enemyTeam.forEach((m, idx) => {
        if (idx === currentBattleSession.activeEnemyIndex) return;
        const isFaint = m.currentHp <= 0;
        eReservesHtml += `
            <div class="flex items-center gap-1.5 bg-black/60 border ${isFaint ? 'border-red-800 opacity-40' : 'border-red-600'} rounded-xl p-1.5 px-3 text-[10px]">
                <img src="${m.image}" class="w-6 h-6 object-contain" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                <div>
                    <p class="font-bold text-white">${m.name}</p>
                    <p class="${isFaint ? 'text-red-400' : 'text-amber-400'}">HP: ${m.currentHp}/${m.maxHp}</p>
                </div>
            </div>
        `;
    });

    modalEl.innerHTML = `
        <!-- TOPO: INIMIGO EM DESTAQUE -->
        <div class="flex justify-between items-center bg-gradient-to-b from-red-950/80 to-black/80 border-2 border-red-600 p-4 rounded-3xl shadow-2xl">
            <div class="flex items-center gap-4">
                <div class="w-24 h-24 bg-black/60 rounded-2xl border border-red-500 flex items-center justify-center p-2">
                    <img src="${eMon.image}" class="w-20 h-20 object-contain drop-shadow-[0_0_10px_rgba(239,68,68,0.6)]" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                </div>
                <div>
                    <span class="text-[10px] font-black text-red-400 uppercase tracking-widest">${currentBattleSession.defender.name}</span>
                    <h3 class="text-lg font-black text-white">${eMon.name} <span class="text-xs text-amber-400">(Nv.${eMon.level})</span></h3>
                    <p class="text-xs font-bold text-red-300 mt-1">HP: ${eMon.currentHp} / ${eMon.maxHp} | STR: ${eMon.str}</p>
                </div>
            </div>
            <div class="flex gap-2">
                ${eReservesHtml || '<span class="text-[10px] text-slate-500">Sem reservas</span>'}
            </div>
        </div>

        <!-- CENTRO: AVISO / STATUS -->
        <div class="text-center my-auto space-y-2">
            <h2 class="text-2xl font-black text-amber-400 font-cinzel tracking-widest animate-pulse">ARENA DE COMBATE TCG</h2>
            <p class="text-xs text-slate-300">Clica abaixo para executar o ataque desta ronda!</p>
            <button onclick="executeArenaTurn()" class="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black px-8 py-3 rounded-2xl text-xs uppercase tracking-wider shadow-2xl transition-all transform hover:scale-105 cursor-pointer">
                ⚔️ Atacar / Rolar Dado de Combate
            </button>
        </div>

        <!-- FUNDO: JOGADOR ATIVO EM DESTAQUE E RESERVAS ABAIXO -->
        <div class="space-y-3">
            <div class="flex gap-2 overflow-x-auto pb-1 justify-center">
                ${pReservesHtml || '<span class="text-[10px] text-slate-500">Nenhum reserva na retaguarda</span>'}
            </div>

            <div class="flex justify-between items-center bg-gradient-to-t from-amber-950/80 to-black/80 border-2 border-amber-500 p-4 rounded-3xl shadow-2xl">
                <div class="flex items-center gap-4">
                    <div class="w-24 h-24 bg-black/60 rounded-2xl border border-amber-400 flex items-center justify-center p-2">
                        <img src="${pMon.image}" class="w-20 h-20 object-contain drop-shadow-[0_0_10px_rgba(255,215,0,0.6)]" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    </div>
                    <div>
                        <span class="text-[10px] font-black text-amber-400 uppercase tracking-widest">${currentBattleSession.challenger.name} (Você)</span>
                        <h3 class="text-lg font-black text-white">${pMon.name} <span class="text-xs text-amber-300">(Nv.${pMon.level})</span></h3>
                        <p class="text-xs font-bold text-emerald-400 mt-1">HP: ${pMon.currentHp} / ${pMon.maxHp} | STR: ${pMon.str}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// --- EXECUÇÃO DE TURNO MANUAL (ACIONADA PELO BOTÃO) ---
function executeArenaTurn() {
    let pMon = currentBattleSession.playerTeam[currentBattleSession.activePlayerIndex];
    let eMon = currentBattleSession.enemyTeam[currentBattleSession.activeEnemyIndex];

    if (typeof rollDiceWithAnimation === 'function') {
        rollDiceWithAnimation((pRoll, eRoll) => {
            const typeMult = (typeof calculateTypeAdvantageMultiplier === 'function') 
                ? calculateTypeAdvantageMultiplier(pMon.type, eMon.type) 
                : 1.0;

            const pPower = Math.round((pMon.str || 4) * typeMult) + pRoll;
            const ePower = (eMon.str || 5) + eRoll;

            if (pPower >= ePower) {
                let damageToEnemy = Math.max(10, pPower * 2);
                eMon.currentHp = Math.max(0, eMon.currentHp - damageToEnemy);

                showCustomPopup("Ataque Bem-Sucedido!", `✨ O seu ${pMon.name} desferiu um golpe certeiro!\n\n💥 O ${eMon.name} inimigo sofreu ${damageToEnemy} de dano!`, true);

                if (eMon.currentHp <= 0) {
                    if (currentBattleSession.activeEnemyIndex < currentBattleSession.enemyTeam.length - 1) {
                        currentBattleSession.activeEnemyIndex++;
                        let nextE = currentBattleSession.enemyTeam[currentBattleSession.activeEnemyIndex];
                        showCustomPopup("Inimigo Derrotado!", `💀 O Pokémon adversário desmaiou!\n\n🔄 O inimigo envia para campo: ${nextE.name}!`, true);
                    } else {
                        concludeArenaBattle(true);
                        return;
                    }
                }
            } else {
                let damageToPlayer = Math.max(8, ePower * 2);
                pMon.currentHp = Math.max(0, pMon.currentHp - damageToPlayer);

                showCustomPopup("Contra-Ataque Inimigo!", `💥 O ${eMon.name} adversário contra-atacou com força!\n\n💔 O seu ${pMon.name} sofreu ${damageToPlayer} de dano.`, false);

                if (pMon.currentHp <= 0) {
                    if (currentBattleSession.activePlayerIndex < currentBattleSession.playerTeam.length - 1) {
                        currentBattleSession.activePlayerIndex++;
                        let nextP = currentBattleSession.playerTeam[currentBattleSession.activePlayerIndex];
                        showCustomPopup("Substituição Obrigatória", `💀 O seu Anima desmaiou em campo!\n\n🔄 O próximo reserva entra automaticamente: ${nextP.name}!`, false);
                    } else {
                        concludeArenaBattle(false);
                        return;
                    }
                }
            }

            let arenaModal = document.getElementById('main-battle-arena-modal');
            if (arenaModal) renderArenaCombatUI(arenaModal);
        });
    }
}

function concludeArenaBattle(isVictory) {
    let arenaModal = document.getElementById('main-battle-arena-modal');
    if (arenaModal) arenaModal.remove();

    const cp = getCurrentPlayer();

    if (isVictory) {
        if (currentBattleSession.mode === 'gym') {
            const def = currentBattleSession.defender;
            if (!Array.isArray(cp.badges)) cp.badges = [];
            if (!cp.badges.includes(def.badgeKey)) {
                cp.badges.push(def.badgeKey);
            }
            cp.gold += def.rewardGold;

            showCustomPopup(
                "🏆 VITÓRIA ÉPICA NO GINÁSIO!",
                `Derrotaste toda a equipa do Líder!\n\n✨ Ganhaste a Insígnia!\n💰 Ouro: +${def.rewardGold}\n🎖️ Total de Insígnias: ${cp.badges.length} / 6`,
                true
            );
        } else {
            cp.gold += 150;
            showCustomPopup("🏆 VITÓRIA NO DUELO PVP!", `Derrotaste a equipa adversária com maestria!\n\n💰 Prémio: +150 Ouro!`, true);
        }

        if (typeof updatePlayerUI === 'function') updatePlayerUI();
        if (typeof appendAdventureLog === 'function') appendAdventureLog(`Batalha na Arena TCG concluída com vitória para ${cp.name}.`);
    } else {
        showCustomPopup(
            "💀 DERROTA NA ARENA",
            `Toda a tua equipa alinhada desmaiou em combate. Retira-te para o Centro Pokémon mais próximo para recuperares as forças.`,
            false
        );
        if (typeof appendAdventureLog === 'function') appendAdventureLog(`${cp.name} foi derrotado na Arena TCG.`);
    }

    currentBattleSession.playerTeam.forEach(updatedMon => {
        let original = cp.activeTeam.find(m => m.uniqueId === updatedMon.uniqueId);
        if (original) {
            original.currentHp = updatedMon.currentHp;
            original.str = updatedMon.str;
        }
    });

    if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
}