// --- src/systems/battle.js ---
import { TYPE_ADVANTAGES } from '../config/constants.js';
import { gameState, getCurrentPlayer, ensureValidGameState } from '../core/state.js';
import { saveGameProgress } from '../core/storage.js';

// Estado atual do encontro selvagem
export let currentEncounterState = {
    wildPokemon: null,
    playerActiveMonster: null,
    battleTurn: 1
};

// Calcula o multiplicador de vantagem de tipo do TCG
export function calculateTypeAdvantageMultiplier(attackerType, defenderType) {
    if (!attackerType || !defenderType) return 1.0;
    
    const attackerTypes = String(attackerType).toLowerCase().split('/');
    const defenderTypes = String(defenderType).toLowerCase().split('/');
    
    let multiplier = 1.0;

    attackerTypes.forEach(atk => {
        if (TYPE_ADVANTAGES[atk]) {
            defenderTypes.forEach(def => {
                if (TYPE_ADVANTAGES[atk][def] !== undefined) {
                    multiplier *= TYPE_ADVANTAGES[atk][def];
                }
            });
        }
    });

    return multiplier;
}

// Retorna as classes de cor com base no Tier do Anima
export function getTierColorClass(tierOrColor) {
    const val = String(tierOrColor).toLowerCase();
    if (val.includes('1') || val.includes('rosa')) return 'bg-pink-950/80 border-pink-500';
    if (val.includes('2') || val.includes('verde')) return 'bg-emerald-950/80 border-emerald-500';
    if (val.includes('3') || val.includes('azul')) return 'bg-blue-950/80 border-blue-500';
    if (val.includes('4') || val.includes('vermelho')) return 'bg-red-950/80 border-red-500';
    if (val.includes('5') || val.includes('amarelo')) return 'bg-amber-950/80 border-amber-400';
    return 'bg-slate-950/80 border-slate-700';
}

// Abre o modal de encontro com um Pokémon selvagem
export function openEncounterModalWithPokemon(pokemon) {
    ensureValidGameState();
    const cp = getCurrentPlayer();
    if (!cp || !Array.isArray(cp.activeTeam) || cp.activeTeam.length === 0) {
        alert("Precisas de ter pelo menos um Pokémon na tua equipa ativa!");
        return;
    }

    // Seleciona o primeiro Pokémon saudável da equipe
    const activeMon = cp.activeTeam.find(m => (m.currentHp !== undefined ? m.currentHp : m.maxHp || 20) > 0) || cp.activeTeam[0];

    currentEncounterState = {
        wildPokemon: {
            ...pokemon,
            currentHp: pokemon.currentHp !== undefined ? pokemon.currentHp : (pokemon.maxHp || pokemon.hp || 20),
            maxHp: pokemon.maxHp || pokemon.hp || 20
        },
        playerActiveMonster: activeMon,
        battleTurn: 1
    };

    const modal = document.getElementById('encounter-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        updateEncounterUIInfo();
    }
}

// Atualiza as informações visuais na tela de combate selvagem
export function updateEncounterUIInfo() {
    const wild = currentEncounterState.wildPokemon;
    const playerMon = currentEncounterState.playerActiveMonster;
    if (!wild || !playerMon) return;

    // Renderização visual dos cards do jogador e do selvagem nos elementos do DOM
    const playerCardContainer = document.getElementById('player-card-visual');
    const encCardContainer = document.getElementById('enc-card-visual');

    if (playerCardContainer) {
        playerCardContainer.innerHTML = `
            <div class="flex justify-between items-center text-xs font-black">
                <span>${playerMon.name}</span>
                <span>Nv.${playerMon.level || 1}</span>
            </div>
            <div class="text-center my-auto">
                <img src="${playerMon.image}" class="w-24 h-24 mx-auto object-contain drop-shadow" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
            </div>
            <div class="text-[10px] font-bold bg-black/20 p-2 rounded">
                <p>HP: ${playerMon.currentHp !== undefined ? playerMon.currentHp : playerMon.maxHp} / ${playerMon.maxHp}</p>
                <p>STR: ${playerMon.str || 4}</p>
            </div>
        `;
    }

    if (encCardContainer) {
        encCardContainer.innerHTML = `
            <div class="flex justify-between items-center text-xs font-black text-amber-300">
                <span>${wild.name} (Selvagem)</span>
                <span>Nv.${wild.level || 1}</span>
            </div>
            <div class="text-center my-auto">
                <img src="${wild.image}" class="w-24 h-24 mx-auto object-contain drop-shadow" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
            </div>
            <div class="text-[10px] font-bold bg-black/40 p-2 rounded text-white">
                <p>HP: ${wild.currentHp} / ${wild.maxHp}</p>
                <p>STR: ${wild.str || 4}</p>
            </div>
        `;
    }
}

// Resolve o turno de ataque na batalha contra um Anima selvagem
export function resolveBattleAttempt() {
    const wild = currentEncounterState.wildPokemon;
    const playerMon = currentEncounterState.playerActiveMonster;
    if (!wild || !playerMon) return;

    // Simula rolagens de combate simples (1 a 6)
    const playerRoll = Math.floor(Math.random() * 6) + 1;
    const wildRoll = Math.floor(Math.random() * 6) + 1;

    const multiplier = calculateTypeAdvantageMultiplier(playerMon.type, wild.type);
    const playerPower = Math.round(((playerMon.str || 4) + playerRoll) * multiplier);
    const wildPower = (wild.str || 4) + wildRoll;

    if (playerPower >= wildPower) {
        const damage = Math.max(5, playerPower - wildPower + 6);
        wild.currentHp = Math.max(0, wild.currentHp - damage);
        alert(`⚔️ Ataque bem-sucedido! Causaste ${damage} de dano em ${wild.name}.`);
    } else {
        const damage = Math.max(4, wildPower - playerPower + 4);
        playerMon.currentHp = Math.max(0, (playerMon.currentHp || playerMon.maxHp) - damage);
        alert(`💥 O ${wild.name} contra-atacou e causou ${damage} de dano ao teu ${playerMon.name}!`);
    }

    updateEncounterUIInfo();

    // Se o Pokémon selvagem ficar com HP zero ou enfraquecido
    if (wild.currentHp <= 0) {
        alert(`✨ ${wild.name} ficou enfraquecido e pronto para captura!`);
        wild.weakened = true;
        saveGameProgress();
    }
}

// Foge do encontro selvagem
export function fleeEncounter() {
    const modal = document.getElementById('encounter-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    currentEncounterState.wildPokemon = null;
}