// --- MÓDULO DE ARENA DE BATALHA TCG (battle-arena.js) ---

if (typeof SUPABASE_STORAGE_URL === 'undefined') {
    var SUPABASE_STORAGE_URL = "https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/";
}

let currentBattleSession = {
    mode: 'gym',
    challenger: null,
    defender: null,
    format: 1,
    playerTeam: [],
    enemyTeam: [],
    activePlayerIndex: 0,
    activeEnemyIndex: 0,
    preBattleItemsUsed: 0,
    turnNumber: 1,
    turnBusy: false,
    battleEnded: false,
    playerSwitchedThisTurn: false,
    enemySwitchedThisTurn: false,
    combatBonus: 0,
    lastAction: 'Prepare-se para a batalha.'
};

function arenaHp(monster) {
    if (!monster) return 0;

    const hp = monster.currentHp !== undefined
        ? Number(monster.currentHp)
        : Number(monster.maxHp || monster.hp || 20);

    return Number.isFinite(hp) ? Math.max(0, hp) : 0;
}

function arenaMaxHp(monster) {
    if (!monster) return 1;

    const maxHp = Number(monster.maxHp || monster.hp || 20);
    return Number.isFinite(maxHp) && maxHp > 0 ? maxHp : 1;
}

function arenaIsHealthy(monster) {
    return arenaHp(monster) > 0;
}

function arenaSafeText(value, fallback = '') {
    return String(value ?? fallback)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function arenaImage(monster) {
    if (!monster) return '';

    if (monster.isShiny && monster.shinyImage) {
        return monster.shinyImage;
    }

    if (monster.image) {
        return monster.image;
    }

    if (monster.dexNumber) {
        const dex = String(monster.dexNumber).padStart(3, '0');

        return monster.isShiny
            ? `${SUPABASE_STORAGE_URL}monsters/shiny/${dex}.png`
            : `${SUPABASE_STORAGE_URL}monsters/${dex}.png`;
    }

    return '';
}

function arenaFindNextHealthy(team, currentIndex) {
    if (!Array.isArray(team)) return -1;

    for (let offset = 1; offset <= team.length; offset++) {
        const index = (currentIndex + offset) % team.length;

        if (arenaIsHealthy(team[index])) {
            return index;
        }
    }

    return -1;
}

function arenaFinishTurn() {
    if (currentBattleSession.battleEnded) return;

    currentBattleSession.turnBusy = false;
    currentBattleSession.playerSwitchedThisTurn = false;
    currentBattleSession.enemySwitchedThisTurn = false;
    currentBattleSession.turnNumber++;

    const modal = document.getElementById('main-battle-arena-modal');

    if (modal) {
        renderArenaCombatUI(modal);
    }
}

function arenaUpdateOriginalTeams() {
    const cp = getCurrentPlayer();

    if (cp && Array.isArray(cp.activeTeam)) {
        currentBattleSession.playerTeam.forEach(updatedMonster => {
            const original = cp.activeTeam.find(monster =>
                monster &&
                monster.uniqueId &&
                monster.uniqueId === updatedMonster.uniqueId
            );

            if (original) {
                original.currentHp = updatedMonster.currentHp;
                original.str = updatedMonster.str;
            }
        });
    }

    const opponent = currentBattleSession.defender?.opponentRef;

    if (opponent && Array.isArray(opponent.activeTeam)) {
        currentBattleSession.enemyTeam.forEach(updatedMonster => {
            const original = opponent.activeTeam.find(monster =>
                monster &&
                monster.uniqueId &&
                monster.uniqueId === updatedMonster.uniqueId
            );

            if (original) {
                original.currentHp = updatedMonster.currentHp;
                original.str = updatedMonster.str;
            }
        });
    }
}

// Ponto de entrada chamado pela engine principal
window.openBattleArena = function(config = {}) {
    const cp = getCurrentPlayer();

    if (!cp || !Array.isArray(cp.activeTeam)) {
        showCustomPopup("Aviso", "🚫 A Equipa Ativa não está disponível.", false);
        return;
    }

    const healthyPlayerCount = cp.activeTeam.filter(arenaIsHealthy).length;

    if (healthyPlayerCount === 0) {
        showCustomPopup(
            "Equipa Desmaiada",
            "⚠ Todos os Pokémon da tua equipa ativa estão desmaiados. Visita um Centro Pokémon.",
            false
        );
        return;
    }

    const requestedMode = ['gym', 'pvp', 'wild'].includes(config.type)
        ? config.type
        : 'gym';

    currentBattleSession = {
        mode: requestedMode,
        challenger: cp,
        defender: null,
        format: Math.max(1, Math.min(6, Number(config.format) || 1)),
        playerTeam: [],
        enemyTeam: [],
        activePlayerIndex: 0,
        activeEnemyIndex: 0,
        preBattleItemsUsed: 0,
        turnNumber: 1,
        turnBusy: false,
        battleEnded: false,
        playerSwitchedThisTurn: false,
        enemySwitchedThisTurn: false,
        combatBonus: 0,
        lastAction: 'Prepare-se para a batalha.'
    };

    if (requestedMode === 'gym') {
        const gym = config.data || {};
        const gymTeam = Array.isArray(gym.pokemons)
            ? gym.pokemons
            : gym.pokemon
                ? [gym.pokemon]
                : [];

        currentBattleSession.defender = {
            name: `Líder ${gym.leader || 'Desconhecido'} (${gym.city || 'Ginásio'})`,
            isGymLeader: true,
            badgeKey: gym.badgeKey || gym.badgeName || '',
            rewardGold: Number(gym.prize || gym.rewardGold) || 300,
            team: gymTeam
        };
    } else if (requestedMode === 'wild') {
        const wildPokemon = config.opponent;

        if (!wildPokemon) {
            showCustomPopup("Erro", "❌ Pokémon selvagem não encontrado.", false);
            return;
        }

        currentBattleSession.defender = {
            name: wildPokemon.name || 'Pokémon Selvagem',
            isGymLeader: false,
            isWild: true,
            team: [wildPokemon]
        };
    } else {
        const opponent = config.opponent;
        const opponentTeam = opponent && Array.isArray(opponent.activeTeam)
            ? opponent.activeTeam.filter(arenaIsHealthy)
            : [];

        if (!opponent || opponentTeam.length === 0) {
            showCustomPopup(
                "Erro",
                "❌ O treinador adversário não possui Pokémon aptos para batalhar.",
                false
            );
            return;
        }

        currentBattleSession.defender = {
            name: opponent.name || 'Treinador adversário',
            isGymLeader: false,
            isWild: false,
            opponentRef: opponent,
            team: opponentTeam
        };
    }

    const enemyHealthyCount = Array.isArray(currentBattleSession.defender.team)
        ? currentBattleSession.defender.team.filter(arenaIsHealthy).length
        : 0;

    if (enemyHealthyCount === 0) {
        showCustomPopup(
            "Batalha Indisponível",
            "❌ O adversário não possui Pokémon disponíveis para o combate.",
            false
        );
        return;
    }

    currentBattleSession.format = Math.max(
        1,
        Math.min(
            currentBattleSession.format,
            healthyPlayerCount,
            enemyHealthyCount
        )
    );

    openArenaTeamSelectionModal();
};

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

            let imgSrc = arenaImage(mon);

            html += `
                <div onclick="${isFainted ? '' : `toggleArenaSelection(${idx})`}" class="${tierBg} ${auraCls} p-3 rounded-2xl border-2 ${isSelected ? 'border-amber-400 bg-amber-950/80 scale-105 shadow-[0_0_15px_rgba(255,215,0,0.5)]' : 'border-amber-900/60'} ${isFainted ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-amber-500'} flex flex-col justify-between h-36 transition-all text-white">
                    <div class="flex justify-between items-center text-[10px] font-bold text-amber-300">
                        <span>${mon.name}</span>
                        <span>Nv.${mon.level || 1}</span>
                    </div>
                    <div class="my-auto flex justify-center bg-black/40 rounded p-1">
                        <img src="${imgSrc}" class="w-14 h-14 object-contain" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
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
                    <button onclick="document.getElementById('arena-team-sel-modal').remove();" class="text-amber-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-amber-800 cursor-pointer">✕ Cancelar</button>
                </div>
                <div class="grid grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1">
                    ${html}
                </div>
                <div class="flex gap-2">
                    <button onclick="document.getElementById('arena-team-sel-modal').remove();" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer">
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
                <button onclick="useItemInPreBattle('${item.id}', ${itemIdx})" class="bg-amber-600 hover:bg-amber-500 text-black font-black px-3 py-1 rounded-lg text-[10px] shadow cursor-pointer">
                    Usar
                </button>
            </div>
        `;
    });

    let activeImg = arenaImage(activeMon);

    modalEl.innerHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <span class="text-xs font-black text-amber-400 font-cinzel">🧪 FASE PRÉ-BATALHA</span>
                <span class="text-[10px] text-amber-300">Preparar Combatente</span>
            </div>

            <div class="bg-black/50 p-3 rounded-2xl border border-amber-900/40 flex items-center gap-3">
                <img src="${activeImg}" class="w-12 h-12 object-contain" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
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

window.confirmArenaTeamAndStart = function(indexes) {
    const modal = document.getElementById('arena-team-sel-modal');
    if (modal) modal.remove();

    const cp = getCurrentPlayer();
    const selectedIndexes = Array.isArray(indexes)
        ? indexes.map(Number).filter(Number.isInteger)
        : [];

    const validSelection = selectedIndexes.length === currentBattleSession.format &&
        new Set(selectedIndexes).size === selectedIndexes.length &&
        selectedIndexes.every(index =>
            cp.activeTeam[index] && arenaIsHealthy(cp.activeTeam[index])
        );

    if (!validSelection) {
        showCustomPopup(
            "Seleção Inválida",
            "⚠️ Escolha exatamente os Pokémon disponíveis para este formato.",
            false
        );
        return;
    }

    currentBattleSession.playerTeam = selectedIndexes.map(index => {
        const monster = cp.activeTeam[index];

        return {
            ...monster,
            image: arenaImage(monster),
            currentHp: arenaHp(monster),
            maxHp: arenaMaxHp(monster),
            str: Number(monster.str) || 4,
            level: Number(monster.level) || 1
        };
    });

    currentBattleSession.enemyTeam = currentBattleSession.defender.team
        .filter(arenaIsHealthy)
        .slice(0, currentBattleSession.format)
        .map(monster => ({
            ...monster,
            image: arenaImage(monster),
            currentHp: arenaHp(monster) || arenaMaxHp(monster),
            maxHp: arenaMaxHp(monster),
            str: Number(monster.str) || 5,
            level: Number(monster.level) || 5
        }));

    if (currentBattleSession.enemyTeam.length === 0) {
        showCustomPopup(
            "Batalha Inválida",
            "❌ Não foi possível preparar a equipa adversária.",
            false
        );
        return;
    }

    currentBattleSession.activePlayerIndex = 0;
    currentBattleSession.activeEnemyIndex = 0;
    currentBattleSession.turnNumber = 1;
    currentBattleSession.turnBusy = false;
    currentBattleSession.battleEnded = false;
    currentBattleSession.playerSwitchedThisTurn = false;
    currentBattleSession.enemySwitchedThisTurn = false;
    currentBattleSession.combatBonus = 0;
    currentBattleSession.lastAction = 'A batalha começou.';

    if (
        currentBattleSession.mode === 'gym' &&
        typeof gymAttemptedThisTurn !== 'undefined'
    ) {
        const city = currentBattleSession.defender.name || 'Ginásio';
        const attemptKey = `${gameState.currentPlayerIndex || 0}_${city}`;
        gymAttemptedThisTurn[attemptKey] = true;
    }

    openPreBattlePhaseModal();
};

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
    const cp = getCurrentPlayer();
    const pMon = currentBattleSession.playerTeam[currentBattleSession.activePlayerIndex];
    const eMon = currentBattleSession.enemyTeam[currentBattleSession.activeEnemyIndex];

    if (!pMon || !eMon || currentBattleSession.battleEnded) {
        return;
    }

    const isGymBattle = (currentBattleSession.mode === 'gym');

    let pReservesHtml = '';
    currentBattleSession.playerTeam.forEach((m, idx) => {
        if (idx === currentBattleSession.activePlayerIndex) return;
        const isFaint = m.currentHp <= 0;
        let mImg = arenaImage(m);

        pReservesHtml += `
            <button
                type="button"
                onclick="${isFaint ? '' : `switchArenaPlayerPokemon(${idx})`}"
                ${isFaint || currentBattleSession.turnBusy ? 'disabled' : ''}
                class="flex items-center gap-1.5 bg-black/60 border ${isFaint ? 'border-red-800 opacity-40 cursor-not-allowed' : 'border-amber-600 hover:border-amber-300 cursor-pointer'} rounded-xl p-1.5 px-3 text-[10px] text-left"
                title="${isFaint ? 'Pokémon desmaiado' : 'Trocar, a troca encerra o turno'}"
            >
                <img src="${mImg}" class="w-6 h-6 object-contain" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                <span>
                    <strong class="font-bold text-white">${arenaSafeText(m.name)}</strong>
                    <span class="${isFaint ? 'text-red-400' : 'text-emerald-400'} block">HP: ${m.currentHp}/${m.maxHp}</span>
                </span>
            </button>
        `;
    });

    let eReservesHtml = '';
    let arenaItemsHtml = '';

    if (cp && Array.isArray(cp.inventory)) {
        cp.inventory.forEach(item => {
            if (!item || Number(item.count) <= 0) return;

            const supportedItem =
                item.type === 'heal' ||
                item.type === 'revive' ||
                item.type === 'battle';

            if (!supportedItem) return;

            arenaItemsHtml += `
                <button
                    onclick="useArenaItem('${item.id}')"
                    ${currentBattleSession.turnBusy ? 'disabled' : ''}
                    class="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black px-2.5 py-1.5 rounded-lg text-[10px] shadow cursor-pointer"
                    title="Itens não encerram o turno"
                >
                    ${arenaSafeText(item.icon || '🎒')} ${arenaSafeText(item.name || item.id)}
                    (${Number(item.count) || 0})
                </button>
            `;
        });
    }

    currentBattleSession.enemyTeam.forEach((m, idx) => {
        if (idx === currentBattleSession.activeEnemyIndex) return;
        const isFaint = m.currentHp <= 0;
        let mImg = arenaImage(m);

        eReservesHtml += `
            <div class="flex items-center gap-1.5 bg-black/60 border ${isFaint ? 'border-red-800 opacity-40' : 'border-red-600'} rounded-xl p-1.5 px-3 text-[10px]">
                <img src="${mImg}" class="w-6 h-6 object-contain" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                <div>
                    <p class="font-bold text-white">${m.name}</p>
                    <p class="${isFaint ? 'text-red-400' : 'text-amber-400'}">HP: ${m.currentHp}/${m.maxHp}</p>
                </div>
            </div>
        `;
    });

    let pActiveImg = arenaImage(pMon);
    let eActiveImg = arenaImage(eMon);

    // Aviso explícito de combate oficial sem captura para ginásios
    let gymNoticeHtml = isGymBattle ? `
        <div class="bg-amber-950/80 border border-amber-600/80 rounded-xl py-1 px-3 text-[10px] text-amber-300 font-bold tracking-wide">
            🛡️ Batalha Oficial de Ginásio — Captura Proibida
        </div>
    ` : '';

    modalEl.innerHTML = `
        <div class="flex justify-between items-center bg-gradient-to-b from-red-950/80 to-black/80 border-2 border-red-600 p-4 rounded-3xl shadow-2xl">
            <div class="flex items-center gap-4">
                <div class="w-24 h-24 bg-black/60 rounded-2xl border border-red-500 flex items-center justify-center p-2">
                    <img src="${eActiveImg}" class="w-20 h-20 object-contain drop-shadow-[0_0_10px_rgba(239,68,68,0.6)]" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
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

        <div class="text-center my-auto space-y-3">
            <h2 class="text-2xl font-black text-amber-400 font-cinzel tracking-widest animate-pulse">
                ARENA DE COMBATE TCG
            </h2>

            ${gymNoticeHtml}

            <p class="text-xs text-slate-300">
                Turno ${currentBattleSession.turnNumber}
                ${currentBattleSession.mode === 'pvp' ? '| Duelo por turnos' : '| Ação da rodada'}
            </p>

            <p class="text-[10px] text-amber-300">
                ${arenaSafeText(currentBattleSession.lastAction)}
            </p>

            <button
                onclick="executeArenaTurn()"
                ${currentBattleSession.turnBusy ? 'disabled' : ''}
                class="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-black px-8 py-3 rounded-2xl text-xs uppercase tracking-wider shadow-2xl transition-all transform hover:scale-105 cursor-pointer"
            >
                ⚔️ Atacar / Rolar Dado
            </button>

            <div class="bg-black/60 border border-blue-700/60 rounded-xl p-2 space-y-2">
                <p class="text-[10px] font-bold text-blue-300">
                    Itens, não encerram o turno
                </p>
                <div class="flex flex-wrap justify-center gap-1.5">
                    ${arenaItemsHtml || '<span class="text-[9px] text-slate-500">Nenhum item de suporte disponível.</span>'}
                </div>
            </div>

            <p class="text-[9px] text-slate-400">
                Trocar Pokémon encerra o turno e permite apenas uma troca por rodada.
            </p>
        </div>

        <div class="space-y-3">
            <div class="flex gap-2 overflow-x-auto pb-1 justify-center">
                ${pReservesHtml || '<span class="text-[10px] text-slate-500">Nenhum reserva na retaguarda</span>'}
            </div>

            <div class="flex justify-between items-center bg-gradient-to-t from-amber-950/80 to-black/80 border-2 border-amber-500 p-4 rounded-3xl shadow-2xl">
                <div class="flex items-center gap-4">
                    <div class="w-24 h-24 bg-black/60 rounded-2xl border border-amber-400 flex items-center justify-center p-2">
                        <img src="${pActiveImg}" class="w-20 h-20 object-contain drop-shadow-[0_0_10px_rgba(255,215,0,0.6)]" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
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

function arenaSwitchEnemyAfterFaint() {
    const nextIndex = arenaFindNextHealthy(
        currentBattleSession.enemyTeam,
        currentBattleSession.activeEnemyIndex
    );

    if (nextIndex < 0) {
        concludeArenaBattle(true);
        return false;
    }

    currentBattleSession.activeEnemyIndex = nextIndex;
    currentBattleSession.enemySwitchedThisTurn = true;
    currentBattleSession.lastAction =
        `O adversário enviou ${currentBattleSession.enemyTeam[nextIndex].name}.`;

    showCustomPopup(
        "Pokémon Adversário Derrotado",
        `💀 O Pokémon adversário desmaiou!\n\n🔄 ${currentBattleSession.enemyTeam[nextIndex].name} entrou em campo.`,
        true
    );

    return true;
}

function arenaForcePlayerReplacement() {
    const nextIndex = arenaFindNextHealthy(
        currentBattleSession.playerTeam,
        currentBattleSession.activePlayerIndex
    );

    if (nextIndex < 0) {
        concludeArenaBattle(false);
        return false;
    }

    currentBattleSession.activePlayerIndex = nextIndex;
    currentBattleSession.lastAction =
        `${currentBattleSession.playerTeam[nextIndex].name} entrou automaticamente em campo.`;

    showCustomPopup(
        "Substituição Obrigatória",
        `💀 O Pokémon ativo desmaiou!\n\n🔄 ${currentBattleSession.playerTeam[nextIndex].name} entrou automaticamente em campo.`,
        false
    );

    return true;
}

function arenaTypeMultiplier(attacker, defender) {
    if (
        typeof calculateTypeAdvantageMultiplier !== 'function' ||
        !attacker ||
        !defender
    ) {
        return 1;
    }

    return calculateTypeAdvantageMultiplier(
        attacker.type,
        defender.type
    );
}

function arenaShouldEnemySwitch() {
    if (
        currentBattleSession.mode === 'wild' ||
        currentBattleSession.enemySwitchedThisTurn
    ) {
        return false;
    }

    const enemyTeam = currentBattleSession.enemyTeam;
    const activeIndex = currentBattleSession.activeEnemyIndex;
    const activeEnemy = enemyTeam[activeIndex];
    const playerMonster =
        currentBattleSession.playerTeam[currentBattleSession.activePlayerIndex];

    if (!activeEnemy || !playerMonster) return false;

    const replacementIndex = arenaFindNextHealthy(
        enemyTeam,
        activeIndex
    );

    if (replacementIndex < 0) return false;

    const activeHpRatio =
        arenaHp(activeEnemy) / arenaMaxHp(activeEnemy);

    const activeMultiplier =
        arenaTypeMultiplier(activeEnemy, playerMonster);

    const replacement = enemyTeam[replacementIndex];
    const replacementMultiplier =
        arenaTypeMultiplier(replacement, playerMonster);

    return (
        activeHpRatio <= 0.3 &&
        replacementMultiplier > activeMultiplier
    ) || (
        activeMultiplier < 1 &&
        replacementMultiplier > activeMultiplier
    );
}

function arenaResolveEnemyResponse() {
    const pMon =
        currentBattleSession.playerTeam[currentBattleSession.activePlayerIndex];

    const eMon =
        currentBattleSession.enemyTeam[currentBattleSession.activeEnemyIndex];

    if (!pMon || !eMon || currentBattleSession.battleEnded) return;

    if (arenaShouldEnemySwitch()) {
        const nextIndex = arenaFindNextHealthy(
            currentBattleSession.enemyTeam,
            currentBattleSession.activeEnemyIndex
        );

        if (nextIndex >= 0) {
            currentBattleSession.activeEnemyIndex = nextIndex;
            currentBattleSession.enemySwitchedThisTurn = true;

            const nextEnemy =
                currentBattleSession.enemyTeam[nextIndex];

            currentBattleSession.lastAction =
                `O adversário trocou para ${nextEnemy.name}.`;

            showCustomPopup(
                "Troca do Adversário",
                `🔄 O adversário percebeu uma desvantagem e enviou ${nextEnemy.name} para o combate.\n\nA troca encerrou a rodada.`,
                true
            );

            arenaFinishTurn();
            return;
        }
    }

    rollDiceWithAnimation((playerRoll, enemyRoll) => {
        const typeMultiplier =
            arenaTypeMultiplier(eMon, pMon);

        const playerPower =
            (Number(pMon.str) || 4) +
            Number(currentBattleSession.combatBonus) +
            Number(playerRoll || 0);

        const enemyPower = Math.round(
            (
                (Number(eMon.str) || 5) +
                Number(enemyRoll || 0)
            ) *
            typeMultiplier
        );

        const enemyWon = enemyPower >= playerPower;

        const damage = enemyWon
            ? Math.max(6, enemyPower - playerPower + 8)
            : Math.max(4, Math.floor((enemyPower - playerPower + 8) / 2));

        pMon.currentHp = Math.max(
            0,
            arenaHp(pMon) - damage
        );

        currentBattleSession.lastAction = enemyWon
            ? `${eMon.name} atacou ${pMon.name} e causou ${damage} de dano.`
            : `${pMon.name} resistiu ao ataque de ${eMon.name}.`;

        showCustomPopup(
            enemyWon
                ? "Contra-ataque do Adversário!"
                : "Defesa Bem-Sucedida!",
            enemyWon
                ? `${eMon.name} respondeu à ação!\n\n💥 ${pMon.name} sofreu ${damage} de dano.\n\nHP: ${pMon.currentHp}/${pMon.maxHp}`
                : `${pMon.name} resistiu ao ataque de ${eMon.name}.\n\nDano reduzido: ${damage}\n\nHP: ${pMon.currentHp}/${pMon.maxHp}`,
            enemyWon ? false : true
        );

        if (!arenaIsHealthy(pMon)) {
            if (!arenaForcePlayerReplacement()) return;
        }

        arenaFinishTurn();
    });
}

window.switchArenaPlayerPokemon = function(index) {
    if (currentBattleSession.battleEnded || currentBattleSession.turnBusy) {
        return;
    }

    const targetIndex = Number(index);
    const currentIndex = currentBattleSession.activePlayerIndex;
    const target = currentBattleSession.playerTeam[targetIndex];

    if (!Number.isInteger(targetIndex) || !target || targetIndex === currentIndex) {
        return;
    }

    if (!arenaIsHealthy(target)) {
        showCustomPopup(
            "Troca Bloqueada",
            "⚠️ Este Pokémon está desmaiado e não pode entrar em campo.",
            false
        );
        return;
    }

    if (currentBattleSession.playerSwitchedThisTurn) {
        showCustomPopup(
            "Troca já realizada",
            "⚠️ Só é permitida uma troca voluntária por turno.",
            false
        );
        return;
    }

    currentBattleSession.activePlayerIndex = targetIndex;
    currentBattleSession.playerSwitchedThisTurn = true;
    currentBattleSession.turnBusy = true;
    currentBattleSession.lastAction =
        `${target.name} entrou em campo. A troca encerrou o turno.`;

    showCustomPopup(
        "Troca de Pokémon",
        `🔄 ${target.name} entrou em campo.\n\nA troca encerra o teu turno. O adversário poderá responder agora.`,
        true
    );

    arenaResolveEnemyResponse();
};

window.useArenaItem = function(itemId) {
    if (currentBattleSession.battleEnded || currentBattleSession.turnBusy) {
        return;
    }

    const cp = getCurrentPlayer();

    const item = cp && Array.isArray(cp.inventory)
        ? cp.inventory.find(entry =>
            entry &&
            entry.id === itemId &&
            Number(entry.count) > 0
        )
        : null;

    const activeMon =
        currentBattleSession.playerTeam[currentBattleSession.activePlayerIndex];

    if (!item || !activeMon) {
        showCustomPopup(
            "Item Indisponível",
            "❌ Este item não está disponível para uso.",
            false
        );
        return;
    }

    const currentHp = arenaHp(activeMon);
    const maxHp = arenaMaxHp(activeMon);
    let itemWasUsed = false;

    if (item.type === 'heal') {
        if (currentHp >= maxHp) {
            showCustomPopup(
                "Item não utilizado",
                "✨ O Pokémon ativo já está com HP máximo.",
                false
            );
            return;
        }

        const healing = Math.max(1, Number(item.value) || 20);

        activeMon.currentHp = Math.min(
            maxHp,
            currentHp + healing
        );

        item.count--;
        itemWasUsed = true;

        currentBattleSession.lastAction =
            `${activeMon.name} recuperou ${healing} HP.`;

        showCustomPopup(
            "Item Usado",
            `💊 ${item.name || 'Potion'} usada em ${activeMon.name}.\n\nHP: ${activeMon.currentHp}/${maxHp}\n\nO item não encerra o turno. Ainda podes atacar ou trocar.`,
            true
        );
    } else if (item.type === 'revive') {
        const faintedTarget =
            currentBattleSession.playerTeam.find(monster =>
                !arenaIsHealthy(monster)
            );

        if (!faintedTarget) {
            showCustomPopup(
                "Item não utilizado",
                "⚠️ Não há Pokémon desmaiado disponível para usar o Revive.",
                false
            );
            return;
        }

        const reviveMaxHp = arenaMaxHp(faintedTarget);

        faintedTarget.currentHp = Math.max(
            1,
            Math.floor(reviveMaxHp / 2)
        );

        item.count--;
        itemWasUsed = true;

        currentBattleSession.lastAction =
            `${faintedTarget.name} foi revivido.`;

        showCustomPopup(
            "Revive Usado",
            `🌟 ${faintedTarget.name} foi revivido com ${faintedTarget.currentHp} HP.\n\nO item não encerra o turno.`,
            true
        );
    } else if (item.type === 'battle') {
        const bonus = Math.max(
            1,
            Number(item.value) || 2
        );

        currentBattleSession.combatBonus += bonus;
        item.count--;
        itemWasUsed = true;

        currentBattleSession.lastAction =
            `Bónus de combate aumentado em +${bonus}.`;

        showCustomPopup(
            "Bónus Aplicado",
            `🧪 ${item.name || 'Vitamin'} aplicado.\n\nBónus acumulado nesta batalha: +${currentBattleSession.combatBonus}\n\nO item não encerra o turno. Ainda podes atacar ou trocar.`,
            true
        );
    } else {
        showCustomPopup(
            "Item Indisponível",
            "ℹ️ Este item não pode ser usado durante a batalha da Arena.",
            false
        );
        return;
    }

    if (!itemWasUsed) return;

    if (typeof updatePlayerUI === 'function') {
        updatePlayerUI();
    }

    if (typeof renderTeamCardSlots === 'function') {
        renderTeamCardSlots();
    }

    if (typeof renderBottomPanel === 'function') {
        renderBottomPanel();
    }

    const arenaModal =
        document.getElementById('main-battle-arena-modal');

    if (arenaModal) {
        renderArenaCombatUI(arenaModal);
    }
};

window.executeArenaTurn = function() {
    if (
        currentBattleSession.battleEnded ||
        currentBattleSession.turnBusy
    ) {
        return;
    }

    const pMon =
        currentBattleSession.playerTeam[currentBattleSession.activePlayerIndex];

    const eMon =
        currentBattleSession.enemyTeam[currentBattleSession.activeEnemyIndex];

    if (!pMon || !eMon || !arenaIsHealthy(pMon) || !arenaIsHealthy(eMon)) {
        return;
    }

    currentBattleSession.turnBusy = true;

    rollDiceWithAnimation((playerRoll, enemyRoll) => {
        const typeMult =
            typeof calculateTypeAdvantageMultiplier === 'function'
                ? calculateTypeAdvantageMultiplier(pMon.type, eMon.type)
                : 1;

        const playerPower = Math.round(
            ((Number(pMon.str) || 4) +
                Number(currentBattleSession.combatBonus) +
                Number(playerRoll || 0)) *
            typeMult
        );

        const enemyPower =
            (Number(eMon.str) || 5) +
            Number(enemyRoll || 0);

        if (playerPower >= enemyPower) {
            const damage = Math.max(
                8,
                playerPower - enemyPower + 10
            );

            eMon.currentHp = Math.max(
                0,
                arenaHp(eMon) - damage
            );

            currentBattleSession.lastAction =
                `${pMon.name} causou ${damage} de dano em ${eMon.name}.`;

            showCustomPopup(
                "Ataque Bem-Sucedido!",
                `⚔️ ${pMon.name} venceu a disputa da rodada!\n\n💥 ${eMon.name} sofreu ${damage} de dano.\n\nHP adversário: ${eMon.currentHp}/${eMon.maxHp}`,
                true
            );

            if (!arenaIsHealthy(eMon)) {
                if (!arenaSwitchEnemyAfterFaint()) return;
            }
        } else {
            const damage = Math.max(
                8,
                enemyPower - playerPower + 8
            );

            pMon.currentHp = Math.max(
                0,
                arenaHp(pMon) - damage
            );

            currentBattleSession.lastAction =
                `${eMon.name} causou ${damage} de dano em ${pMon.name}.`;

            showCustomPopup(
                "Contra-ataque do Adversário!",
                `💥 ${eMon.name} venceu a disputa da rodada!\n\n💔 ${pMon.name} sofreu ${damage} de dano.\n\nHP do teu Pokémon: ${pMon.currentHp}/${pMon.maxHp}`,
                false
            );

            if (!arenaIsHealthy(pMon)) {
                if (!arenaForcePlayerReplacement()) return;
            }
        }

        arenaFinishTurn();
    });
};

function concludeArenaBattle(isVictory) {
    if (currentBattleSession.battleEnded) return;

    currentBattleSession.battleEnded = true;
    currentBattleSession.turnBusy = false;

    const arenaModal = document.getElementById('main-battle-arena-modal');
    if (arenaModal) arenaModal.remove();

    const cp = getCurrentPlayer();
    arenaUpdateOriginalTeams();

    if (isVictory) {
        if (currentBattleSession.mode === 'gym') {
            const def = currentBattleSession.defender;

            if (!Array.isArray(cp.badges)) {
                cp.badges = [];
            }

            if (def.badgeKey && !cp.badges.includes(def.badgeKey)) {
                cp.badges.push(def.badgeKey);
            }

            cp.gold = (Number(cp.gold) || 0) + (Number(def.rewardGold) || 300);

            showCustomPopup(
                "🏆 VITÓRIA ÉPICA NO GINÁSIO!",
                `Derrotaste toda a equipa do Líder!\n\n✨ Ganhaste a Insígnia!\n💰 Ouro: +${Number(def.rewardGold) || 300}\n🎖️ Total de Insígnias: ${cp.badges.length} / 6`,
                true
            );
        } else if (currentBattleSession.mode === 'wild') {
            const defeatedMon = currentBattleSession.enemyTeam[0];

            if (
                defeatedMon &&
                defeatedMon.waypointId &&
                typeof boardPokemonCards !== 'undefined' &&
                boardPokemonCards[defeatedMon.waypointId]
            ) {
                boardPokemonCards[defeatedMon.waypointId].weakened = true;
                boardPokemonCards[defeatedMon.waypointId].currentHp = 0;
            }

            showCustomPopup(
                "🏆 VITÓRIA SOBRE O SELVAGEM!",
                "Derrotaste o Pokémon selvagem!\n\n🩹 Ele ficou enfraquecido e pode ser capturado.",
                true
            );
        } else {
            cp.gold = (Number(cp.gold) || 0) + 150;

            showCustomPopup(
                "🏆 VITÓRIA NO DUELO PVP!",
                "Derrotaste a equipa adversária em um combate por turnos!\n\n💰 Prémio: +150 Ouro.",
                true
            );
        }

        if (typeof appendAdventureLog === 'function') {
            appendAdventureLog(
                `Batalha na Arena TCG concluída com vitória para ${cp.name}.`
            );
        }
    } else {
        showCustomPopup(
            "💀 DERROTA NA ARENA",
            "Toda a tua equipa alinhada desmaiou em combate. Visita um Centro Pokémon para recuperar as forças.",
            false
        );

        if (typeof appendAdventureLog === 'function') {
            appendAdventureLog(
                `${cp.name} foi derrotado na Arena TCG.`
            );
        }
    }

    if (typeof updatePlayerUI === 'function') {
        updatePlayerUI();
    }

    if (typeof renderTeamCardSlots === 'function') {
        renderTeamCardSlots();
    }

    if (typeof renderBottomPanel === 'function') {
        renderBottomPanel();
    }
}
