// --- src/core/storage.js ---
import { gameState, getCurrentPlayer, ensureValidGameState } from './state.js';
import { emitSocket, currentAuthenticatedAccount } from './socket.js';

const SAVE_KEY = 'pokemon_master_trainer_hex_save';

// Salva o progresso no localStorage e via socket com sincronização remota completa
export function saveGameProgress() {
    ensureValidGameState();
    try {
        const cp = getCurrentPlayer();
        const saveData = {
            gameState,
            savedAt: new Date().toISOString()
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        
        // Sincroniza com o backend online (salva na conta do servidor remoto para não perder ao limpar o browser)
        const savePayload = {
            gameState: gameState,
            accountEmail: typeof currentAuthenticatedAccount !== 'undefined' ? currentAuthenticatedAccount : null,
            trainerName: cp?.name || 'Treinador',
            profileData: cp ? {
                name: cp.name,
                avatarId: cp.avatarId,
                gold: cp.gold,
                badges: cp.badges,
                activeTeam: cp.activeTeam,
                pcBox: cp.pcBox,
                inventory: cp.inventory
            } : null
        };

        if (typeof emitSocket === 'function') {
            emitSocket('save_game_state', savePayload);
        } else if (typeof socket !== 'undefined' && socket && typeof socket.emit === 'function') {
            socket.emit('save_game_state', savePayload);
        }

        console.log("💾 Jogo salvo localmente e sincronizado com o servidor remoto!");
    } catch (e) {
        console.error("Erro ao salvar o jogo:", e);
    }
}

// Solicita os dados salvos na nuvem ao servidor backend
export function loadGameProgressFromServer() {
    if (typeof socket !== 'undefined' && socket && typeof socket.emit === 'function') {
        const account = typeof currentAuthenticatedAccount !== 'undefined' ? currentAuthenticatedAccount : null;
        socket.emit('request_saved_game', { accountEmail: account }, (response) => {
            if (response && response.gameState) {
                Object.assign(gameState, response.gameState);
                ensureValidGameState();
                localStorage.setItem(SAVE_KEY, JSON.stringify({ gameState, savedAt: new Date().toISOString() }));
                if (typeof renderBoardMap === 'function') renderBoardMap();
                if (typeof renderBottomPanel === 'function') renderBottomPanel();
                console.log("☁️ Progresso carregado com sucesso a partir da nuvem!");
            }
        });
    }
}

// Carrega o progresso salvo de forma segura sem perder propriedades (priorizando a nuvem se online)
export function loadGameProgress() {
    try {
        if (typeof socket !== 'undefined' && socket && socket.connected) {
            loadGameProgressFromServer();
        }

        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;

        const parsed = JSON.parse(raw);
        if (parsed && parsed.gameState) {
            // Garante uma mesclagem profunda preservando estruturas essenciais (players, inventory, pcBox)
            if (parsed.gameState.players && Array.isArray(parsed.gameState.players)) {
                gameState.players = parsed.gameState.players;
            }
            if (parsed.gameState.currentPlayerIndex !== undefined) {
                gameState.currentPlayerIndex = parsed.gameState.currentPlayerIndex;
            }
            if (parsed.gameState.globalVault) {
                gameState.globalVault = parsed.gameState.globalVault;
            }

            ensureValidGameState();
            console.log("📂 Jogo carregado com sucesso!");
            return true;
        }
    } catch (e) {
        console.error("Erro ao carregar o jogo:", e);
    }
    return false;
}

// Apaga o save do navegador
export function deleteGameSave() {
    localStorage.removeItem(SAVE_KEY);
}

// Exporta o progresso atual em formato .json para download
export function exportSaveToFile() {
    ensureValidGameState();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gameState, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `pokemon_hex_save_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// Importa um save de um arquivo .json externo
export function importSaveFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedState = JSON.parse(e.target.result);
            if (importedState && Array.isArray(importedState.players)) {
                Object.assign(gameState, importedState);
                ensureValidGameState();
                saveGameProgress();
                window.location.reload(); // Recarrega a interface com o novo estado
            } else {
                alert("Arquivo de save inválido.");
            }
        } catch (err) {
            console.error("Erro ao ler arquivo de save:", err);
            alert("Erro ao processar o arquivo JSON.");
        }
    };
    reader.readAsText(file);
}

// Salva um Anima no cofre global de herança
export function saveMonsterToVault(uniqueId) {
    const cp = getCurrentPlayer();
    if (!cp) return;

    let targetMonster = null;
    let foundIndex = -1;

    // Procura na equipe ativa
    if (cp.activeTeam && Array.isArray(cp.activeTeam)) {
        foundIndex = cp.activeTeam.findIndex(m => m && m.uniqueId === uniqueId);
        if (foundIndex > -1) {
            targetMonster = cp.activeTeam.splice(foundIndex, 1)[0];
        }
    }
    
    if (!targetMonster && cp.pcBox && Array.isArray(cp.pcBox)) {
        // Procura na PC Box
        foundIndex = cp.pcBox.findIndex(m => m && m.uniqueId === uniqueId);
        if (foundIndex > -1) {
            targetMonster = cp.pcBox.splice(foundIndex, 1)[0];
        }
    }

    if (!targetMonster) return;

    // Inicializa o cofre global se não existir
    if (!gameState.globalVault) gameState.globalVault = [];
    gameState.globalVault.push(targetMonster);
    
    saveGameProgress();
    console.log(`📦 ${targetMonster.name} enviado para o cofre global.`);
}

// Exposições globais para o navegador
window.saveGameProgress = saveGameProgress;
window.loadGameProgress = loadGameProgress;
window.loadGameProgressFromServer = loadGameProgressFromServer;
window.deleteGameSave = deleteGameSave;
window.exportSaveToFile = exportSaveToFile;
window.importSaveFromFile = importSaveFromFile;
window.saveMonsterToVault = saveMonsterToVault;
