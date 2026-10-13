// --- SISTEMA DE CLIMA E TERRENO DINÂMICO ---

export const weatherState = {
    currentWeather: 'normal', // 'normal', 'rain', 'sunny', 'sandstorm', 'fog'
    globalRoundsCount: 0,
    weatherConfigs: {
        normal: { name: 'Normal', icon: '🌤️', desc: 'Clima estável em todas as rotas.' },
        rain: { name: 'Chuva Intensa', icon: '🌧️', desc: 'Tipos Água ganham poder; Fogo enfraquece.' },
        sunny: { name: 'Sol Radiante', icon: '☀️', desc: 'Tipos Fogo ganham poder; Água enfraquece.' },
        sandstorm: { name: 'Tempestade de Areia', icon: '🏜️', desc: 'Precisão reduzida, bónus para Terra/Rocha.' },
        fog: { name: 'Nevoeiro Espesso', icon: '🌫️', desc: 'Visibilidade reduzida no tabuleiro.' }
    }
};

// Altera o clima ciclicamente ou de forma aleatória a cada X rondas globais
export function advanceGlobalWeather() {
    weatherState.globalRoundsCount++;
    
    // A cada 3 rondas completas, o clima muda
    if (weatherState.globalRoundsCount % 3 === 0) {
        const types = ['normal', 'rain', 'sunny', 'sandstorm', 'fog'];
        // Evita repetir o mesmo clima consecutivamente se possível
        const filteredTypes = types.filter(t => t !== weatherState.currentWeather);
        const randomType = filteredTypes[Math.floor(Math.random() * filteredTypes.length)];
        
        weatherState.currentWeather = randomType;
        
        if (typeof window.showCustomPopup === 'function') {
            const config = weatherState.weatherConfigs[randomType];
            window.showCustomPopup("Mudança de Clima Global!", `${config.icon} O clima mudou para: **${config.name}**!\n\n${config.desc}`, true);
        }
        
        updateBoardWeatherUI();
    }
}

// Aplica modificadores dinâmicos ao poder de combate com base no clima atual
export function applyWeatherCombatModifier(attacker, basePower) {
    if (!attacker || !attacker.type) return basePower;
    
    const pokeType = String(attacker.type).toLowerCase();
    let modifiedPower = basePower;
    
    if (weatherState.currentWeather === 'rain') {
        if (pokeType.includes('agua') || pokeType.includes('water')) modifiedPower += 3;
        if (pokeType.includes('fogo') || pokeType.includes('fire')) modifiedPower -= 3;
    } else if (weatherState.currentWeather === 'sunny') {
        if (pokeType.includes('fogo') || pokeType.includes('fire')) modifiedPower += 3;
        if (pokeType.includes('agua') || pokeType.includes('water')) modifiedPower -= 3;
    } else if (weatherState.currentWeather === 'sandstorm') {
        if (pokeType.includes('terra') || pokeType.includes('rocha') || pokeType.includes('ground') || pokeType.includes('rock')) {
            modifiedPower += 2;
        } else {
            modifiedPower -= 1; // Penalidade leve para outros tipos
        }
    }
    
    return Math.max(1, modifiedPower);
}

// Renderiza o overlay visual dinâmico diretamente sobre o contentor do tabuleiro
export function updateBoardWeatherUI() {
    const boardContainer = document.getElementById('board-container') || document.body;
    let overlay = document.getElementById('board-weather-overlay');
    let badge = document.getElementById('weather-widget-badge');
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'board-weather-overlay';
        boardContainer.style.position = 'relative'; // Garante posicionamento correto
        boardContainer.appendChild(overlay);
    }
    
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'weather-widget-badge';
        badge.className = 'weather-widget-badge';
        boardContainer.appendChild(badge);
    }
    
    // Remove classes antigas de clima
    overlay.className = 'absolute inset-0 pointer-events-none z-40 overflow-hidden rounded-inherit';
    
    if (weatherState.currentWeather !== 'normal') {
        overlay.classList.add(`weather-${weatherState.currentWeather}`);
        overlay.style.display = 'block';
    } else {
        overlay.style.display = 'none';
    }
    
    const currentConfig = weatherState.weatherConfigs[weatherState.currentWeather];
    badge.innerHTML = `<span>${currentConfig.icon}</span> <span>${currentConfig.name}</span>`;
}
