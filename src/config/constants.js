// --- src/config/constants.js ---

export const SUPABASE_STORAGE_URL = "https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/";
export const FULL_MAP_IMAGE = `${SUPABASE_STORAGE_URL}board/full_map_01.png`;

// Tabela de vantagens de tipos para o TCG e Batalhas
export const TYPE_ADVANTAGES = {
    fogo: { grama: 2, gelo: 2, agua: 0.5, fogo: 0.5, dragao: 0.5, pedra: 0.5 },
    agua: { fogo: 2, terra: 2, pedra: 2, grama: 0.5, agua: 0.5, dragao: 0.5 },
    grama: { agua: 2, terra: 2, pedra: 2, fogo: 0.5, grama: 0.5, veneno: 0.5, voador: 0.5, inseto: 0.5, dragao: 0.5, aco: 0.5 },
    eletrico: { agua: 2, voador: 2, eletrico: 0.5, grama: 0.5, dragao: 0.5, terra: 0 },
    pedra: { fogo: 2, voador: 2, gelo: 2, inseto: 2, lutador: 0.5, terra: 0.5, aco: 0.5 },
    normal: { pedra: 0.5, aco: 0.5, fantasma: 0 },
    gelo: { grama: 2, terra: 2, voador: 2, dragao: 2, fogo: 0.5, agua: 0.5, gelo: 0.5, aco: 0.5 },
    lutador: { normal: 2, pedra: 2, gelo: 2, aco: 2, trevas: 2, voador: 0.5, veneno: 0.5, inseto: 0.5, psiquico: 0.5, fada: 0.5, fantasma: 0 },
    veneno: { grama: 2, fada: 2, veneno: 0.5, terra: 0.5, pedra: 0.5, fantasma: 0.5, aco: 0 },
    terra: { fogo: 2, eletrico: 2, veneno: 2, pedra: 2, aco: 2, grama: 0.5, inseto: 0.5, voador: 0 },
    voador: { grama: 2, lutador: 2, inseto: 2, eletrico: 0.5, pedra: 0.5, aco: 0.5 },
    psiquico: { lutador: 2, veneno: 2, psiquico: 0.5, aco: 0.5, trevas: 0 },
    inseto: { grama: 2, psiquico: 2, trevas: 2, fogo: 0.5, lutador: 0.5, veneno: 0.5, voador: 0.5, fantasma: 0.5, aco: 0.5, fada: 0.5 },
    fantasma: { psiquico: 2, fantasma: 2, trevas: 0.5, normal: 0 },
    dragao: { dragao: 2, aco: 0.5, fada: 0 },
    aco: { gelo: 2, pedra: 2, fada: 2, fogo: 0.5, agua: 0.5, eletrico: 0.5, aco: 0.5 }
};

/**
 * Retorna o multiplicador de eficácia de um tipo de ataque contra um tipo de defesa.
 * @param {string} attackType 
 * @param {string} defenseType 
 * @returns {number}
 */
export function getTypeMultiplier(attackType, defenseType) {
    if (!attackType || !defenseType) return 1;
    const atk = attackType.toLowerCase().trim();
    const def = defenseType.toLowerCase().trim();

    if (TYPE_ADVANTAGES[atk] && TYPE_ADVANTAGES[atk][def] !== undefined) {
        return TYPE_ADVANTAGES[atk][def];
    }
    return 1; // Padrão neutro caso não esteja listado
}

window.TYPE_ADVANTAGES = TYPE_ADVANTAGES;
window.getTypeMultiplier = getTypeMultiplier;
