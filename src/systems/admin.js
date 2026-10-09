// --- src/systems/admin.js ---
// Painel Administrativo Completo com Fallback de Segurança

import { gameState } from '../core/state.js';
import { emitSocket } from '../core/socket.js';

let adminUsersListenerRegistered = false;
let adminTimeoutTimer = null;

export const dailyFeaturedPokemonConfig = {
    pokemonId: 'charizard',
    pokemonName: 'Charizard',
    bonusItem: 'ball_ultra',
    bonusItemName: 'ULTRA BALL',
    goldBonus: 500
};

export function handleAdminUsersList(users) {
    if (adminTimeoutTimer) {
        clearTimeout(adminTimeoutTimer);
        adminTimeoutTimer = null;
    }
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
            <p class="text-[10px] text-slate-400">A aguardar resposta do servidor cloud...</p>
        </div>
    `;

    const sock = typeof window.socket !== 'undefined' ? window.socket : null;
    if (sock && typeof sock.on === 'function' && !adminUsersListenerRegistered) {
        sock.on('admin_users_list', handleAdminUsersList);
        sock.on('admin_error', (err) => {
            alert(err?.message || 'Erro no painel administrativo.');
        });
        adminUsersListenerRegistered = true;
    }

    // Segurança de 3 segundos: se o servidor demorar ou falhar, abre o painel com os dados locais atuais
    adminTimeoutTimer = setTimeout(() => {
        const localAccounts = [{
            email: 'treinador.atual@local.com',
            trainerName: gameState?.players?.[0]?.name || 'Ash Ketchum',
            lastLogin: new Date().toISOString(),
            gold: gameState?.players?.[0]?.gold || 350
        }];
        renderAdminDashboard(adminModal, localAccounts);
    }, 3000);

    emitSocket('admin_get_users', { adminToken: password });
    adminModal.classList.remove('hidden');
}

export function renderAdminDashboard(modalElement, users) {
    if (adminTimeoutTimer) {
        clearTimeout(adminTimeoutTimer);
        adminTimeoutTimer = null;
    }

    const safeUsers = Array.isArray(users) ? users : [];

    const rowsHtml = safeUsers.length === 0 ? `
        <tr><td colspan="5" class="text-center py-4 text-slate-400">Nenhuma conta encontrada na nuvem.</td></tr>
    ` : safeUsers.map(user => {
        const email = user?.email || 'conta_local@game.com';
        const trainerName = user?.trainerName || user?.trainer_name || user?.name || 'Treinador';
        const lastLogin = user?.lastLogin ? new Date(user.lastLogin).toLocaleString('pt-BR') : 'Ativo agora';
        const gold = Number(user?.gold || user?.profile_data?.gold || 350);

        return `
            <tr class="border-b border-red-900/40 text-[11px] hover:bg-red-950/20">
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
                <button type="button" id="close-admin-panel-button" class="text-red-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-red-800 cursor-pointer">✕ Fechar</button>
            </div>
            
            <!-- Configuração do Pokémon do Dia / Bônus -->
            <div class="bg-black/60 p-3 rounded-xl border border-red-900/60 flex items-center justify-between">
                <div>
                    <span class="text-[10px] text-amber-400 font-bold block">🌟 Pokémon de Destaque Atual (Bônus de Captura)</span>
                    <span class="text-xs font-black text-white" id="admin-current-daily-label">${dailyFeaturedPokemonConfig.pokemonName} (Bônus: ${dailyFeaturedPokemonConfig.bonusItemName})</span>
                </div>
                <button type="button" id="configure-daily-pokemon-btn" class="bg-amber-600 hover:bg-amber-500 text-black px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer">⚙️ Configurar Destaque</button>
            </div>

            <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-slate-300">Contas geridas no painel: <span class="text-amber-400">${safeUsers.length}</span></span>
                <button type="button" id="refresh-admin-users-button" class="bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1 rounded border border-red-700 cursor-pointer">🔄 Atualizar Lista</button>
            </div>
            <div class="max-h-72 overflow-y-auto border border-red-900/60 rounded-xl bg-black/60 p-2">
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

    document.getElementById('configure-daily-pokemon-btn')?.addEventListener('click', () => {
        const newMon = window.prompt('Insira o nome ou ID do novo Pokémon de Destaque do Dia:', dailyFeaturedPokemonConfig.pokemonId);
        if (!newMon) return;
        dailyFeaturedPokemonConfig.pokemonId = newMon.trim().toLowerCase();
        dailyFeaturedPokemonConfig.pokemonName = newMon.charAt(0).toUpperCase() + newMon.slice(1);
        alert(`✅ Pokémon de Destaque alterado para ${dailyFeaturedPokemonConfig.pokemonName}!`);
        document.getElementById('admin-current-daily-label').textContent = `${dailyFeaturedPokemonConfig.pokemonName} (Bônus ativo)`;
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
    alert(`🪙 Pedido para adicionar ouro enviado para ${email}`);
}

export function adminGivePokemon(email) {
    const monId = window.prompt(`Insira o ID do Pokémon (ex: charizard, mewtwo, pikachu) para ${email}:`, 'charizard');
    if (!monId) return;
    emitSocket('admin_action', { 
        action: 'give_pokemon', 
        email, 
        pokemon: { id: monId.trim().toLowerCase(), name: monId.charAt(0).toUpperCase() + monId.slice(1), level: 5 } 
    });
    alert(`👾 Pedido para enviar Pokémon enviado para ${email}`);
}

export function adminGiveItem(email) {
    const itemId = window.prompt(`Insira o ID do item (ex: ball_ultra, potion, rare_candy) para ${email}:`, 'ball_ultra');
    if (!itemId) return;
    const qtyText = window.prompt(`Insira a quantidade:`, '5');
    const count = Math.max(1, Number(qtyText) || 1);
    emitSocket('admin_action', { action: 'give_item', email, itemId: itemId.trim().toLowerCase(), count });
    alert(`🎒 Pedido para enviar itens enviado para ${email}`);
}

export function adminResetPassword(email) {
    const newPassword = window.prompt(`Insira a nova senha temporária para ${email}:`, '');
    if (!newPassword || newPassword.length < 4) return;
    emitSocket('admin_action', { action: 'reset_password', email, newPass: newPassword });
    alert(`🔑 Pedido de alteração de senha enviado para ${email}`);
}

export function adminDeleteAccount(email) {
    if (!window.confirm(`⚠️ Tem certeza absoluta de que deseja apagar a conta ${email}?`)) return;
    emitSocket('admin_action', { action: 'delete_account', email });
    alert(`🗑️ Pedido para apagar conta enviado.`);
}

window.openAdminPanelModal = openAdminPanelModal;
