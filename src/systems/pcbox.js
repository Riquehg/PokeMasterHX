// --- src/systems/pcbox.js ---
// Subsistema de Gestão de Equipa, PC Box, Paginação, Drag-and-Drop, XP e Evoluções

import { gameState, getCurrentPlayer } from '../core/state.js';
import { SUPABASE_STORAGE_URL } from '../config/constants.js';
import { MONSTER_CATALOG } from '../config/cards-data.js';

const MONSTER_CATALOG_REF = Array.isArray(MONSTER_CATALOG) ? MONSTER_CATALOG : [];

export function getTierColorClass(tier) {
    switch (tier) {
        case 2: return 'bg-gradient-to-b from-green-950 to-black border-green-600 ';
        case 3: return 'bg-gradient-to-b from-blue-950 to-black border-blue-600 ';
        case 4: return 'bg-gradient-to-b from-red-950 to-black border-red-600 ';
        case 5: return 'bg-gradient-to-b from-yellow-950 to-black border-yellow-500 ';
        default: return 'bg-gradient-to-b from-slate-900 to-black border-slate-700 ';
    }
}

export function handleDragStart(e, sourceArea, index) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ sourceArea, index }));
}

export function handleDragOver(e) {
    e.preventDefault();
}

export function handleDrop(e, targetArea, targetIndex) {
    e.preventDefault();
    const cp = getCurrentPlayer();
    const dataRaw = e.dataTransfer.getData('text/plain');
    if (!dataRaw) return;

    try {
        const data = JSON.parse(dataRaw);
        if (!data.sourceArea) return;
        if (!cp.activeTeam) cp.activeTeam = [];
        if (!cp.pcBox) cp.pcBox = [];

        const sourceList = data.sourceArea === 'team' ? cp.activeTeam : cp.pcBox;
        const targetList = targetArea === 'team' ? cp.activeTeam : cp.pcBox;
        const movedMonster = sourceList[data.index];
        if (!movedMonster) return;

        if (targetArea === 'team') {
            const tier = movedMonster.tier || 1;
            const badgeCount = Array.isArray(cp.badges) ? cp.badges.length : 0;

            if (tier === 3 && badgeCount < 1) {
                showCustomPopup("Portão de Insígnia", "⚠ Precisas de pelo menos 1 insígnia para colocar um Pokémon Tier 3 (Azul) na Equipa Ativa!", false);
                return;
            }
            if (tier === 4 && badgeCount < 3) {
                showCustomPopup("Portão de Insígnia", "⚠ Precisas de pelo menos 3 insígnias para colocar um Pokémon Tier 4 (Vermelho) na Equipa Ativa!", false);
                return;
            }
            if (tier === 5 && badgeCount < 4) {
                showCustomPopup("Portão de Insígnia", "⚠ Precisas de pelo menos 4 insígnias para colocar um Pokémon Tier 5 (Amarelo/Lendário) na Equipa Ativa!", false);
                return;
            }
        }

        sourceList.splice(data.index, 1);
        if (targetArea === 'team') targetList.push(movedMonster);
        else targetList.splice(targetIndex, 0, movedMonster);

        renderTeamCardSlots();
        renderBottomPanel();
    } catch (err) {}
}

export function renderTeamCardSlots() {
    const cp = getCurrentPlayer();
    for (let i = 0; i < 6; i++) {
        const slotContainer = document.getElementById(`trainer-card-slot-${i}`) || document.getElementById(`team-slot-${i}`) || document.getElementById(`team-card-slot-${i}`);
        if (!slotContainer) continue;

        const monster = cp.activeTeam ? cp.activeTeam[i] : null;
        if (monster) {
            const activeImg = monster.isShiny && monster.shinyImage ? monster.shinyImage : monster.image;
            const visualContent = activeImg 
                ? `<img src="${activeImg}" alt="${monster.name}" class="w-full h-12 object-contain ${monster.currentHp <= 0 ? 'grayscale opacity-50' : ''}">`
                : `<span class="text-xl">👾</span>`;

            const curHp = monster.currentHp !== undefined ? monster.currentHp : (monster.maxHp || 20);
            const maxHp = monster.maxHp || monster.hp || 20;
            const isFainted = curHp <= 0;
            const shinyMarker = monster.isShiny ? '<span class="absolute top-0.5 right-0.5 text-[7px] font-black bg-amber-400 text-black px-1 rounded animate-pulse">✨SHINY</span>' : '';
            const tierCardBg = getTierColorClass(monster.tier || 1);

            slotContainer.innerHTML = `
                <div draggable="true" ondragstart="handleDragStart(event, 'team', ${i})" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'team', ${i})" onclick="event.stopPropagation(); if(typeof openPokemonDetailModal==='function') openPokemonDetailModal('${monster.uniqueId || monster.id}', 'team')" class="${tierCardBg}${isFainted ? 'from-red-950 to-red-900 border-red-600 text-red-200' : ''} ${monster.isShiny ? 'border-amber-400' : 'border-amber-600'} border rounded p-1 flex flex-col justify-between h-20 shadow cursor-pointer hover:brightness-105 transition-all relative text-white">
                    ${shinyMarker}
                    <div class="flex justify-between items-center text-[8px] font-bold">
                        <span class="truncate">${monster.name}</span>
                        <span>Nv.${monster.level || 1}</span>
                    </div>
                    <div class="my-auto bg-black/40 rounded border border-amber-400/50 flex items-center justify-center p-0.5 h-10 relative">
                        ${visualContent}${isFainted ? '<span class="absolute text-[7px] font-black bg-red-600 text-white px-1 rounded">DESMAIADO</span>' : ''}
                    </div>
                    <div class="text-[7px] text-center font-bold text-amber-300">
                        HP: ${curHp}/${maxHp} | STR:${monster.str || 4}
                    </div>
                </div>
            `;
        } else {
            slotContainer.innerHTML = `
                <div ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'team', ${i})" class="border border-dashed border-amber-500/40 rounded bg-black/20 flex items-center justify-center text-[9px] text-amber-500/50 h-20">
                    Slot ${i + 1} (Vazio)
                </div>
            `;
        }
    }
}

export function renderBottomPanel() {
    const cp = getCurrentPlayer();
    const container = document.getElementById('bottom-dynamic-container');
    const titleElement = document.getElementById('bottom-panel-title');
    if (!container) return;
    container.innerHTML = '';

    if (gameState.currentBottomView === 'inventory') {
        if (titleElement) titleElement.innerText = 'Mochila (Itens & Orbes)';
        if (cp.inventory) {
            cp.inventory.forEach((item) => {
                if (!item || item.count <= 0) return;
                
                const slot = document.createElement('div');
                slot.className = 'flex flex-col justify-between p-2 border border-amber-700 bg-black/80 rounded-xl h-24 shadow cursor-pointer hover:border-amber-400 transition-all text-white relative';
                slot.onclick = () => {
                    if (typeof useInventoryItemMainScreen === 'function') useInventoryItemMainScreen(item.id);
                };
                
                let itemImgUrl = item.image;
                if (item.id === 'ball_poke' || item.id === 'poke_ball') {
                    itemImgUrl = `${SUPABASE_STORAGE_URL}items/poke_ball.png`;
                } else if (!itemImgUrl) {
                    itemImgUrl = `${SUPABASE_STORAGE_URL}items/${item.id}.png`;
                }

                const itemVisual = `<img src="${itemImgUrl}" alt="${item.name}" class="w-10 h-10 object-contain drop-shadow" onerror="this.src='https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/items/poke_ball.png'">`;

                slot.innerHTML = `
                    <div class="flex justify-between items-center text-[10px] font-bold">
                        <span class="text-amber-300 truncate">${item.name}</span>
                        <span class="bg-amber-600 text-black font-black text-[9px] px-1.5 py-0.2 rounded-full">Qtd: ${item.count}</span>
                    </div>
                    <div class="flex justify-center items-center my-auto">
                        ${itemVisual}
                    </div>
                    <div class="text-[8px] text-slate-400 text-center truncate">
                        ${item.desc || 'Item útil'}
                    </div>
                `;
                container.appendChild(slot);
            });
        }
    } else {
        const totalBoxes = cp.pcBox ? cp.pcBox.length : 0;
        const maxPages = Math.max(0, Math.ceil(totalBoxes / 12) - 1);
        if ((gameState.pcBoxCurrentPage || 0) > maxPages) gameState.pcBoxCurrentPage = maxPages;
        const currentPage = gameState.pcBoxCurrentPage || 0;

        if (titleElement) {
            titleElement.innerHTML = `
                <span>Banco PC Box (Página ${currentPage + 1} de ${maxPages + 1})</span>
                <div class="flex gap-2">
                    <button onclick="changePcBoxPage(-1)" class="bg-amber-600 hover:bg-amber-500 px-2 py-0.5 rounded text-[10px] text-black font-bold cursor-pointer">◀</button>
                    <button onclick="changePcBoxPage(1)" class="bg-amber-600 hover:bg-amber-500 px-2 py-0.5 rounded text-[10px] text-black font-bold cursor-pointer">▶</button>
                </div>
            `;
        }

        const pageSize = 12;
        const startIndex = currentPage * pageSize;

        for (let i = 0; i < pageSize; i++) {
            const realIndex = startIndex + i;
            const monster = cp.pcBox ? cp.pcBox[realIndex] : null;
            const slot = document.createElement('div');
            
            if (monster) {
                slot.draggable = true;
                slot.ondragstart = (e) => handleDragStart(e, 'pcbox', realIndex);
                slot.ondragover = handleDragOver;
                slot.ondrop = (e) => handleDrop(e, 'pcbox', realIndex);
                slot.onclick = () => {
                    if (typeof openPokemonDetailModal === 'function') openPokemonDetailModal(monster.uniqueId || monster.id, 'pcbox');
                };
                slot.className = "flex flex-col justify-between p-1 bg-slate-900 border border-sky-600 rounded h-20 cursor-pointer hover:brightness-110 shadow text-white";
                
                const curHp = monster.currentHp !== undefined ? monster.currentHp : monster.maxHp;
                const maxHp = monster.maxHp || monster.hp || 20;

                slot.innerHTML = `
                    <div class="text-[8px] text-sky-400 font-bold flex justify-between">
                        <span>${monster.name}</span>
                        <span>Nv.${monster.level || 1}</span>
                    </div>
                    <div class="text-center my-auto text-xs">👾</div>
                    <div class="text-[7px] text-slate-300 text-center">HP: ${curHp}/${maxHp}</div>
                `;
            } else {
                slot.ondragover = handleDragOver;
                slot.ondrop = (e) => handleDrop(e, 'pcbox', realIndex);
                slot.className = "border border-dashed border-slate-700 rounded bg-slate-950/40 h-20 flex items-center justify-center text-slate-600 text-[9px]";
                slot.innerHTML = `<span>Livre</span>`;
            }
            container.appendChild(slot);
        }
    }
}

export function changePcBoxPage(direction) {
    gameState.pcBoxCurrentPage = (gameState.pcBoxCurrentPage || 0) + direction;
    const cp = getCurrentPlayer();
    const totalBoxes = cp.pcBox ? cp.pcBox.length : 0;
    const maxPages = Math.max(0, Math.ceil(totalBoxes / 12) - 1);
    if (gameState.pcBoxCurrentPage < 0) gameState.pcBoxCurrentPage = 0;
    if (gameState.pcBoxCurrentPage > maxPages) gameState.pcBoxCurrentPage = maxPages;
    renderBottomPanel();
}

// ==========================================
// MODAL DE FICHA TÉCNICA DO ANIMA (Corrigido com XP, Nível e Stats Reais)
// ==========================================
window.openPokemonDetailModal = function(identifier, sourceArea) {
    const cp = getCurrentPlayer();
    if (!cp) return;

    let monster = null;
    if (sourceArea === 'team' && Array.isArray(cp.activeTeam)) {
        monster = cp.activeTeam.find(m => m && (m.uniqueId === identifier || m.id === identifier));
    } else if (Array.isArray(cp.pcBox)) {
        monster = cp.pcBox.find(m => m && (m.uniqueId === identifier || m.id === identifier));
    }
    if (!monster && Array.isArray(cp.activeTeam)) {
        monster = cp.activeTeam.find(m => m && (m.uniqueId === identifier || m.id === identifier));
    }

    if (!monster) return;

    let modal = document.getElementById('monster-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'monster-detail-modal';
        modal.className = 'fixed inset-0 bg-black/90 z-[550] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(modal);
    }

    const currentExp = monster.exp || 0;
    const maxExp = (monster.level || 1) * 100;
    const expPercent = Math.min(100, Math.max(0, Math.round((currentExp / maxExp) * 100)));

    // Verifica no catálogo se tem evolução por nível para mostrar na ficha
    const catalogItem = MONSTER_CATALOG_REF.find(m => m.id === (monster.catalogId || monster.id) || m.name.toLowerCase() === monster.name.toLowerCase());
    const hasEvolution = catalogItem && catalogItem.evolvesTo;
    const evolveLevelInfo = hasEvolution ? `Evolui no Nv. ${catalogItem.evolveLevel || 16}` : 'Forma Final';

    const monsterImg = monster.isShiny && monster.shinyImage ? monster.shinyImage : monster.image;

    modal.innerHTML = `
        <div class="trainer-card max-w-lg w-full p-6 space-y-4 border-4 border-amber-500 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white relative">
            <div class="flex justify-between items-center border-b border-amber-900/60 pb-2">
                <h3 class="text-xs font-black text-amber-400 font-cinzel">FICHA TÉCNICA DO ANIMA</h3>
                <button onclick="document.getElementById('monster-detail-modal').remove()" class="text-amber-400 hover:text-white font-bold text-sm px-2.5 py-0.5 bg-black/60 rounded border border-amber-800 cursor-pointer">✕</button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-center bg-black/50 p-4 rounded-2xl border border-amber-900/50">
                <div class="flex justify-center bg-black/60 rounded-xl p-3 border border-amber-500/40 relative">
                    ${monster.isShiny ? '<span class="absolute top-1 left-1 text-[9px] bg-amber-400 text-black font-black px-1.5 rounded animate-pulse">✨ SHINY</span>' : ''}
                    <img src="${monsterImg || ''}" class="w-28 h-28 object-contain drop-shadow" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                </div>
                <div class="space-y-2">
                    <h4 class="text-base font-black text-white">${monster.name}</h4>
                    <p class="text-[10px] text-amber-400 font-bold uppercase">Tipo: ${Array.isArray(monster.types) ? monster.types.join('/') : (monster.type || 'Normal')}</p>
                    <div class="bg-black/80 p-2.5 rounded-xl border border-amber-900/60 space-y-1 text-xs">
                        <p class="text-slate-300">Nível: <strong class="text-amber-300 font-bold">Nv. ${monster.level || 1}</strong></p>
                        <p class="text-slate-300">Força (STR): <strong class="text-amber-300 font-bold">${monster.str || 4}</strong></p>
                        <p class="text-slate-300">Vida (HP): <strong class="text-emerald-400 font-bold">${monster.currentHp !== undefined ? monster.currentHp : monster.maxHp}/${monster.maxHp || 25}</strong></p>
                    </div>
                </div>
            </div>

            <div class="bg-black/60 p-3 rounded-2xl border border-amber-900/60 space-y-1.5">
                <div class="flex justify-between text-[10px] font-bold">
                    <span class="text-amber-300">Experiência (XP):</span>
                    <span class="text-slate-300">${currentExp} / ${maxExp} (${expPercent}%)</span>
                </div>
                <div class="w-full bg-slate-800 h-3 rounded-full overflow-hidden border border-amber-600/50 relative">
                    <div class="bg-gradient-to-r from-amber-500 to-yellow-400 h-full transition-all duration-500" style="width: ${expPercent}%"></div>
                </div>
                <p class="text-[9px] text-slate-400 text-right pt-0.5">${evolveLevelInfo}</p>
            </div>

            <button onclick="document.getElementById('monster-detail-modal').remove()" class="w-full bg-amber-600 hover:bg-amber-500 text-black font-black py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow">
                Fechar Ficha
            </button>
        </div>
    `;
    modal.classList.remove('hidden');
};

export function switchBottomView(viewName) {
    if (!gameState) return;
    gameState.currentBottomView = viewName;
    renderBottomPanel();
}

// Expor funções globais essenciais para drag-and-drop e eventos inline do HTML
window.handleDragStart = handleDragStart;
window.handleDragOver = handleDragOver;
window.handleDrop = handleDrop;
window.renderTeamCardSlots = renderTeamCardSlots;
window.renderBottomPanel = renderBottomPanel;
window.changePcBoxPage = changePcBoxPage;
window.switchBottomView = switchBottomView;
