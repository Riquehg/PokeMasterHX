// --- src/systems/pokedex.js ---
// Pokédex Regional de Kanto (Fiel aos Jogos Clássicos & Calculadora de Tipos)

import { getCurrentPlayer } from '../core/state.js';

const MONSTER_CATALOG_REF = typeof MONSTER_CATALOG !== 'undefined' ? MONSTER_CATALOG : [];

export function getTypeEffectivenessInfo(typeString) {
    if (!typeString) return { strong: 'Nenhum', weak: 'Nenhum' };
    
    const primaryType = typeString.split('/')[0].trim().toLowerCase();
    
    const typeChart = {
        'fogo': { strong: 'Grama, Gelo, Inseto, Aço', weak: 'Água, Terra, Pedra' },
        'água': { strong: 'Fogo, Terra, Pedra', weak: 'Grama, Elétrico' },
        'grama': { strong: 'Água, Terra, Pedra', weak: 'Fogo, Gelo, Veneno, Voador, Inseto' },
        'elétrico': { strong: 'Água, Voador', weak: 'Terra' },
        'psíquico': { strong: 'Lutador, Veneno', weak: 'Inseto, Fantasma, Sombrio' },
        'gelo': { strong: 'Grama, Terra, Voador, Dragão', weak: 'Fogo, Lutador, Pedra, Aço' },
        'dragão': { strong: 'Dragão', weak: 'Gelo, Dragão, Fada' },
        'normal': { strong: 'Nenhum', weak: 'Lutador' },
        'lutador': { strong: 'Normal, Gelo, Pedra, Sombrio, Aço', weak: 'Voador, Psíquico, Fada' },
        'veneno': { strong: 'Grama, Fada', weak: 'Terra, Psíquico' },
        'terra': { strong: 'Fogo, Elétrico, Veneno, Pedra, Aço', weak: 'Água, Grama, Gelo' },
        'pedra': { strong: 'Fogo, Gelo, Voador, Inseto', weak: 'Água, Grama, Lutador, Terra, Aço' },
        'inseto': { strong: 'Grama, Psíquico, Sombrio', weak: 'Fogo, Voador, Pedra' },
        'fantasma': { strong: 'Psíquico, Fantasma', weak: 'Fantasma, Sombrio' },
        'aço': { strong: 'Gelo, Pedra, Fada', weak: 'Fogo, Lutador, Terra' }
    };

    return typeChart[primaryType] || { strong: 'Neutro', weak: 'Neutro' };
}

export function openPokedexModal() {
    const cp = getCurrentPlayer();
    
    let capturedIds = new Set();
    if (cp && cp.activeTeam) cp.activeTeam.forEach(m => {
        if (m.id) capturedIds.add(m.id.toLowerCase());
        if (m.name) capturedIds.add(m.name.toLowerCase());
    });
    if (cp && cp.pcBox) cp.pcBox.forEach(m => {
        if (m.id) capturedIds.add(m.id.toLowerCase());
        if (m.name) capturedIds.add(m.name.toLowerCase());
    });

    let dexModal = document.getElementById('pokedex-modal');
    if (!dexModal) {
        dexModal = document.createElement('div');
        dexModal.id = 'pokedex-modal';
        dexModal.className = 'fixed inset-0 bg-black/90 z-[420] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(dexModal);
    }

    let gridHtml = '';
    let totalCapturedCount = 0;
    const totalCatalogSize = MONSTER_CATALOG_REF.length;

    if (MONSTER_CATALOG_REF.length > 0) {
        MONSTER_CATALOG_REF.forEach((mon, index) => {
            const isCaptured = capturedIds.has(mon.id.toLowerCase()) || capturedIds.has(mon.name.toLowerCase());
            if (isCaptured) totalCapturedCount++;
            
            const dexNum = String(index + 1).padStart(3, '0');
            
            if (isCaptured) {
                gridHtml += `
                    <div onclick="openPokedexDetailCard('${mon.id}')" class="bg-gradient-to-b from-red-950/90 to-black border-2 border-red-500 rounded-2xl p-2.5 flex flex-col items-center justify-between cursor-pointer hover:scale-105 transition-all shadow-lg text-white group">
                        <span class="text-[9px] font-bold text-red-400 font-mono">Nº ${dexNum}</span>
                        <img src="${mon.image}" class="w-12 h-12 object-contain drop-shadow group-hover:scale-110 transition-transform" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                        <span class="text-[10px] font-black truncate w-full text-center text-amber-300">${mon.name}</span>
                    </div>
                `;
            } else {
                gridHtml += `
                    <div class="bg-black/65 border-2 border-slate-800 rounded-2xl p-2.5 flex flex-col items-center justify-between opacity-50 text-slate-600">
                        <span class="text-[9px] font-bold font-mono">Nº ${dexNum}</span>
                        <div class="w-12 h-12 flex items-center justify-center text-xl text-slate-500 font-bold">❓</div>
                        <span class="text-[10px] font-bold truncate w-full text-center text-slate-500">--------</span>
                    </div>
                `;
            }
        });
    } else {
        gridHtml = `<div class="col-span-full text-center text-xs text-slate-400 py-8">Catálogo de Pokémon indisponível no momento.</div>`;
    }

    dexModal.innerHTML = `
        <div class="trainer-card max-w-3xl w-full p-6 space-y-4 border-4 border-red-600 rounded-3xl bg-gradient-to-b from-[#1c0f0f] to-[#070404] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-red-900/60 pb-3">
                <div class="flex items-center gap-2">
                    <div class="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-inner animate-pulse"></div>
                    <span class="text-xs font-black text-red-400 font-cinzel tracking-wider">POKÉDEX REGIONAL (KANTO)</span>
                </div>
                <div class="text-[10px] bg-black/60 px-3 py-1 rounded-full border border-red-900 font-mono text-amber-300">
                    Registados: <span class="text-white font-bold">${totalCapturedCount}</span> / ${totalCatalogSize}
                </div>
                <button onclick="document.getElementById('pokedex-modal').remove()" class="text-red-400 hover:text-white font-bold text-sm px-2.5 py-0.5 bg-black/60 rounded border border-red-800 cursor-pointer">✕ Fechar</button>
            </div>
            <div class="grid grid-cols-4 sm:grid-cols-6 gap-3 max-h-[400px] overflow-y-auto p-1 pr-2">
                ${gridHtml}
            </div>
        </div>
    `;
    dexModal.classList.remove('hidden');
}

export function openPokedexDetailCard(monsterId) {
    if (MONSTER_CATALOG_REF.length === 0) return;
    const baseMon = MONSTER_CATALOG_REF.find(m => m.id === monsterId);
    if (!baseMon) return;

    const cp = getCurrentPlayer();
    let ownedMon = null;
    if (cp && cp.activeTeam) ownedMon = cp.activeTeam.find(m => (m.id === monsterId || (m.name && m.name.toLowerCase() === baseMon.name.toLowerCase())));
    if (!ownedMon && cp && cp.pcBox) ownedMon = cp.pcBox.find(m => (m.id === monsterId || (m.name && m.name.toLowerCase() === baseMon.name.toLowerCase())));

    const isShiny = ownedMon ? ownedMon.isShiny : false;
    const currentLevel = ownedMon ? (ownedMon.level || baseMon.level || 1) : (baseMon.level || 1);
    const currentHp = ownedMon ? (ownedMon.maxHp || baseMon.hp || 20) : (baseMon.hp || 20);
    const currentStr = ownedMon ? (ownedMon.str || baseMon.str || 4) : (baseMon.str || 4);
    const monImage = (isShiny && baseMon.shinyImage) ? baseMon.shinyImage : baseMon.image;
    
    const typeInfo = getTypeEffectivenessInfo(baseMon.type);

    let detailModal = document.getElementById('pokedex-detail-modal');
    if (!detailModal) {
        detailModal = document.createElement('div');
        detailModal.id = 'pokedex-detail-modal';
        detailModal.className = 'fixed inset-0 bg-black/90 z-[450] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(detailModal);
    }

    const dexIndex = MONSTER_CATALOG_REF.findIndex(m => m.id === monsterId);
    const dexNumStr = String(baseMon.dexNumber || (dexIndex !== -1 ? dexIndex + 1 : 1)).padStart(3, '0');

    detailModal.innerHTML = `
        <div class="trainer-card max-w-md w-full p-6 space-y-4 border-4 ${isShiny ? 'border-yellow-400 bg-gradient-to-b from-yellow-950/90 to-[#0a0705]' : 'border-red-600 bg-gradient-to-b from-[#1c0f0f] to-[#070404]'} shadow-2xl text-white relative">
            <div class="flex justify-between items-center border-b border-red-900/60 pb-2">
                <span class="text-xs font-black text-red-400 font-cinzel">📖 Nº ${dexNumStr} - ${baseMon.name}${isShiny ? ' ✨ [SHINY]' : ''}</span>
                <button onclick="document.getElementById('pokedex-detail-modal').remove()" class="text-red-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-red-800 cursor-pointer">✕</button>
            </div>

            <div class="flex flex-col items-center space-y-3">
                <div class="w-32 h-32 bg-black/70 border-2 ${isShiny ? 'border-yellow-400 shadow-[0_0_20px_rgba(255,215,0,0.6)]' : 'border-red-500'} rounded-2xl flex items-center justify-center p-2 relative shadow-inner">
                    <img src="${monImage}" class="w-28 h-28 object-contain drop-shadow-2xl" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    ${isShiny ? '<span class="absolute top-1 right-1 text-sm bg-black/50 px-1 rounded">✨</span>' : ''}
                </div>

                <div class="text-center">
                    <h3 class="text-base font-black text-amber-300">${baseMon.name}</h3>
                    <p class="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Tipo: <span class="text-white">${baseMon.type}</span> | Estágio: <span class="text-white">${baseMon.stage || 'N/A'}</span></p>
                </div>

                <div class="grid grid-cols-2 gap-2 w-full bg-black/50 p-3 rounded-xl border border-red-900/50 text-xs shadow-inner">
                    <div>❤ HP Base/Máx: <span class="font-bold text-emerald-400">${currentHp}</span></div>
                    <div>⚔ Força (STR): <span class="font-bold text-amber-400">${currentStr}</span></div>
                    <div>⭐ Raridade Tier: <span class="font-bold text-purple-400">${baseMon.rarity || 'Normal'}</span></div>
                    <div>📈 Nível Registo: <span class="font-bold text-blue-400">Nv.${currentLevel}</span></div>
                </div>

                <div class="w-full bg-black/60 p-3 rounded-xl border border-red-900/50 space-y-1.5 text-[10px]">
                    <div class="text-amber-400 font-bold border-b border-red-900/40 pb-1 flex items-center gap-1">
                        <i class="fa-solid fa-bolt"></i> Vantagens & Fraquezas de Tipo:
                    </div>
                    <div>🟢 <span class="text-emerald-400 font-bold">Super Efetivo contra:</span> ${typeInfo.strong}</div>
                    <div>🔴 <span class="text-red-400 font-bold">Fraco contra:</span> ${typeInfo.weak}</div>
                </div>

                <div class="w-full text-center bg-red-950/40 p-2.5 rounded-xl border border-red-800/50 text-[10px] text-amber-200 shadow">
                    ${baseMon.evolvesTo ? `🔄 Evolui para: <span class="font-bold uppercase text-white">${baseMon.evolvesTo}</span> (A partir do Nível ${baseMon.evolutionLevel || 16})` : '✨ Forma final de evolução detetada!'}
                </div>
            </div>
        </div>
    `;
    detailModal.classList.remove('hidden');
}

// Expor funções globalmente para acesso nos eventos HTML do motor
window.openPokedexModal = openPokedexModal;
window.openPokedexDetailCard = openPokedexDetailCard;
