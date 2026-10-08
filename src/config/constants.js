// --- src/config/constants.js ---

export const SUPABASE_STORAGE_URL = "https://juowcnkbjhfrbfttnwge.supabase.co/storage/v1/object/public/sprites/";
export const FULL_MAP_IMAGE = `${SUPABASE_STORAGE_URL}board/full_map_01.png`;

// Tabela de vantagens de tipos para o TCG e Batalhas
export const TYPE_ADVANTAGES = {
    fogo: { grama: 2, gelo: 2, agua: 0.5, fogo: 0.5 },
    agua: { fogo: 2, terra: 2, pedra: 2, grama: 0.5, agua: 0.5 },
    grama: { agua: 2, terra: 2, pedra: 2, fogo: 0.5, grama: 0.5, veneno: 0.5, voador: 0.5 },
    eletrico: { agua: 2, voador: 2, eletrico: 0.5, grama: 0.5 },
    pedra: { fogo: 2, voador: 2, gelo: 2, lutador: 0.5, terra: 0.5, aco: 0.5 }
};