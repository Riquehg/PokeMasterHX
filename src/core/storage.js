// --- src/core/storage.js ---
import { gameState, getCurrentPlayer, ensureValidGameState, currentAuthenticatedAccount } from './state.js';
import { emitSocket, socket } from './socket.js';

// Salva o progresso exclusivamente no servidor remoto via socket
export function saveGameProgress() {
    ensureValidGameState();
    try {
        const cp = getCurrentPlayer();
        const activeEmail = typeof currentAuthenticatedAccount !== 'undefined' && currentAuthenticatedAccount ? currentAuthenticatedAccount : (gameState.accountEmail || null);

        const savePayload = {
            gameState: gameState,
            accountEmail: activeEmail,
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

        console.log("💾 Progresso enviado e sincronizado com o servidor remoto!");
    } catch (e) {
        console.error("Erro ao enviar progresso para o servidor:", e);
    }
}

// Solicita os dados salvos na nuvem ao servidor backend de forma segura
export function loadGameProgressFromServer() {
    if (typeof socket !== 'undefined' && socket && typeof socket.emit === 'function') {
        const activeEmail = typeof currentAuthenticatedAccount !== 'undefined' && currentAuthenticatedAccount ? currentAuthenticatedAccount : (gameState.accountEmail || null);
        if (!activeEmail) return;

        socket.emit('request_saved_game', { accountEmail: activeEmail }, (response) => {
            if (response && response.success && response.gameState) {
                Object.assign(gameState, response.gameState);
                ensureValidGameState();
                if (typeof renderBoardMap === 'function') renderBoardMap();
                if (typeof renderBottomPanel === 'function') renderBottomPanel();
                if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
                console.log("☁️ Progresso carregado com sucesso a partir do servidor!");
            }
        });
    }
}

// Carrega o progresso pedindo diretamente ao servidor (Sem localStorage)
export function loadGameProgress() {
    try {
        if (typeof socket !== 'undefined' && socket && socket.connected) {
            loadGameProgressFromServer();
            return true;
        }
    } catch (e) {
        console.error("Erro ao solicitar carregamento do servidor:", e);
    }
    return false;
}

// Limpeza de sessão local (já que não há saves locais)
export function deleteGameSave() {
    console.log("🗑️ Sessão limpa (dados geridos pelo servidor).");
}

// Exporta o progresso atual em formato .json para download (mantido por utilidade do jogador)
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

// Importa um save de um arquivo .json externo e envia para o servidor
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
                saveGameProgress(); // Envia para o servidor
                window.location.reload();
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

// Salva um Anima no cofre global de herança e sincroniza com o servidor
export function saveMonsterToVault(uniqueId) {
    const cp = getCurrentPlayer();
    if (!cp) return;

    let targetMonster = null;
    let foundIndex = -1;

    if (cp.activeTeam && Array.isArray(cp.activeTeam)) {
        foundIndex = cp.activeTeam.findIndex(m => m && m.uniqueId === uniqueId);
        if (foundIndex > -1) {
            targetMonster = cp.activeTeam.splice(foundIndex, 1)[0];
        }
    }
    
    if (!targetMonster && cp.pcBox && Array.isArray(cp.pcBox)) {
        foundIndex = cp.pcBox.findIndex(m => m && m.uniqueId === uniqueId);
        if (foundIndex > -1) {
            targetMonster = cp.pcBox.splice(foundIndex, 1)[0];
        }
    }

    if (!targetMonster) return;

    if (!gameState.globalVault) gameState.globalVault = [];
    gameState.globalVault.push(targetMonster);
    
    saveGameProgress();
    console.log(`📦 ${targetMonster.name} enviado para o cofre global na nuvem.`);
}

// Ouvinte para resposta de salvamento na nuvem via socket
if (typeof socket !== 'undefined' && socket) {
    socket.off('saved_game_response');
    socket.on('saved_game_response', (response) => {
        if (response && response.success && response.gameState) {
            Object.assign(gameState, response.gameState);
            ensureValidGameState();
            if (typeof renderBoardMap === 'function') renderBoardMap();
            if (typeof renderBottomPanel === 'function') renderBottomPanel();
            if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
        }
    });
}

// Exposições globais para o navegador
window.saveGameProgress = saveGameProgress;
window.loadGameProgress = loadGameProgress;
window.loadGameProgressFromServer = loadGameProgressFromServer;
window.deleteGameSave = deleteGameSave;
window.exportSaveToFile = exportSaveToFile;
window.importSaveFromFile = importSaveFromFile;
window.saveMonsterToVault = saveMonsterToVault;
