// --- src/core/storage.js ---
import { gameState, getCurrentPlayer, ensureValidGameState } from './state.js';

const SAVE_KEY = 'pokemon_master_trainer_hex_save';

// Salva o progresso no localStorage e via socket se houver conexão
export function saveGameProgress() {
    ensureValidGameState();
    try {
        const saveData = {
            gameState,
            savedAt: new Date().toISOString()
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        
        // Sincroniza com o backend online se o socket estiver disponível
        if (typeof socket !== 'undefined' && socket && typeof socket.emit === 'function') {
            socket.emit('update_game_state', {
                type: 'save_game',
                gameState
            });
        }
        console.log("💾 Jogo salvo com sucesso!");
    } catch (e) {
        console.error("Erro ao salvar o jogo:", e);
    }
}

// Carrega o progresso salvo
export function loadGameProgress() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;

        const parsed = JSON.parse(raw);
        if (parsed && parsed.gameState) {
            Object.assign(gameState, parsed.gameState);
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
    foundIndex = cp.activeTeam.findIndex(m => m && m.uniqueId === uniqueId);
    if (foundIndex > -1) {
        targetMonster = cp.activeTeam.splice(foundIndex, 1)[0];
    } else {
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