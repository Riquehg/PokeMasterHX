// --- src/core/storage.js ---
import { gameState, getCurrentPlayer, getMyPlayer, ensureValidGameState, currentAuthenticatedAccount } from './state.js';
import { emitSocket, socket } from './socket.js';

// Salva o progresso exclusivamente no servidor remoto via socket (Isolando para o jogador local)
export function saveGameProgress() {
    ensureValidGameState();
    try {
        const cp = getMyPlayer(); // Usa getMyPlayer para garantir que salvamos os dados do próprio jogador local e não do adversário da vez
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
    const activeEmail = typeof currentAuthenticatedAccount !== 'undefined' && currentAuthenticatedAccount ? currentAuthenticatedAccount : (gameState.accountEmail || null);
    
    const activeSocket = socket || window.socket;
    if (activeSocket && typeof activeSocket.emit === 'function') {
        if (!activeEmail) {
            console.warn("⚠️ Nenhum e-mail autenticado encontrado para carregar o save do servidor.");
            return;
        }

        activeSocket.emit('request_saved_game', { accountEmail: activeEmail });
        console.log(`☁️ A solicitar progresso da nuvem para: ${activeEmail}`);
    }
}

// Carrega o progresso pedindo diretamente ao servidor (Sem localStorage)
export function loadGameProgress() {
    try {
        loadGameProgressFromServer();
        return true;
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
    const cp = getMyPlayer(); // Usa o jogador local
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

// Função para registrar os ouvintes de socket relacionados ao storage de forma segura
export function setupStorageSocketListeners() {
    const activeSocket = socket || window.socket;
    if (activeSocket && typeof activeSocket.off === 'function' && typeof activeSocket.on === 'function') {
        activeSocket.off('saved_game_response');
        activeSocket.on('saved_game_response', (response) => {
            if (response && response.success) {
                if (response.gameState && Object.keys(response.gameState).length > 0) {
                    Object.assign(gameState, response.gameState);
                }
                ensureValidGameState();
                
                const cp = getMyPlayer();
                if (cp && typeof updateTrainerVisualsAndHud === 'function') {
                    updateTrainerVisualsAndHud(cp.name, cp.avatarId);
                }

                if (typeof renderBoardMap === 'function') renderBoardMap();
                if (typeof renderBottomPanel === 'function') renderBottomPanel();
                if (typeof renderTeamCardSlots === 'function') renderTeamCardSlots();
                console.log("☁️ Dados da nuvem aplicados com sucesso à interface!");
            }
        });
    }
}

// Tenta configurar os ouvintes caso o socket já exista
setupStorageSocketListeners();

// Exposições globais para o navegador
window.saveGameProgress = saveGameProgress;
window.loadGameProgress = loadGameProgress;
window.loadGameProgressFromServer = loadGameProgressFromServer;
window.deleteGameSave = deleteGameSave;
window.exportSaveToFile = exportSaveToFile;
window.importSaveFromFile = importSaveFromFile;
window.saveMonsterToVault = saveMonsterToVault;
window.setupStorageSocketListeners = setupStorageSocketListeners;
