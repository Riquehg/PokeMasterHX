// --- src/systems/admin.js ---
// Painel Administrativo Completo com Sincronização Cloud/Supabase

import { gameState } from '../core/state.js';
import { emitSocket } from '../core/socket.js';
import { MONSTER_CATALOG } from '../config/cards-data.js';

let adminUsersListenerRegistered = false;
let adminTimeoutTimer = null;

export let dailyFeaturedPokemonConfig = {
    pokemonId: 'charizard',
    pokemonName: 'Charizard',
    bonusItem: 'ball_ultra',
    bonusItemName: 'ULTRA BALL',
    goldBonus: 500
};

// Função para sincronizar o Pokémon do Dia recebido do servidor/Supabase com a HUD
export function applyDailyFeaturedPokemonConfig(serverConfig) {
    if (!serverConfig) return;
    
    if (serverConfig.pokemonId || serverConfig.pokemon_id) {
        dailyFeaturedPokemonConfig.pokemonId = (serverConfig.pokemonId || serverConfig.pokemon_id).toLowerCase();
        dailyFeaturedPokemonConfig.pokemonName = serverConfig.pokemonName || serverConfig.pokemon_name || (dailyFeaturedPokemonConfig.pokemonId.charAt(0).toUpperCase() + dailyFeaturedPokemonConfig.pokemonId.slice(1));
    }
    if (serverConfig.bonusItem || serverConfig.bonus_item) {
        dailyFeaturedPokemonConfig.bonusItem = serverConfig.bonusItem || serverConfig.bonus_item;
        dailyFeaturedPokemonConfig.bonusItemName = serverConfig.bonusItemName || serverConfig.bonus_item_name || 'Item Bónus';
    }
    if (serverConfig.goldBonus !== undefined || serverConfig.gold_bonus !== undefined) {
        dailyFeaturedPokemonConfig.goldBonus = Number(serverConfig.goldBonus || serverConfig.gold_bonus || 500);
    }

    // Atualiza imediatamente a HUD / Banner do Pokémon do Dia se os elementos existirem
    const nameEl = document.getElementById('daily-pokemon-name');
    const spriteEl = document.getElementById('daily-pokemon-sprite');
    const labelEl = document.getElementById('admin-current-daily-label');

    const monData = MONSTER_CATALOG.find(m => m.id === dailyFeaturedPokemonConfig.pokemonId);
    const spriteUrl = monData ? monData.image : `https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/monsters/006.png`;

    if (nameEl) nameEl.textContent = `${dailyFeaturedPokemonConfig.pokemonName} (+${dailyFeaturedPokemonConfig.bonusItemName})`;
    if (spriteEl) spriteEl.src = spriteUrl;
    if (labelEl) labelEl.textContent = `${dailyFeaturedPokemonConfig.pokemonName} (Bónus: ${dailyFeaturedPokemonConfig.bonusItemName} + ${dailyFeaturedPokemonConfig.goldBonus} 🪙)`;
}

// Inicializa os ouvintes globais de socket para o Pokémon do Dia em todos os clientes
export function initGlobalDailyPokemonListener() {
    const sock = typeof window.socket !== 'undefined' ? window.socket : null;
    if (sock && typeof sock.on === 'function') {
        sock.off('daily_pokemon_updated');
        sock.on('daily_pokemon_updated', (config) => {
            applyDailyFeaturedPokemonConfig(config);
        });

        // Solicita ao servidor a configuração atual assim que conecta
        emitSocket('get_daily_pokemon');
    }
}

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
            <p class="text-sm text-red-300 font-black">A carregar dados do Supabase (Servidor)...</p>
            <p class="text-[10px] text-slate-400">A aguardar resposta da nuvem...</p>
        </div>
    `;

    const sock = typeof window.socket !== 'undefined' ? window.socket : null;
    if (sock && typeof sock.on === 'function' && !adminUsersListenerRegistered) {
        sock.off('admin_users_list', handleAdminUsersList);
        sock.on('admin_users_list', handleAdminUsersList);
        
        sock.off('admin_action_response');
        sock.on('admin_action_response', (res) => {
            if (res && res.message) {
                alert(res.message);
                if (res.success) {
                    emitSocket('admin_get_users', { adminToken: password });
                }
            }
        });

        sock.off('admin_error');
        sock.on('admin_error', (err) => {
            alert(err?.message || 'Erro no painel administrativo.');
        });

        adminUsersListenerRegistered = true;
    }

    // Garante que o ouvinte global do Pokémon do dia também está ativo
    initGlobalDailyPokemonListener();

    // Temporizador de fallback caso o servidor demore a responder
    adminTimeoutTimer = setTimeout(() => {
        const localAccounts = [{
            email: gameState?.accountEmail || 'treinador@servidor.com',
            trainerName: gameState?.players?.[0]?.name || 'Ash Ketchum',
            lastLogin: new Date().toISOString(),
            gold: gameState?.players?.[0]?.gold || 350
        }];
        renderAdminDashboard(adminModal, localAccounts);
    }, 4000);

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
        <tr><td colspan="5" class="text-center py-4 text-slate-400">Nenhuma conta encontrada na base de dados do Supabase.</td></tr>
    ` : safeUsers.map(user => {
        const email = user?.email || user?.accountEmail || 'conta@servidor.com';
        const trainerName = user?.trainerName || user?.trainer_name || user?.name || 'Treinador';
        const lastLogin = user?.lastLogin || user?.updated_at ? new Date(user.lastLogin || user.updated_at).toLocaleString('pt-BR') : 'Ativo agora';
        const gold = Number(user?.gold || user?.profileData?.gold || user?.profile_data?.gold || 350);

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
                <span class="text-xs font-black text-red-400 font-cinzel">🛡️ PAINEL DO ADMINISTRADOR (SUPABASE CLOUD)</span>
                <button type="button" id="close-admin-panel-button" class="text-red-400 hover:text-white font-bold text-sm px-2 py-0.5 bg-black/60 rounded border border-red-800 cursor-pointer">✕ Fechar</button>
            </div>
            
            <!-- Configuração do Pokémon do Dia / Bônus -->
            <div class="bg-black/60 p-3 rounded-xl border border-red-900/60 flex items-center justify-between">
                <div>
                    <span class="text-[10px] text-amber-400 font-bold block">🌟 Pokémon de Destaque Atual (Sincronizado)</span>
                    <span class="text-xs font-black text-white" id="admin-current-daily-label">${dailyFeaturedPokemonConfig.pokemonName} (Item Bónus: ${dailyFeaturedPokemonConfig.bonusItemName} + ${dailyFeaturedPokemonConfig.goldBonus} 🪙)</span>
                </div>
                <button type="button" id="configure-daily-pokemon-btn" class="bg-amber-600 hover:bg-amber-500 text-black px-3 py-1.5 rounded-lg text-xs font-black cursor-pointer">⚙️ Configurar Destaque</button>
            </div>

            <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-slate-300">Contas na Base de Dados: <span class="text-amber-400">${safeUsers.length}</span></span>
                <button type="button" id="refresh-admin-users-button" class="bg-slate-800 hover:bg-slate-700 text-xs px-3 py-1 rounded border border-red-700 cursor-pointer">🔄 Atualizar Lista do Supabase</button>
            </div>
            <div class="max-h-72 overflow-y-auto border border-red-900/60 rounded-xl bg-black/60 p-2">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-red-900 text-[10px] text-red-300 uppercase">
                            <th class="p-2">E-mail</th>
                            <th class="p-2">Treinador</th>
                            <th class="p-2">Último Login</th>
                            <th class="p-2">Ouro</th>
                            <th class="p-2 text-right">Ações de Gestão Cloud</th>
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
        const newMon = window.prompt('Insira o ID ou nome do novo Pokémon de Destaque do Dia (ex: charizard, pikachu):', dailyFeaturedPokemonConfig.pokemonId);
        if (!newMon) return;
        const newItem = window.prompt('Insira o ID do item bónus ao capturar (ex: ball_ultra, item_rarecandy):', dailyFeaturedPokemonConfig.bonusItem);
        if (!newItem) return;
        const newGold = window.prompt('Insira a quantidade de ouro bónus:', String(dailyFeaturedPokemonConfig.goldBonus));

        const updatedConfig = {
            pokemonId: newMon.trim().toLowerCase(),
            pokemonName: newMon.charAt(0).toUpperCase() + newMon.slice(1),
            bonusItem: newItem.trim().toLowerCase(),
            bonusItemName: newItem.trim().toUpperCase(),
            goldBonus: Math.max(0, Number(newGold) || 500)
        };
        
        emitSocket('admin_set_daily_pokemon', { 
            configKey: 'pokemon_do_dia',
            dailyConfig: updatedConfig 
        });
        
        applyDailyFeaturedPokemonConfig(updatedConfig);
        alert(`✅ Pokémon de Destaque fixado como ${updatedConfig.pokemonName} na base de dados!`);
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
    const amountText = window.prompt(`Quantas moedas deseja adicionar à conta ${email} no Supabase?`, '1000');
    const amount = Math.floor(Number(amountText) || 0);
    if (amount <= 0) return;

    emitSocket('admin_action', { action: 'give_gold', email, amount });
    alert(`🪙 Comando enviado para adicionar ouro na conta de ${email}`);
}

export function adminGivePokemon(email) {
    const monId = window.prompt(`Insira o ID do Pokémon (ex: charizard, mewtwo, pikachu) para ${email}:`, 'charizard');
    if (!monId) return;
    emitSocket('admin_action', { 
        action: 'give_pokemon', 
        email, 
        pokemon: { id: monId.trim().toLowerCase(), name: monId.charAt(0).toUpperCase() + monId.slice(1), level: 5 } 
    });
    alert(`👾 Comando enviado para inserir Pokémon na PC Box/Equipa de ${email}`);
}

export function adminGiveItem(email) {
    const itemId = window.prompt(`Insira o ID do item (ex: ball_ultra, potion, rare_candy) para ${email}:`, 'ball_ultra');
    if (!itemId) return;
    const qtyText = window.prompt(`Insira a quantidade:`, '5');
    const count = Math.max(1, Number(qtyText) || 1);
    emitSocket('admin_action', { action: 'give_item', email, itemId: itemId.trim().toLowerCase(), count });
    alert(`🎒 Comando enviado para adicionar itens na mochila de ${email}`);
}

export function adminResetPassword(email) {
    const newPassword = window.prompt(`Insira a nova senha para ${email}:`, '');
    if (!newPassword || newPassword.length < 4) return;
    emitSocket('admin_action', { action: 'reset_password', email, newPass: newPassword });
    alert(`🔑 Comando enviado para redefinir senha de ${email}`);
}

export function adminDeleteAccount(email) {
    if (!window.confirm(`⚠️ Tem certeza absoluta de que deseja apagar a conta ${email} do Supabase?`)) return;
    emitSocket('admin_action', { action: 'delete_account', email });
    alert(`🗑️ Comando enviado para remover a conta.`);
}

// Inicializa o ouvinte global automaticamente ao carregar o módulo para que todos os clientes recebam atualizações
if (typeof window !== 'undefined') {
    setTimeout(() => {
        initGlobalDailyPokemonListener();
    }, 1000);
}

window.openAdminPanelModal = openAdminPanelModal;
window.applyDailyFeaturedPokemonConfig = applyDailyFeaturedPokemonConfig;
window.initGlobalDailyPokemonListener = initGlobalDailyPokemonListener;
