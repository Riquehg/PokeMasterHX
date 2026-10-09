// --- src/systems/admin.js ---
// Painel Administrativo, Controlo de Contas e Configuração Inicial

import { gameState, ensureValidGameState, getCurrentPlayer } from '../core/state.js';
import { saveGameProgress } from '../core/storage.js';
import { emitSocket } from '../core/socket.js';

let adminUsersListenerRegistered = false;
export const dailyFeaturedPokemonConfig = {
    pokemonId: 'charizard',
    pokemonName: 'Charizard',
    bonusItem: 'ball_ultra',
    bonusItemName: 'ULTRA BALL'
};

export function handleAdminUsersList(users) {
    const modal = document.getElementById('admin-panel-modal');
    if (modal) {
        renderAdminDashboard(modal, users);
    }
}

export function openAdminPanelModal() {
    const password = window.prompt('🔐 Insira a senha de Administrador:', '');
    if (password === null) return;

    if (password !== 'admin123' && password !== 'pokemonadmin') {
        window.alert('❌ Senha incorreta!');
        return;
    }

    let adminModal = document.getElementById('admin-panel-modal');
    if (!adminModal) {
        adminModal = document.createElement('div');
        adminModal.id = 'admin-panel-modal';
        adminModal.className = 'fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 backdrop-blur-md';
        document.body.appendChild(adminModal);
    }

    adminModal.innerHTML = `
        <div class="trainer-card max-w-4xl w-full p-6 border-4 border-red-600 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white text-center space-y-4">
            <p class="text-sm text-red-300 font-black">Carregando painel administrativo...</p>
        </div>
    `;

    const sock = typeof window.socket !== 'undefined' ? window.socket : null;
    if (sock && typeof sock.on === 'function' && !adminUsersListenerRegistered) {
        sock.on('admin_users_list', handleAdminUsersList);
        adminUsersListenerRegistered = true;
    }

    emitSocket('admin_get_users');
    adminModal.classList.remove('hidden');
}

export function renderAdminDashboard(modalElement, users) {
    const safeUsers = Array.isArray(users) ? users : [];

    const rowsHtml = safeUsers.length === 0 ? `
        <tr><td colspan="5" class="text-center py-4 text-slate-400">Nenhuma conta encontrada.</td></tr>
    ` : safeUsers.map(user => {
        const email = user?.email || '';
        const trainerName = user?.trainerName || user?.trainer_name || user?.name || 'N/D';
        const lastLogin = user?.lastLogin ? new Date(user.lastLogin).toLocaleString('pt-BR') : 'Nunca';
        const gold = Number(user?.gold || user?.profile_data?.gold || 0);

        return `
            <tr class="border-b border-red-900/40 text-[10px] hover:bg-red-950/20">
                <td class="p-2 font-bold text-amber-300">${email}</td>
                <td class="p-2 text-slate-300">${trainerName}</td>
                <td class="p-2 text-slate-400">${lastLogin}</td>
                <td class="p-2 text-yellow-400 font-bold">${gold} 🪙</td>
                <td class="p-2">
                    <div class="flex gap-1 justify-end flex-wrap">
                        <button type="button" data-admin-action="gold" data-admin-email="${email}" class="bg-amber-600 hover:bg-amber-500 text-black px-2 py-1 rounded font-bold cursor-pointer">🪙 Ouro</button>
                        <button type="button" data-admin-action="pokemon" data-admin-email="${email}" class="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded font-bold cursor-pointer">👾 Pokémon</button>
                        <button type="button" data-admin-action="item" data-admin-email="${email}" class="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded font-bold cursor-pointer">🎒 Item</button>
                        <button type="button" data-admin-action="password" data-admin-email="${email}" class="bg-blue-700 hover:bg-blue-600 text-white px-2 py-1 rounded font-bold cursor-pointer">🔑 Senha</button>
                        <button type="button" data-admin-action="delete" data-admin-email="${email}" class="bg-red-700 hover:bg-red-600 text-white px-2 py-1 rounded font-bold cursor-pointer">🗑️ Apagar</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    modalElement.innerHTML = `
        <div class="trainer-card max-w-5xl w-full p-6 space-y-4 border-4 border-red-600 rounded-3xl bg-gradient-to-b from-[#1c1410] to-[#0a0705] shadow-2xl text-white">
            <div class="flex justify-between items-center border-b border-red-900 pb-2">
                <span class="text-xs font-black text-red-400 font-cinzel"><i class="fa-solid fa-shield-halved"></i> PAINEL DO ADMINISTRADOR COMPLETO</span>
                <button type="button" id="close-admin-panel-button" class="text-red-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-red-800">✕ Fechar</button>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-slate-300">Total de contas cadastradas: <span class="text-amber-400">${safeUsers.length}</span></span>
                <button type="button" id="refresh-admin-users-button" class="bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1 rounded border border-red-700 cursor-pointer">🔄 Atualizar Lista</button>
            </div>
            <div class="max-h-80 overflow-y-auto border border-red-900/60 rounded-xl bg-black/60 p-2">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-red-900 text-[10px] text-red-300 uppercase">
                            <th class="p-2">E-mail</th>
                            <th class="p-2">Treinador</th>
                            <th class="p-2">Último Login</th>
                            <th class="p-2">Ouro</th>
                            <th class="p-2 text-right">Ações de Gestão</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        </div>
    `;

    modalElement.classList.remove('hidden');

    document.getElementById('close-admin-panel-button')?.addEventListener('click', () => {
        modalElement.classList.add('hidden');
    });

    document.getElementById('refresh-admin-users-button')?.addEventListener('click', () => {
        emitSocket('admin_get_users');
    });

    modalElement.querySelectorAll('[data-admin-action]').forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.adminAction;
            const email = button.dataset.adminEmail;

            if (action === 'gold') adminGiveGold(email);
            else if (action === 'pokemon') adminGivePokemon(email);
            else if (action === 'item') adminGiveItem(email);
            else if (action === 'password') adminResetPassword(email);
            else if (action === 'delete') adminDeleteAccount(email);
        });
    });
}

export function adminGiveGold(email) {
    const amountText = window.prompt(`Quantas moedas deseja adicionar à conta ${email}?`, '1000');
    const amount = Math.floor(Number(amountText) || 0);
    if (amount <= 0) return;

    emitSocket('admin_action', { action: 'give_gold', email, amount });
    setTimeout(() => emitSocket('admin_get_users'), 500);
}

export function adminGivePokemon(email) {
    const monId = window.prompt(`Insira o ID ou número do Pokémon para enviar ao treinador ${email}:`, 'charizard');
    if (!monId) return;
    emitSocket('admin_action', { action: 'give_pokemon', email, pokemonId: monId.trim().toLowerCase() });
}

export function adminGiveItem(email) {
    const itemId = window.prompt(`Insira o ID do item para enviar ao treinador ${email}:`, 'ball_ultra');
    if (!itemId) return;
    const qtyText = window.prompt(`Insira a quantidade:`, '5');
    const quantity = Math.max(1, Number(qtyText) || 1);
    emitSocket('admin_action', { action: 'give_item', email, itemId: itemId.trim().toLowerCase(), quantity });
}

export function adminResetPassword(email) {
    const newPassword = window.prompt(`Insira a nova senha temporária para ${email}:`, '');
    if (!newPassword || newPassword.length < 6) return;
    emitSocket('admin_action', { action: 'reset_password', email, newPassword });
}

export function adminDeleteAccount(email) {
    if (!window.confirm(`⚠️ Tem certeza absoluta de que deseja apagar a conta ${email}?`)) return;
    emitSocket('admin_action', { action: 'delete_account', email });
    setTimeout(() => emitSocket('admin_get_users'), 500);
}

window.openAdminPanelModal = openAdminPanelModal;
window.openCharacterCreationMode = function () {
    document.getElementById('auth-container')?.classList.add('hidden');
    document.getElementById('trainer-main-menu')?.classList.add('hidden');
    document.getElementById('character-creation-container')?.classList.remove('hidden');
};

window.selectAvatar = function(id) {
    window.selectedAvatarId = id;
    document.querySelectorAll('.avatar-option').forEach(el => {
        el.classList.remove('border-amber-400');
        el.classList.add('border-blue-900');
    });
    document.querySelector(`[data-avatar="${id}"]`)?.classList.replace('border-blue-900', 'border-amber-400');
};

window.selectStarter = function(starterName) {
    window.selectedStarterPokemon = starterName.toLowerCase();
    document.querySelectorAll('.starter-option').forEach(el => {
        el.classList.remove('border-amber-400', 'bg-amber-950/60');
        el.classList.add('border-blue-900', 'bg-black/40');
    });
    document.getElementById(`starter-${starterName.toLowerCase()}`)?.classList.replace('border-blue-900', 'border-amber-400');
};

window.finalizeCharacterCreation = function () {
    const nameInput = document.getElementById('setup-trainer-name');
    const trainerName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : 'Treinador';

    const existingPlayer = typeof getCurrentPlayer === 'function' ? getCurrentPlayer() : null;
    const preservedGold = existingPlayer && existingPlayer.gold !== undefined ? existingPlayer.gold : 350;
    const preservedPcBox = existingPlayer && Array.isArray(existingPlayer.pcBox) ? existingPlayer.pcBox : [];
    const preservedInventory = existingPlayer && Array.isArray(existingPlayer.inventory) ? existingPlayer.inventory : [];

    const starterKey = (window.selectedStarterPokemon || 'bulbasaur').toLowerCase();
    const starterMap = {
        'bulbasaur': { id: 'bulbasaur', name: 'Bulbasaur', dexNumber: '001', level: 5 },
        'charmander': { id: 'charmander', name: 'Charmander', dexNumber: '004', level: 5 },
        'squirtle': { id: 'squirtle', name: 'Squirtle', dexNumber: '007', level: 5 },
        'pikachu': { id: 'pikachu', name: 'Pikachu', dexNumber: '025', level: 5 }
    };

    const chosenStarter = starterMap[starterKey] || starterMap['bulbasaur'];
    chosenStarter.image = `https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/monsters/${chosenStarter.dexNumber}.png`;

    if (typeof gameState !== 'undefined') {
        gameState.turn = 1;
        gameState.currentPlayerIndex = 0;
        gameState.players = [{
            name: trainerName,
            avatarId: window.selectedAvatarId || 1,
            currentZone: 5,
            level: 1,
            gold: preservedGold,
            badges: [],
            activeTeam: [chosenStarter],
            pcBox: preservedPcBox,
            inventory: preservedInventory,
            equipmentSlots: [null, null]
        }];
    }

    ensureValidGameState();
    saveGameProgress();

    document.getElementById('character-creation-container')?.classList.add('hidden');
    document.getElementById('setup-screen')?.classList.add('hidden');
    document.getElementById('main-game-layout')?.classList.remove('hidden');

    if (typeof showCustomPopup === 'function') {
        showCustomPopup('Nova Jornada Iniciada', `Boa sorte, ${trainerName}! Começou com ${chosenStarter.name}.`, true);
    }
};

window.backToMainMenu = function () {
    document.getElementById('character-creation-container')?.classList.add('hidden');
    document.getElementById('online-lobby-container')?.classList.add('hidden');
    document.getElementById('auth-container')?.classList.add('hidden');
    document.getElementById('trainer-main-menu')?.classList.remove('hidden');
};
