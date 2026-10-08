// --- src/systems/dice.js ---
// Módulo de Rolagem de Dados e Animações Visuais

// Executa a rolagem de um dado tradicional de 6 faces (1 a 6) com animação visual
export function rollDiceWithAnimation(callback) {
    const diceContainer = document.getElementById('dice-display-container') || document.getElementById('dice-container');
    
    // Efeito visual de animação de embaralhamento antes de revelar o resultado
    let counter = 0;
    const interval = setInterval(() => {
        const randomTempVal = Math.floor(Math.random() * 6) + 1;
        if (diceContainer) {
            diceContainer.innerHTML = getDiceFaceHtml(randomTempVal, true);
        }
        counter++;
        if (counter > 10) {
            clearInterval(interval);
            const finalResult = Math.floor(Math.random() * 6) + 1;
            if (diceContainer) {
                diceContainer.innerHTML = getDiceFaceHtml(finalResult, false);
            }
            if (typeof callback === 'function') {
                callback(finalResult);
            }
        }
    }, 50);
}

// Retorna a representação HTML visual da face do dado
function getDiceFaceHtml(value, isRolling = false) {
    const rollingClass = isRolling ? 'animate-spin scale-110 text-amber-300' : 'text-white scale-100';
    let diceIcon = '⚀';
    if (value === 2) diceIcon = '⚁';
    if (value === 3) diceIcon = '⚂';
    if (value === 4) diceIcon = '⚃';
    if (value === 5) diceIcon = '⚄';
    if (value === 6) diceIcon = '⚅';

    return `
        <div class="flex flex-col items-center justify-center p-2 bg-black/60 border-2 border-amber-500/80 rounded-xl shadow-xl transition-transform ${rollingClass}">
            <span class="text-3xl">${diceIcon}</span>
            <span class="text-[10px] font-black mt-1 text-amber-400">Resultado: ${value}</span>
        </div>
    `;
}

// Vincula os ouvintes de clique ao botão de rolar dado na interface do HUD
export function setupDiceListeners() {
    const rollBtn = document.getElementById('roll-dice-btn');
    if (rollBtn && !rollBtn.dataset.listenerAttached) {
        rollBtn.dataset.listenerAttached = "true";
        rollBtn.onclick = () => {
            // Importa dinamicamente ou chama a função de movimento do mapa
            import('./map.js').then(mapModule => {
                if (typeof mapModule.rollDiceForMovement === 'function') {
                    mapModule.rollDiceForMovement();
                }
            }).catch(err => {
                console.error("Erro ao carregar o módulo de mapa para o dado:", err);
            });
        };
    }
}