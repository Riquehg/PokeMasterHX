// --- src/systems/map.js ---
// Módulo do Tabuleiro, Caminhos e Multiplayer Sincronizado (Versão Integrada e Funcional)

import { SUPABASE_STORAGE_URL, FULL_MAP_IMAGE } from '../config/constants.js';
import { gameState, getCurrentPlayer, movementState, ensureValidGameState } from '../core/state.js';
import { saveGameProgress } from '../core/storage.js';
import { openEncounterModalWithPokemon } from './encounter.js';
import { MONSTER_CATALOG } from '../config/cards-data.js';

export const BOARD_WAYPOINTS = [
    // --- HEXÁGONO A ---
    { id: 5, name: "Inicio Pallet", hexagon: "A", top: 61.2, left: 6.7, type: "city", color: "rosa", requiredType: "", connections: [6] },
    { id: 6, name: "casa_6", hexagon: "A", top: 72.2, left: 7.7, type: "pokemon", color: "rosa", requiredType: "", connections: [7] },
    { id: 7, name: "casa_7", hexagon: "A", top: 81.5, left: 8.2, type: "pokemon", color: "rosa", requiredType: "", connections: [8] },
    { id: 8, name: "casa_8", hexagon: "A", top: 89.6, left: 9.9, type: "pokemon", color: "rosa", requiredType: "", connections: [9] },
    { id: 9, name: "casa_9", hexagon: "A", top: 78.6, left: 13.3, type: "pokemon", color: "rosa", requiredType: "", connections: [10] },
    { id: 10, name: "casa_10", hexagon: "A", top: 69.4, left: 11.4, type: "event", color: "rosa", requiredType: "", connections: [11] },
    { id: 11, name: "casa_11", hexagon: "A", top: 65.5, left: 15.6, type: "event", color: "rosa", requiredType: "", connections: [12, 14] },
    { id: 12, name: "casa_12", hexagon: "A", top: 74.1, left: 17.7, type: "pokemon", color: "rosa", requiredType: "", connections: [9, 11, 13] },
    { id: 13, name: "casa_13", hexagon: "A", top: 70.3, left: 22.2, type: "event", color: "rosa", requiredType: "", connections: [12, 32] },
    { id: 14, name: "casa_14", hexagon: "A", top: 57.5, left: 12.9, type: "pokemon", color: "rosa", requiredType: "", connections: [11, 15] },
    { id: 15, name: "casa_15", hexagon: "A", top: 53.1, left: 17.5, type: "pokemon", color: "rosa", requiredType: "", connections: [14, 16] },

    // --- HEXÁGONO B ---
    { id: 16, name: "casa_16", hexagon: "B", top: 44.4, left: 19.4, type: "pokemon", color: "rosa", requiredType: "", connections: [15, 17, 30] },
    { id: 17, name: "casa_17", hexagon: "B", top: 39.3, left: 15.3, type: "event", color: "rosa", requiredType: "", connections: [16, 18] },
    { id: 18, name: "casa_18", hexagon: "B", top: 28.9, left: 15.4, type: "pokemon", color: "rosa", requiredType: "", connections: [17, 19] },
    { id: 19, name: "casa_19", hexagon: "B", top: 26.5, left: 19.6, type: "pokemon", color: "verde", requiredType: "", connections: [18, 20] },
    { id: 20, name: "Cerulean City", hexagon: "B", top: 31.7, left: 24.8, type: "city", color: "verde", requiredType: "", connections: [19, 21, 28] },
    { id: 21, name: "casa_21", hexagon: "B", top: 21.0, left: 23.4, type: "event", color: "verde", requiredType: "", connections: [20, 22, 31] },
    { id: 22, name: "casa_22", hexagon: "B", top: 6.7, left: 22.7, type: "pokemon", color: "verde", requiredType: "", connections: [21, 23] },
    { id: 23, name: "casa_23", hexagon: "B", top: 8.1, left: 27.5, type: "event", color: "verde", requiredType: "", connections: [22, 24] },
    { id: 24, name: "casa_24", hexagon: "B", top: 15.1, left: 31.5, type: "pokemon", color: "verde", requiredType: "", connections: [23, 25] },
    { id: 25, name: "casa_25", hexagon: "B", top: 30.0, left: 29.4, type: "event", color: "verde", requiredType: "", connections: [24, 26] },
    { id: 26, name: "casa_26", hexagon: "B", top: 36.7, left: 32.9, type: "pokemon", color: "verde", requiredType: "", connections: [25, 27, 48] },
    { id: 27, name: "casa_27", hexagon: "B", top: 42.2, left: 30.3, type: "event", color: "verde", requiredType: "", connections: [26, 28, 43] },
    { id: 28, name: "casa_28", hexagon: "B", top: 41.5, left: 26.4, type: "pokemon", color: "verde", requiredType: "", connections: [20, 27, 29] },
    { id: 29, name: "casa_29", hexagon: "B", top: 49.3, left: 26.5, type: "event", color: "verde", requiredType: "", connections: [28, 30] },
    { id: 30, name: "casa_30", hexagon: "B", top: 50.3, left: 22.6, type: "event", color: "verde", requiredType: "", connections: [16, 29] },
    { id: 31, name: "casa_31", hexagon: "B", top: 14.1, left: 26.6, type: "pokemon", color: "azul", requiredType: "rock", connections: [21] },

    // --- HEXÁGONO C ---
    { id: 32, name: "casa_32", hexagon: "C", top: 69.7, left: 26.1, type: "pokemon", color: "rosa", requiredType: "", connections: [13, 33, 45] },
    { id: 33, name: "casa_33", hexagon: "C", top: 72.8, left: 30.0, type: "pokemon", color: "verde", requiredType: "", connections: [32, 34] },
    { id: 34, name: "casa_34", hexagon: "C", top: 80.2, left: 30.1, type: "event", color: "verde", requiredType: "", connections: [33, 35, 47] },
    { id: 35, name: "casa_35", hexagon: "C", top: 79.9, left: 34.4, type: "pokemon", color: "verde", requiredType: "", connections: [34, 36] },
    { id: 36, name: "casa_36", hexagon: "C", top: 84.4, left: 37.5, type: "pokemon", color: "verde", requiredType: "", connections: [35, 37] },
    { id: 37, name: "casa_37", hexagon: "C", top: 86.2, left: 41.5, type: "event", color: "verde", requiredType: "", connections: [36, 38] },
    { id: 38, name: "casa_38", hexagon: "C", top: 79.1, left: 43.2, type: "pokemon", color: "verde", requiredType: "", connections: [37, 39, 73] },
    { id: 39, name: "Pewter City", hexagon: "C", top: 67.6, left: 41.8, type: "city", color: "verde", requiredType: "", connections: [38, 40] },
    { id: 40, name: "casa_40", hexagon: "C", top: 57.9, left: 42.3, type: "event", color: "verde", requiredType: "", connections: [39, 41, 58] },
    { id: 41, name: "casa_41", hexagon: "C", top: 60.0, left: 38.3, type: "pokemon", color: "verde", requiredType: "", connections: [40, 42] },
    { id: 42, name: "casa_42", hexagon: "C", top: 58.2, left: 35.0, type: "pokemon", color: "verde", requiredType: "", connections: [41, 43, 44] },
    { id: 43, name: "casa_43", hexagon: "C", top: 50.3, left: 33.4, type: "event", color: "verde", requiredType: "", connections: [27, 42, 46] },
    { id: 44, name: "casa_44", hexagon: "C", top: 64.2, left: 32.3, type: "pokemon", color: "verde", requiredType: "", connections: [42, 45] },
    { id: 45, name: "casa_45", hexagon: "C", top: 63.7, left: 28.6, type: "event", color: "verde", requiredType: "", connections: [32, 44, 46] },
    { id: 46, name: "casa_46", hexagon: "C", top: 54.2, left: 29.4, type: "event", color: "verde", requiredType: "flying", connections: [43, 45] },
    { id: 47, name: "casa_47", hexagon: "C", top: 87.3, left: 30.3, type: "pokemon", color: "rosa", requiredType: "", connections: [34] },

    // --- HEXÁGONO D ---
    { id: 48, name: "casa_48", hexagon: "D", top: 36.6, left: 37.1, type: "pokemon", color: "azul", requiredType: "", connections: [26, 49] },
    { id: 49, name: "casa_49", hexagon: "D", top: 34.7, left: 41.9, type: "event", color: "azul", requiredType: "", connections: [48, 50, 59] },
    { id: 50, name: "casa_50", hexagon: "D", top: 23.2, left: 40.7, type: "pokemon", color: "azul", requiredType: "", connections: [49, 51, 60] },
    { id: 51, name: "casa_51", hexagon: "D", top: 15.6, left: 41.6, type: "event", color: "azul", requiredType: "", connections: [50, 52] },
    { id: 52, name: "casa_52", hexagon: "D", top: 8.0, left: 42.9, type: "event", color: "azul", requiredType: "", connections: [51, 53] },
    { id: 53, name: "casa_53", hexagon: "D", top: 8.3, left: 48.1, type: "event", color: "azul", requiredType: "", connections: [52, 54] },
    { id: 54, name: "casa_54", hexagon: "D", top: 16.6, left: 49.4, type: "pokemon", color: "azul", requiredType: "", connections: [53, 55, 61] },
    { id: 55, name: "casa_55", hexagon: "D", top: 26.6, left: 54.4, type: "pokemon", color: "vermelho", requiredType: "", connections: [54, 56, 79] },
    { id: 56, name: "casa_56", hexagon: "D", top: 38.1, left: 54.7, type: "event", color: "azul", requiredType: "", connections: [55, 57] },
    { id: 57, name: "casa_57", hexagon: "D", top: 45.5, left: 51.0, type: "pokemon", color: "azul", requiredType: "", connections: [56, 58, 62] },
    { id: 58, name: "casa_58", hexagon: "D", top: 51.5, left: 45.0, type: "event", color: "azul", requiredType: "", connections: [40, 57, 59] },
    { id: 59, name: "casa_59", hexagon: "D", top: 44.2, left: 43.2, type: "pokemon", color: "azul", requiredType: "", connections: [49, 58] },
    { id: 60, name: "Vermilion City", hexagon: "D", top: 30.8, left: 46.7, type: "city", color: "azul", requiredType: "", connections: [50, 61] },
    { id: 61, name: "casa_61", hexagon: "D", top: 20.3, left: 45.7, type: "pokemon", color: "vermelho", requiredType: "fire", connections: [54, 60] },

    // --- HEXÁGONO E ---
    { id: 62, name: "casa_62", hexagon: "E", top: 54.0, left: 53.5, type: "pokemon", color: "azul", requiredType: "", connections: [57, 63, 75] },
    { id: 63, name: "casa_63", hexagon: "E", top: 54.8, left: 59.8, type: "event", color: "azul", requiredType: "", connections: [62, 64, 77] },
    { id: 64, name: "casa_64", hexagon: "E", top: 60.6, left: 65.1, type: "event", color: "azul", requiredType: "", connections: [63, 65] },
    { id: 65, name: "casa_65", hexagon: "E", top: 71.1, left: 65.5, type: "event", color: "azul", requiredType: "", connections: [64, 66, 104] },
    { id: 66, name: "casa_66", hexagon: "E", top: 70.3, left: 61.9, type: "pokemon", color: "azul", requiredType: "", connections: [65, 67, 76] },
    { id: 67, name: "casa_67", hexagon: "E", top: 80.2, left: 62.9, type: "pokemon", color: "azul", requiredType: "", connections: [66, 68] },
    { id: 68, name: "casa_68", hexagon: "E", top: 88.1, left: 62.0, type: "event", color: "azul", requiredType: "", connections: [67, 69] },
    { id: 69, name: "casa_69", hexagon: "E", top: 88.6, left: 58.2, type: "pokemon", color: "azul", requiredType: "", connections: [68, 70, 71] },
    { id: 70, name: "Celadon City", hexagon: "E", top: 76.3, left: 57.7, type: "city", color: "azul", requiredType: "", connections: [69] },
    { id: 71, name: "casa_71", hexagon: "E", top: 93.9, left: 55.6, type: "event", color: "azul", requiredType: "", connections: [69, 72] },
    { id: 72, name: "casa_72", hexagon: "E", top: 87.1, left: 51.2, type: "pokemon", color: "azul", requiredType: "", connections: [71, 73] },
    { id: 73, name: "casa_73", hexagon: "E", top: 79.5, left: 48.4, type: "pokemon", color: "azul", requiredType: "", connections: [38, 72, 74] },
    { id: 74, name: "casa_74", hexagon: "E", top: 72.1, left: 51.7, type: "event", color: "azul", requiredType: "", connections: [73, 75, 76] },
    { id: 75, name: "casa_75", hexagon: "E", top: 63.2, left: 50.7, type: "pokemon", color: "azul", requiredType: "", connections: [62, 74] },
    { id: 76, name: "casa_76", hexagon: "E", top: 68.2, left: 56.6, type: "pokemon", color: "azul", requiredType: "grass", connections: [66, 74] },

    // --- HEXÁGONO F ---
    { id: 77, name: "casa_77", hexagon: "F", top: 43.8, left: 61.3, type: "event", color: "vermelho", requiredType: "", connections: [63, 78, 90] },
    { id: 78, name: "casa_78", hexagon: "F", top: 32.6, left: 61.6, type: "pokemon", color: "vermelho", requiredType: "", connections: [77, 79] },
    { id: 79, name: "casa_79", hexagon: "F", top: 27.7, left: 58.8, type: "pokemon", color: "vermelho", requiredType: "", connections: [55, 78, 80] },
    { id: 80, name: "casa_80", hexagon: "F", top: 24.8, left: 63.0, type: "pokemon", color: "vermelho", requiredType: "", connections: [79, 81] },
    { id: 81, name: "casa_81", hexagon: "F", top: 14.5, left: 61.7, type: "event", color: "vermelho", requiredType: "", connections: [80, 83] },
    { id: 82, name: "casa_82", hexagon: "F", top: 16.0, left: 68.2, type: "pokemon", color: "vermelho", requiredType: "", connections: [83, 84] },
    { id: 83, name: "casa_83", hexagon: "F", top: 5.9, left: 67.7, type: "pokemon", color: "vermelho", requiredType: "", connections: [81, 82] },
    { id: 84, name: "casa_84", hexagon: "F", top: 13.1, left: 71.7, type: "event", color: "vermelho", requiredType: "", connections: [82, 85] },
    { id: 85, name: "casa_85", hexagon: "F", top: 21.4, left: 73.1, type: "pokemon", color: "vermelho", requiredType: "", connections: [84, 86] },
    { id: 86, name: "casa_86", hexagon: "F", top: 31.9, left: 73.6, type: "pokemon", color: "vermelho", requiredType: "", connections: [85, 87, 91] },
    { id: 87, name: "casa_87", hexagon: "F", top: 42.4, left: 75.0, type: "event", color: "vermelho", requiredType: "", connections: [86, 88, 107] },
    { id: 88, name: "casa_88", hexagon: "F", top: 49.1, left: 69.6, type: "pokemon", color: "vermelho", requiredType: "", connections: [87, 89, 92] },
    { id: 89, name: "casa_89", hexagon: "F", top: 41.0, left: 69.1, type: "event", color: "vermelho", requiredType: "", connections: [88, 90] },
    { id: 90, name: "casa_90", hexagon: "F", top: 39.8, left: 64.6, type: "event", color: "vermelho", requiredType: "", connections: [77, 89, 91] },
    { id: 91, name: "Cinnabar Island", hexagon: "F", top: 31.5, left: 68.4, type: "city", color: "vermelho", requiredType: "", connections: [86, 90] },

    // --- HEXÁGONO G ---
    { id: 92, name: "casa_92", hexagon: "G", top: 57.2, left: 71.6, type: "pokemon", color: "vermelho", requiredType: "", connections: [88, 93, 103] },
    { id: 93, name: "casa_93", hexagon: "G", top: 53.9, left: 75.0, type: "event", color: "vermelho", requiredType: "", connections: [92, 94] },
    { id: 94, name: "casa_94", hexagon: "G", top: 50.6, left: 78.1, type: "pokemon", color: "vermelho", requiredType: "", connections: [93, 95] },
    { id: 95, name: "Fuchsia City", hexagon: "G", top: 63.4, left: 77.5, type: "city", color: "vermelho", requiredType: "", connections: [94, 96] },
    { id: 96, name: "casa_96", hexagon: "G", top: 64.1, left: 82.9, type: "pokemon", color: "vermelho", requiredType: "", connections: [95, 97] },
    { id: 97, name: "casa_97", hexagon: "G", top: 72.3, left: 84.6, type: "pokemon", color: "vermelho", requiredType: "", connections: [96, 98, 101] },
    { id: 98, name: "casa_98", hexagon: "G", top: 82.8, left: 86.8, type: "event", color: "vermelho", requiredType: "", connections: [97, 99] },
    { id: 99, name: "casa_99", hexagon: "G", top: 85.2, left: 80.5, type: "pokemon", color: "vermelho", requiredType: "", connections: [98, 100, 106] },
    { id: 100, name: "casa_100", hexagon: "G", top: 80.9, left: 77.0, type: "event", color: "vermelho", requiredType: "", connections: [99, 101, 102] },
    { id: 101, name: "casa_101", hexagon: "G", top: 72.0, left: 79.2, type: "event", color: "vermelho", requiredType: "", connections: [97, 100] },
    { id: 102, name: "casa_102", hexagon: "G", top: 86.3, left: 72.5, type: "pokemon", color: "azul", requiredType: "", connections: [100, 105] },
    { id: 103, name: "casa_103", hexagon: "G", top: 67.2, left: 72.7, type: "event", color: "vermelho", requiredType: "", connections: [92, 105] },
    { id: 104, name: "casa_104", hexagon: "G", top: 70.2, left: 69.6, type: "pokemon", color: "vermelho", requiredType: "", connections: [65, 105] },
    { id: 105, name: "casa_105", hexagon: "G", top: 77.1, left: 72.8, type: "pokemon", color: "vermelho", requiredType: "", connections: [102, 103, 104] },
    { id: 106, name: "casa_106", hexagon: "G", top: 92.6, left: 80.3, type: "event", color: "vermelho", requiredType: "", connections: [99] },

    // --- HEXÁGONO H ---
    { id: 107, name: "Indigo Plateau", hexagon: "H", top: 38.4, left: 81.6, type: "city", color: "amarelo", requiredType: "", connections: [87, 108, 121] },
    { id: 108, name: "casa_108", hexagon: "H", top: 27.1, left: 82.3, type: "event", color: "amarelo", requiredType: "", connections: [107, 109] },
    { id: 109, name: "casa_109", hexagon: "H", top: 16.9, left: 81.0, type: "pokemon", color: "amarelo", requiredType: "", connections: [108, 110] },
    { id: 110, name: "casa_110", hexagon: "H", top: 12.1, left: 84.8, type: "event", color: "amarelo", requiredType: "", connections: [109, 111] },
    { id: 111, name: "casa_111", hexagon: "H", top: 14.8, left: 89.0, type: "pokemon", color: "amarelo", requiredType: "", connections: [110, 112] },
    { id: 112, name: "casa_112", hexagon: "H", top: 14.7, left: 93.6, type: "event", color: "amarelo", requiredType: "", connections: [111, 113] },
    { id: 113, name: "casa_113", hexagon: "H", top: 18.8, left: 97.3, type: "pokemon", color: "amarelo", requiredType: "", connections: [112, 114] },
    { id: 114, name: "Liga Pokémon (Entrada)", hexagon: "H", top: 27.7, left: 97.0, type: "city", color: "amarelo", requiredType: "", connections: [113, 115, 124] },
    { id: 115, name: "casa_115", hexagon: "H", top: 36.3, left: 98.6, type: "event", color: "amarelo", requiredType: "", connections: [114, 116] },
    { id: 116, name: "casa_116", hexagon: "H", top: 43.1, left: 95.9, type: "pokemon", color: "verde", requiredType: "", connections: [115, 117] },
    { id: 117, name: "casa_117", hexagon: "H", top: 37.0, left: 93.0, type: "pokemon", color: "amarelo", requiredType: "", connections: [116, 118] },
    { id: 118, name: "casa_118", hexagon: "H", top: 47.9, left: 92.3, type: "event", color: "amarelo", requiredType: "", connections: [117, 119] },
    { id: 119, name: "casa_119", hexagon: "H", top: 51.3, left: 88.6, type: "event", color: "amarelo", requiredType: "", connections: [118, 120] },
    { id: 120, name: "casa_120", hexagon: "H", top: 45.8, left: 84.9, type: "pokemon", color: "azul", requiredType: "", connections: [119, 121] },
    { id: 121, name: "casa_121", hexagon: "H", top: 37.6, left: 86.3, type: "pokemon", color: "amarelo", requiredType: "", connections: [107, 120, 122] },
    { id: 122, name: "casa_122", hexagon: "H", top: 29.3, left: 87.0, type: "city", color: "amarelo", requiredType: "", connections: [121, 123, 124] },
    { id: 123, name: "casa_123", hexagon: "H", top: 21.4, left: 85.6, type: "pokemon", color: "amarelo", requiredType: "", connections: [122] },
    { id: 124, name: "Arena Final", hexagon: "H", top: 28.8, left: 92.1, type: "city", color: "amarelo", requiredType: "", connections: [114, 122] }
];

export function getValidDestinations(startWaypointId, steps) {
    let validIds = new Set();
    const activePlayer = (typeof getCurrentPlayer === 'function') ? getCurrentPlayer() : (gameState.players ? gameState.players[gameState.currentPlayerIndex || 0] : null);
    const playerBadges = activePlayer && Array.isArray(activePlayer.badges) ? activePlayer.badges.length : 0;

    let adjacencyList = {};
    BOARD_WAYPOINTS.forEach(wp => {
        if (!adjacencyList[wp.id]) adjacencyList[wp.id] = new Set();
        if (wp.connections && Array.isArray(wp.connections)) {
            wp.connections.forEach(neighborId => {
                adjacencyList[wp.id].add(neighborId);
                if (!adjacencyList[neighborId]) adjacencyList[neighborId] = new Set();
                adjacencyList[neighborId].add(wp.id);
            });
        }
    });

    let queue = [{ id: Number(startWaypointId), stepsLeft: steps, visitedInPath: new Set([Number(startWaypointId)]) }];

    while (queue.length > 0) {
        let current = queue.shift();

        if (current.stepsLeft === 0) {
            if (current.id !== Number(startWaypointId)) {
                validIds.add(current.id);
            }
            continue;
        }

        let neighbors = adjacencyList[current.id] ? Array.from(adjacencyList[current.id]) : [];

        neighbors.forEach(neighborId => {
            if (current.visitedInPath.has(neighborId)) return;

            let neighborWp = BOARD_WAYPOINTS.find(w => w.id === neighborId);
            if (!neighborWp) return;

            if (neighborWp.requiredType && neighborWp.requiredType.trim() !== "") {
                const required = neighborWp.requiredType.toLowerCase();
                const team = activePlayer && (activePlayer.activeTeam || activePlayer.team) ? (activePlayer.activeTeam || activePlayer.team) : [];
                const hasRequiredType = team.some(mon => {
                    if (!mon || !mon.type) return false;
                    const monTypes = Array.isArray(mon.type) ? mon.type.join(' ').toLowerCase() : String(mon.type).toLowerCase();
                    return monTypes.includes(required);
                });
                if (!hasRequiredType) return;
            }

            const isIndigoPlateauOrEnd = neighborWp.name.toLowerCase().includes("indigo plateau") || 
                                       neighborWp.name.toLowerCase().includes("liga pokémon") || 
                                       neighborWp.name.toLowerCase().includes("arena final");
            if (isIndigoPlateauOrEnd && playerBadges < 6) return;

            let nextVisited = new Set(current.visitedInPath);
            nextVisited.add(neighborId);

            queue.push({
                id: neighborId,
                stepsLeft: current.stepsLeft - 1,
                visitedInPath: nextVisited
            });
        });
    }

    return Array.from(validIds);
}

export function rollDiceForMovement() {
    if (typeof movementState !== 'undefined' && movementState.hasRolledThisTurn) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup("Aviso", "Já rolaste o dado neste turno! Clica numa casa destacada ou passa a vez.", false);
        }
        return;
    }

    if (typeof rollDiceWithAnimation === 'function') {
        rollDiceWithAnimation((diceResult) => {
            const cp = (typeof getCurrentPlayer === 'function') ? getCurrentPlayer() : gameState.players[gameState.currentPlayerIndex];
            const currentZone = cp.currentZone || 5;

            const validNextSteps = getValidDestinations(currentZone, diceResult);
            
            if (typeof movementState !== 'undefined') {
                movementState.hasRolledThisTurn = true;
                movementState.isMoving = true;
                movementState.validDestinations = validNextSteps.map(Number);
                movementState.diceRolledValue = diceResult;
            }

            if (validNextSteps.length > 0) {
                renderBoardMapWithHighlights(validNextSteps);
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup("🎲 Movimento", `Rolaste ${diceResult}! Clica numa das casas de destino destacadas no mapa.`, true);
                }
            } else {
                if (typeof movementState !== 'undefined') {
                    movementState.isMoving = false;
                }
                cp.currentZone = Math.min(currentZone + diceResult, BOARD_WAYPOINTS.length);
                renderBoardMap();
                handleWaypointArrival(cp.currentZone);
            }
        });
    }
}

export function onHexClick(waypointId, hexName) {
    const waypoint = BOARD_WAYPOINTS.find(w => w.id === waypointId);
    if (!waypoint) return;

    if (typeof handleWaypointClick === 'function' && typeof movementState !== 'undefined' && movementState.isMoving) {
        handleWaypointClick(waypointId);
        return;
    }

    const cp = (typeof getCurrentPlayer === 'function') ? getCurrentPlayer() : (gameState.players ? gameState.players[gameState.currentPlayerIndex || 0] : null);
    const currentZoneId = cp ? (cp.currentZone || 5) : 5;

    if (currentZoneId === waypointId) {
        handleWaypointArrival(waypointId);
        return;
    }

    if (waypoint.type === 'city') {
        tryInteractWithCity(waypointId, waypoint.name);
        return;
    }
}

export function tryInteractWithCity(waypointId, cityName) {
    const cp = (typeof getCurrentPlayer === 'function') ? getCurrentPlayer() : (gameState.players ? gameState.players[gameState.currentPlayerIndex || 0] : null);
    const currentZoneId = cp ? (cp.currentZone || 5) : 5;

    if (currentZoneId === waypointId) {
        if (typeof openCityModal === 'function') {
            openCityModal(cityName);
        }
        return;
    }

    if (typeof showCustomPopup === 'function') {
        showCustomPopup("Fora de Alcance", `❌ Tens de deslocar o teu peão até ${cityName} para aceder ao Centro Pokémon, Poké Mart ou Ginásio!`, false);
    }
}

export function handleWaypointArrival(waypointId) {
    const waypoint = BOARD_WAYPOINTS.find(w => w.id === waypointId);
    if (!waypoint) return;

    const cp = (typeof getCurrentPlayer === 'function') ? getCurrentPlayer() : gameState.players[gameState.currentPlayerIndex];
    cp.currentZone = waypointId;

    if (typeof appendAdventureLog === 'function') {
        appendAdventureLog(`${cp.name} chegou a ${waypoint.name} (Zona #${waypoint.id}).`);
    }

    if (typeof socket !== 'undefined' && socket && typeof socket.emit === 'function') {
        socket.emit('update_game_state', {
            type: 'player_move',
            gameState: typeof gameState !== 'undefined' ? gameState : null
        });
    }

    if (typeof checkPlayerCellCollision === 'function') {
        checkPlayerCellCollision(waypointId, gameState.currentPlayerIndex || 0);
    }

    if (waypoint.type === 'city') {
        if (typeof openCityModal === 'function') {
            openCityModal(waypoint.name);
        }
    } else if (waypoint.type === 'pokemon') {
        if (typeof boardPokemonCards === 'undefined') {
            window.boardPokemonCards = {};
        }

        // Se a casa ainda não tiver um Pokémon gerado, gera respeitando a cor/tier da casa
        if (!boardPokemonCards[waypointId]) {
            let targetTier = 1;
            const color = String(waypoint.color || 'rosa').toLowerCase();
            if (color === 'verde') targetTier = 2;
            else if (color === 'azul') targetTier = 3;
            else if (color === 'vermelho') targetTier = 4;
            else if (color === 'amarelo') targetTier = 5;

            let tierFiltered = MONSTER_CATALOG.filter(m => Number(m.tier || 1) === targetTier);
            if (tierFiltered.length === 0) tierFiltered = MONSTER_CATALOG;

            const randomMon = tierFiltered[Math.floor(Math.random() * tierFiltered.length)];
            const isShiny = Math.random() < 0.06;
            const minLvl = targetTier === 1 ? 3 : targetTier === 2 ? 8 : targetTier === 3 ? 15 : targetTier === 4 ? 25 : 40;
            const level = Math.floor(Math.random() * 4) + minLvl;
            const maxHp = 20 + (level * 3);

            boardPokemonCards[waypointId] = {
                ...randomMon,
                uniqueId: 'wild_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                level: level,
                tier: targetTier,
                currentHp: maxHp,
                maxHp: maxHp,
                isShiny: isShiny,
                waypointId: waypointId,
                revealed: true,
                weakened: false
            };
        }

        const poke = boardPokemonCards[waypointId];
        if (poke) {
            poke.revealed = true;
            if (typeof dailyFeaturedPokemonConfig !== 'undefined' && poke.id === dailyFeaturedPokemonConfig.pokemonId) {
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup("⭐ POKÉMON DO DIA ENCONTRADO!", `Este é o Anima em destaque de hoje (${dailyFeaturedPokemonConfig.pokemonName})! Ao capturá-lo, receberás o item bónus (${dailyFeaturedPokemonConfig.bonusItemName})!`, true);
                }
            }
            if (typeof openEncounterModalWithPokemon === 'function') {
                openEncounterModalWithPokemon(poke);
            }
        }
    } else if (waypoint.type === 'event') {
        // Dispara o evento aleatório com banner e popup estruturado
        triggerRandomBoardEvent(waypoint.name);
    }
}

export function tryInteractWithWeakenedPokemon(waypointId) {
    const cp = (typeof getCurrentPlayer === 'function') ? getCurrentPlayer() : gameState.player;
    const currentZoneId = cp.currentZone || 5;
    
    if (currentZoneId !== waypointId) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup("Fora de Alcance", "❌ Tens de estar na mesma casa deste Pokémon para poderes interagir!", false);
        }
        return;
    }

    if (typeof boardPokemonCards !== 'undefined' && boardPokemonCards[waypointId]) {
        const poke = boardPokemonCards[waypointId];
        poke.revealed = true;
        if (typeof openEncounterModalWithPokemon === 'function') {
            openEncounterModalWithPokemon(poke);
        }
    }
}

// Função de eventos aleatórios nas casas do tipo 'event'
function triggerRandomBoardEvent(eventName) {
    const cp = getCurrentPlayer();
    if (!cp) return;

    const eventsList = [
        { title: "🎁 Tesouro na Rota!", text: `Encontraste uma algibeira perdida em ${eventName}!\nGanhaste +150 Ouro.`, apply: () => { cp.gold = (cp.gold || 0) + 150; }, success: true },
        { title: "💊 Suprimentos Encontrados!", text: `Um viajante ofereceu-te itens úteis em ${eventName}!\nGanhaste +2 Poções e +1 Poké Ball.`, apply: () => { 
            if (!Array.isArray(cp.inventory)) cp.inventory = [];
            cp.inventory.push({ id: 'potion', name: 'Poção', count: 2, type: 'heal', value: 20 });
            cp.inventory.push({ id: 'ball_poke', name: 'Poké Ball', count: 1, type: 'sphere', value: 1 });
        }, success: true },
        { title: "⚡ Surpresa na Rota!", text: `Uma tempestade inesperada abrandou a tua marcha em ${eventName}.\nOs teus Pokémon descansaram um pouco.`, apply: () => {}, success: false },
        { title: "🍃 Clareza Natural", text: `Recuperaste energias junto à natureza em ${eventName}.\nOs teus Pokémon recuperaram HP.`, apply: () => {
            if (Array.isArray(cp.activeTeam)) {
                cp.activeTeam.forEach(m => {
                    if (m && m.currentHp < m.maxHp) m.currentHp = Math.min(m.maxHp, m.currentHp + 10);
                });
            }
        }, success: true }
    ];

    const randomEvt = eventsList[Math.floor(Math.random() * eventsList.length)];
    randomEvt.apply();
    saveGameProgress();

    if (typeof showCustomPopup === 'function') {
        showCustomPopup(randomEvt.title, randomEvt.text, randomEvt.success);
    }

    const banner = document.getElementById('global-map-notification-banner');
    const bannerText = document.getElementById('global-map-notification-text');
    if (banner && bannerText) {
        bannerText.textContent = `${eventName}: ${randomEvt.title}`;
        banner.classList.remove('hidden');
        setTimeout(() => { banner.classList.add('hidden'); }, 5000);
    }
}

export function renderBoardMap(highlightIds = []) {
    const container = document.getElementById('board-path');
    if (!container) return;

    if (typeof boardPokemonCards === 'undefined') {
        window.boardPokemonCards = {};
    }

    let mapOverlayHtml = '';

    const playersList = (typeof gameState !== 'undefined' && gameState && Array.isArray(gameState.players)) ? gameState.players : ((typeof gameState !== 'undefined' && gameState && gameState.player) ? [gameState.player] : []);
    const activePlayerIndex = (typeof gameState !== 'undefined' && gameState && gameState.currentPlayerIndex !== undefined) ? gameState.currentPlayerIndex : 0;
    
    const cp = playersList.length > 0 ? playersList[activePlayerIndex] || playersList[0] : null;
    const playerBadges = cp && Array.isArray(cp.badges) ? cp.badges : [];

    const cityWaypoints = BOARD_WAYPOINTS.filter(w => w.type === 'city');
    cityWaypoints.forEach(cityWp => {
        let badgeKey = '';
        const nameLower = cityWp.name.toLowerCase();
        if (nameLower.includes('cerulean')) badgeKey = 'cascade';
        else if (nameLower.includes('pewter')) badgeKey = 'boulder';
        else if (nameLower.includes('vermilion')) badgeKey = 'thunder';
        else if (nameLower.includes('celadon')) badgeKey = 'rainbow';
        else if (nameLower.includes('fuchsia')) badgeKey = 'soul';
        else if (nameLower.includes('cinnabar')) badgeKey = 'volcano';

        const hasWonBadge = badgeKey && playerBadges.includes(badgeKey);
        if (hasWonBadge && cityWp.name.toLowerCase() !== 'inicio pallet') return; 

        mapOverlayHtml += `
            <div onclick="tryInteractWithCity(${cityWp.id}, '${cityWp.name}')" class="absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer group" style="top: ${cityWp.top - 4}%; left: ${cityWp.left + 3}%;" title="Ginásio / Cidade de ${cityWp.name}">
                <div class="bg-black/80 border border-amber-400 rounded-full w-5 h-5 flex items-center justify-center shadow-lg hover:scale-125 transition-transform">
                    <span class="text-[9px]">🏛️</span>
                </div>
            </div>
        `;
    });

    BOARD_WAYPOINTS.forEach(wp => {
        if (wp.type === 'pokemon') {
            const pokeCard = boardPokemonCards[wp.id];
            const isFeaturedDaily = pokeCard && (typeof dailyFeaturedPokemonConfig !== 'undefined' && pokeCard.id === dailyFeaturedPokemonConfig.pokemonId);

            if (pokeCard && (pokeCard.revealed || pokeCard.weakened || isFeaturedDaily)) {
                let pokeImg = pokeCard.image || '';
                if (pokeCard.dexNumber) {
                    const paddedDex = String(pokeCard.dexNumber).padStart(3, '0');
                    pokeImg = pokeCard.isShiny ? `${SUPABASE_STORAGE_URL}monsters/shiny/${paddedDex}.png` : `${SUPABASE_STORAGE_URL}monsters/${paddedDex}.png`;
                } else if (pokeCard.isShiny && pokeCard.shinyImage) {
                    pokeImg = pokeCard.shinyImage;
                }

                const featuredClass = isFeaturedDaily ? 'border-amber-400 animate-bounce bg-amber-950/90 shiny-card-glow shadow-[0_0_15px_rgba(255,215,0,0.8)]' : 'border-amber-400 bg-red-950/90 animate-pulse';

                mapOverlayHtml += `
                    <div onclick="tryInteractWithWeakenedPokemon(${wp.id})" class="absolute -translate-x-1/2 -translate-y-1/2 z-30 cursor-pointer group" style="top: ${wp.top - 3}%; left: ${wp.left}%;" title="${pokeCard.name} ${isFeaturedDaily ? '(Pokémon do Dia ⭐)' : ''}">
                        <div class="${featuredClass} border-2 rounded-lg p-1.5 shadow-2xl flex items-center gap-1.5 hover:scale-110 transition-transform">
                            <img src="${pokeImg}" class="w-7 h-7 object-contain" onerror="this.src='https://api.iconify.design/noto:video-game.svg'">
                            <div class="text-left">
                                <p class="text-[9px] font-black text-white leading-none">${pokeCard.name}</p>
                                <span class="text-[8px] font-bold text-amber-300">${isFeaturedDaily ? '⭐ DIA' : '🩹 Nv.' + pokeCard.level}</span>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    });

    BOARD_WAYPOINTS.forEach(wp => {
        const isHighlighted = highlightIds.includes(wp.id);
        if (!isHighlighted) return; 

        mapOverlayHtml += `
            <div onclick="onHexClick(${wp.id}, '${wp.name}')" 
                 class="absolute w-7 h-7 rounded-full -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ring-4 ring-amber-400 bg-amber-500/90 animate-pulse cursor-pointer scale-125 z-40 flex items-center justify-center font-bold text-xs text-black shadow-lg"
                 style="top: ${wp.top}%; left: ${wp.left}%;"
                 title="${wp.name} (ID #${wp.id})">
                 📍
            </div>
        `;
    });

    playersList.forEach((player, idx) => {
        if (!player) return;
        const zoneId = player.currentZone || 5;
        const waypoint = BOARD_WAYPOINTS.find(wp => wp.id === zoneId);
        if (!waypoint) return;

        const avatarId = player.avatarId || 1;
        const isCurrentTurn = idx === activePlayerIndex;

        const offsetLeft = waypoint.left + (idx * 1.2) - 1.5;
        const offsetTop = waypoint.top + (idx * 1.2) - 1.5;

        mapOverlayHtml += `
            <div id="player-token-${idx}" onclick="openSpecificTrainerCardModal(${idx})" class="absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 transition-all duration-500 z-50 cursor-pointer group" style="top: ${offsetTop}%; left: ${offsetLeft}%;" title="${player.name || 'Treinador'}">
                <div class="relative flex flex-col items-center">
                    ${isCurrentTurn ? '<span class="absolute -top-3 bg-amber-400 text-black text-[8px] font-black px-1.5 rounded-full shadow animate-bounce">VEZ</span>' : ''}
                    <img src="${SUPABASE_STORAGE_URL}player_0${avatarId}.png" alt="${player.name || 'Avatar'}" class="w-7 h-7 object-contain ${isCurrentTurn ? 'animate-bounce drop-shadow-[0_0_12px_rgba(255,215,0,0.9)]' : 'opacity-80'} group-hover:scale-125 transition-transform" onerror="this.src='https://api.iconify.design/noto:boy.svg'">
                    <span class="bg-black/80 text-[8px] text-white font-bold px-1 rounded border border-amber-600/60 truncate max-w-[60px]">${(player.name || 'Treinador').split(' ')[0]}</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = `
        <div class="w-full h-full overflow-auto flex justify-center items-center py-4 bg-black/90 relative">
            <div id="global-map-notification-banner" class="absolute top-3 left-1/2 -translate-x-1/2 z-[60] bg-gradient-to-r from-amber-600/90 to-yellow-600/90 text-black px-4 py-1.5 rounded-full font-black text-[10px] shadow-2xl border border-amber-300 hidden animate-bounce">
                📢 <span id="global-map-notification-text">Alerta Global de Captura</span>
            </div>

            <div class="map-container relative" style="background-image: url('${FULL_MAP_IMAGE}');">
                ${mapOverlayHtml}
            </div>
        </div>
    `;

    setupMapChatListeners();
}

function setupMapChatListeners() {
    const sendBtn = document.getElementById('send-chat-btn') || document.getElementById('map-send-chat-btn');
    const chatInput = document.getElementById('chat-input-field') || document.getElementById('map-chat-input');

    if (sendBtn && chatInput && !sendBtn.dataset.listenerAttached) {
        sendBtn.dataset.listenerAttached = "true";
        sendBtn.onclick = () => {
            const text = chatInput.value.trim();
            if (!text) return;
            
            if (typeof socket !== 'undefined' && socket && typeof socket.emit === 'function') {
                socket.emit('room_chat_message', { message: text });
            }

            chatInput.value = '';
        };

        chatInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                sendBtn.click();
            }
        };
    }
}

if (typeof socket !== 'undefined' && socket) {
    socket.off('sync_game_state');
    socket.on('sync_game_state', (data) => {
        if (data && data.gameState && typeof gameState !== 'undefined') {
            Object.assign(gameState, data.gameState);
            if (typeof renderBoardMap === 'function') {
                renderBoardMap();
            }
        }
    });

    socket.off('room_chat_broadcast');
    socket.on('room_chat_broadcast', (data) => {
        const chatBoxes = [
            document.getElementById('chat-messages-box'),
            document.getElementById('lobby-chat-messages')
        ];
        chatBoxes.forEach(box => {
            if (box) {
                box.innerHTML += `<p class="text-[9px] text-amber-300"><strong>[${data.sender}]:</strong> ${data.text}</p>`;
                box.scrollTop = box.scrollHeight;
            }
        });
    });
}

function renderBoardMapWithHighlights(validNextSteps) {
    renderBoardMap(validNextSteps);
}

function moveTokenToWaypoint(waypointId) {
    renderBoardMap();
}

function animateTokenMovement(newPositionIndex) {
    const cp = (typeof getCurrentPlayer === 'function') ? getCurrentPlayer() : gameState.player;
    if (cp) {
        cp.currentZone = newPositionIndex;
    }
    renderBoardMap();
}
// Função de atalho para o módulo do dado (evita erros de importação)
export function moveTokenToWaypoint(waypointId) {
    renderBoardMap();
}

// ==========================================
// EXPOSIÇÃO GLOBAL PARA O HTML
// ==========================================
window.onHexClick = onHexClick;
window.tryInteractWithCity = tryInteractWithCity;
window.tryInteractWithWeakenedPokemon = tryInteractWithWeakenedPokemon;
window.renderBoardMap = renderBoardMap;

