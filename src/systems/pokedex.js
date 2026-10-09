// --- src/systems/pokedex.js ---
// Pokédex Regional de Kanto (Estilo Moderno / Fiel às Referências)

import { gameState, getCurrentPlayer } from '../core/state.js';
import { MONSTER_CATALOG } from '../config/cards-data.js';

// Cores de fundo baseadas no tipo principal para dar o asseio visual da referência
function getTypeCardColor(typeString) {
    if (!typeString) return 'from-slate-800 to-slate-950 border-slate-700';
    const primary = typeString.split('/')[0].trim().toLowerCase();
    
    switch (primary) {
        case 'grama': return 'from-emerald-800/90 via-emerald-950 to-black border-emerald-500';
        case 'fogo': return 'from-red-800/90 via-red-950 to-black border-red-500';
        case 'água': return 'from-blue-800/90 via-blue-950 to-black border-blue-500';
        case 'elétrico': return 'from-amber-700/90 via-yellow-950 to-black border-yellow-400';
        case 'psíquico': return 'from-pink-800/90 via-purple-950 to-black border-pink-500';
        case 'gelo': return 'from-cyan-800/90 via-sky-950 to-black border-cyan-400';
        case 'veneno': return 'from-purple-800/90 via-purple-950 to-black border-purple-500';
        case 'pedra': case 'terra': return 'from-stone-700/90 via-stone-900 to-black border-stone-500';
        case 'inseto': return 'from-lime-800/90 via-lime-950 to-black border-lime-500';
        default: return 'from-slate-800 to-black border-slate-600';
    }
}

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
    const catalogList = MONSTER_CATALOG || [];
    const totalCatalogSize = catalogList.length;

    if (totalCatalogSize > 0) {
        catalogList.forEach((mon, index) => {
            const isCaptured = capturedIds.has(mon.id.toLowerCase()) || capturedIds.has(mon.name.toLowerCase());
            if (isCaptured) totalCapturedCount++;
            
            const dexNum = String(index + 1).padStart(3, '0');
            const cardBgGradient = isCaptured ? getTypeCardColor(mon.type) : 'from-slate-900/80 via-black to-slate-950 border-slate-800';
            
            if (isCaptured) {
                gridHtml += `
                    <div onclick="openPokedexDetailCard('${mon.id}')" class="bg-gradient-to-b ${cardBgGradient} border-2 rounded-2xl p-3 flex flex-col items-center justify-between cursor-pointer hover:scale-105 transition-all shadow-xl text-white group h-32 relative overflow-hidden">
                        <div class="flex justify-between w-full items-center">
                            <span class="text-[9px] font-black text-white/70 font-mono">#${dexNum}</span>
                            ${mon.isShiny ? '<span class="text-[9px] bg-amber-400 text-black px-1 rounded font-bold animate-pulse">✨</span>' : ''}
                        </div>
                        <img src="${mon.image}" class="w-14 h-14 object-contain drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] group-hover:scale-110 transition-transform my-auto" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                        <span class="text-[11px] font-black uppercase tracking-wider truncate w-full text-center text-amber-300 drop-shadow">${mon.name}</span>
                    </div>
                `;
            } else {
                gridHtml += `
                    <div class="bg-black/80 border-2 border-slate-800/80 rounded-2xl p-3 flex flex-col items-center justify-between opacity-50 h-32">
                        <span class="text-[9px] font-bold font-mono text-slate-500">#${dexNum}</span>
                        <div class="w-12 h-12 flex items-center justify-center text-lg text-slate-600 font-bold bg-slate-900/60 rounded-xl border border-slate-800">❓</div>
                        <span class="text-[10px] font-bold truncate w-full text-center text-slate-600">--------</span>
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
                    <div class="w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-inner animate-pulse"></div>
                    <span class="text-xs font-black text-red-400 font-cinzel tracking-wider">POKÉDEX REGIONAL (KANTO)</span>
                </div>
                <div class="text-[10px] bg-black/60 px-3 py-1 rounded-full border border-red-900 font-mono text-amber-300">
                    Registados: <span class="text-white font-bold">${totalCapturedCount}</span> / ${totalCatalogSize}
                </div>
                <button onclick="document.getElementById('pokedex-modal').remove()" class="text-red-400 hover:text-white font-bold text-sm px-2.5 py-0.5 bg-black/60 rounded border border-red-800 cursor-pointer">✕ Fechar</button>
            </div>
            <div class="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[440px] overflow-y-auto p-1 pr-2">
                ${gridHtml}
            </div>
        </div>
    `;
    dexModal.classList.remove('hidden');
}

export function openPokedexDetailCard(monsterId) {
    if (!MONSTER_CATALOG || MONSTER_CATALOG.length === 0) return;
    const baseMon = MONSTER_CATALOG.find(m => m.id === monsterId);
    if (!baseMon) return;

    const cp = getCurrentPlayer();
    let ownedMon = null;
    if (cp && cp.activeTeam) ownedMon = cp.activeTeam.find(m => (m.id === monsterId || (m.name && m.name.toLowerCase() === baseMon.name.toLowerCase())));
    if (!ownedMon && cp && cp.pcBox) ownedMon = cp.pcBox.find(m => (m.id === monsterId || (m.name && m.name.toLowerCase() === baseMon.name.toLowerCase())));

    const isShiny = ownedMon ? ownedMon.isShiny : false;
    const currentLevel = ownedMon ? (ownedMon.level || baseMon.level || 1) : (baseMon.level || 1);
    const currentHp = ownedMon ? (ownedMon.maxHp || baseMon.hp || 25) : (baseMon.hp || 25);
    const currentStr = ownedMon ? (ownedMon.str || baseMon.str || 5) : (baseMon.str || 5);
    const monImage = (isShiny && baseMon.shinyImage) ? baseMon.shinyImage : baseMon.image;
    
    const typeInfo = getTypeEffectivenessInfo(baseMon.type);
    const typesArray = baseMon.type ? baseMon.type.split('/').map(t => t.trim()) : ['Normal'];

    let detailModal = document.getElementById('pokedex-detail-modal');
    if (!detailModal) {
        detailModal = document.createElement('div');
        detailModal.id = 'pokedex-detail-modal';
        detailModal.className = 'fixed inset-0 bg-black/90 z-[450] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(detailModal);
    }

    const dexIndex = MONSTER_CATALOG.findIndex(m => m.id === monsterId);
    const dexNumStr = String(baseMon.dexNumber || (dexIndex !== -1 ? dexIndex + 1 : 1)).padStart(3, '0');

    // Cálculo das barras de estatísticas estilo a referência visual
    const maxStat = 150;
    const hpPercent = Math.min(100, Math.round((currentHp / maxStat) * 100));
    const strPercent = Math.min(100, Math.round((currentStr * 10 / maxStat) * 100));

    let typesBadgesHtml = '';
    typesArray.forEach(t => {
        typesBadgesHtml += `<span class="bg-black/40 border border-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-amber-200">${t}</span>`;
    });

    detailModal.innerHTML = `
        <div class="trainer-card max-w-sm w-full p-0 overflow-hidden border-4 border-red-500 rounded-3xl bg-gradient-to-b from-[#16110d] to-black shadow-2xl text-white relative">
            <!-- Cabeçalho colorido estilo app de pokedex -->
            <div class="bg-gradient-to-r from-red-600 to-amber-600 p-5 flex flex-col items-center relative shadow-lg">
                <button onclick="document.getElementById('pokedex-detail-modal').remove()" class="absolute top-3 right-3 text-white font-bold bg-black/40 hover:bg-black/70 px-2.5 py-1 rounded-full text-xs cursor-pointer">✕</button>
                <span class="absolute top-3 left-3 text-xs font-black font-mono text-amber-200">#${dexNumStr}</span>
                
                <div class="w-32 h-32 bg-black/30 rounded-full border-4 border-white/30 flex items-center justify-center p-2 shadow-inner my-2 relative">
                    <img src="${monImage}" class="w-28 h-28 object-contain drop-shadow-[0_8px_10px_rgba(0,0,0,0.9)]" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                    ${isShiny ? '<span class="absolute bottom-0 right-0 text-xs bg-amber-400 text-black px-1.5 rounded-full font-bold">✨</span>' : ''}
                </div>
                
                <h2 class="text-xl font-black uppercase tracking-widest text-white drop-shadow">${baseMon.name}</h2>
                <div class="flex gap-2 mt-2">
                    ${typesBadgesHtml}
                </div>
            </div>

            <!-- Corpo dos Detalhes / Base Stats -->
            <div class="p-5 space-y-4">
                <div class="grid grid-cols-2 gap-2 bg-black/60 p-3 rounded-2xl border border-red-900/50 text-center text-xs">
                    <div>
                        <span class="text-[9px] text-slate-400 block font-bold">NÍVEL REGISTO</span>
                        <span class="font-black text-blue-400 text-sm">Nv. ${currentLevel}</span>
                    </div>
                    <div>
                        <span class="text-[9px] text-slate-400 block font-bold">RARIDADE TIER</span>
                        <span class="font-black text-purple-400 text-sm">Tier ${baseMon.tier || 1}</span>
                    </div>
                </div>

                <div class="space-y-2 bg-black/40 p-3.5 rounded-2xl border border-red-900/40">
                    <h4 class="text-[10px] font-black text-amber-400 uppercase tracking-wider text-center border-b border-red-900/50 pb-1">Base Stats</h4>
                    
                    <div class="space-y-1.5 text-[10px]">
                        <div>
                            <div class="flex justify-between font-bold mb-0.5"><span>HP</span><span>${currentHp} / 150</span></div>
                            <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
                                <div class="bg-red-500 h-full rounded-full" style="width: ${hpPercent}%"></div>
                            </div>
                        </div>
                        <div>
                            <div class="flex justify-between font-bold mb-0.5"><span>ATK (STR)</span><span>${currentStr * 10} / 150</span></div>
                            <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
                                <div class="bg-amber-400 h-full rounded-full" style="width: ${strPercent}%"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="bg-red-950/40 border border-red-800/40 p-3 rounded-2xl text-[10px] space-y-1 text-center">
                    <div class="text-emerald-400 font-bold">🟢 Vantagem: ${typeInfo.strong}</div>
                    <div class="text-red-400 font-bold">🔴 Fraqueza: ${typeInfo.weak}</div>
                </div>

                ${baseMon.evolvesTo ? `
                    <div class="text-center text-[10px] text-amber-300 font-bold bg-black/60 p-2.5 rounded-xl border border-amber-500/30">
                        🔄 Evolui para <span class="uppercase text-white">${baseMon.evolvesTo}</span> no Nv.${baseMon.evolutionLevel || 16}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    detailModal.classList.remove('hidden');
}

// Expor funções globalmente para acesso nos eventos HTML do motor
window.openPokedexModal = openPokedexModal;
window.openPokedexDetailCard = openPokedexDetailCard;
