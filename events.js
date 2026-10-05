// --- BASE DE DADOS OFICIAL: EVENTOS (HEX Edition) ---
// Ativados ao cair nas casas '!' do tabuleiro.

const EVENT_CATALOG = [
    {
        id: 'alternative_gym',
        name: 'Alternative Gym',
        type: 'gym',
        desc: 'Batalhe contra o seu próximo Líder de Ginásio a partir de onde você estiver no tabuleiro. Escolha um Líder que dê a mesma insígnia[cite: 28].'
    },
    {
        id: 'blocked_route',
        name: 'Blocked Route',
        type: 'pokemon',
        desc: 'Pegue um Pokémon Azul ou mais fraco no seu hexágono gratuitamente (revelado ou não). Se não houver, tente capturar qualquer um ali. Depois, passe a sua próxima vez (bloqueável por Poké Doll)[cite: 28].'
    },
    {
        id: 'chairman_rose',
        name: 'Chairman Rose',
        type: 'pokemon',
        desc: 'Ganhe um Pokémon Azul gratuito tirando o próximo da pilha e adicionando-o à sua equipe[cite: 28].'
    },
    {
        id: 'delibirds_gift',
        name: "Delibird's Gift",
        type: 'pokemon',
        desc: 'Ganhe um Pokémon gratuito da mesma cor do espaço onde ativou o evento (escolha entre os revelados no tabuleiro ou um face-down aleatório)[cite: 28].'
    },
    {
        id: 'duel_dojo',
        name: 'Duel: Dojo',
        type: 'pvp',
        desc: 'Força uma batalha entre você e um oponente escolhido. Tipos específicos ganham +1 ou -1 de força. Vencedor ganha prêmios[cite: 18, 28].'
    },
    {
        id: 'game_corner',
        name: 'Game Corner',
        type: 'pokemon',
        desc: 'Qualquer Pokémon obtido com este evento deve ser totalmente aleatório (face-down no tabuleiro ou fora do jogo)[cite: 28].'
    },
    {
        id: 'gs_ball',
        name: 'GS Ball',
        type: 'pokemon',
        desc: 'Pegue um Pokémon Rosa gratuito da pilha para sua equipe. Ele ganha um token permanente de +1 (como o de melhoria), mas não fica protegido contra trocas[cite: 28].'
    },
    {
        id: 'heavy_storm',
        name: 'Heavy Storm',
        type: 'board',
        desc: 'Remove todos os chips de Pokémon do hexágono atual para a pilha, embaralha e recheia o local com Pokémon face-up[cite: 29].'
    },
    {
        id: 'imposter_oak',
        name: 'Imposter Oak',
        type: 'items',
        desc: 'Você e um oponente escolhido descartam todos os seus itens e compram apenas 2 novos itens. Bloqueável por Poké Doll[cite: 29].'
    },
    {
        id: 'kimono_sisters',
        name: 'Kimono Sisters',
        type: 'pokemon',
        desc: 'Nomeie um Tipo e uma Cor de Pokémon (até o limite da cor do seu espaço atual) e pegue o próximo Pokémon desse tipo na pilha[cite: 29].'
    },
    {
        id: 'legendary_pokemon',
        name: 'Legendary Pokémon',
        type: 'pokemon',
        desc: 'Tente capturar um Pokémon Amarelo (Lendário) aleatório[cite: 16, 29].'
    },
    {
        id: 'jirachis_wish',
        name: "Jirachi's Wish",
        type: 'multi',
        desc: 'Compre 3 Cartas de Evento e atribua-as a 3 jogadores diferentes (você pode se incluir em uma)[cite: 29].'
    },
    {
        id: 'national_park',
        name: 'National Park',
        type: 'continuous',
        desc: 'Evento contínuo de 3 turnos. O jogador com mais capturas neste período ganha um Pokémon Vermelho aleatório[cite: 29].'
    },
    {
        id: 'poke_fans',
        name: 'Poké Fans',
        type: 'trainer',
        desc: 'Troque seu Cartão de Treinador com qualquer oponente e ambos compram 2 itens. Bloqueável por Poké Doll[cite: 29].'
    },
    {
        id: 'pokemaniac',
        name: 'Pokémaniac',
        type: 'pokemon',
        desc: 'Os 3 jogadores com mais capturas ganham respectivamente um Pokémon Azul, Verde e Rosa aleatório e oculto da pilha[cite: 29].'
    },
    {
        id: 'pokemon_day_care',
        name: 'Pokémon Day Care',
        type: 'pokemon',
        desc: 'O jogador com o Pokémon mais fraco (incluindo evoluções) ganha um Pokémon aleatório da cor do espaço atual[cite: 29].'
    },
    {
        id: 'pokemon_egg',
        name: 'Pokémon Egg',
        type: 'pokemon',
        desc: 'Ganhe um Pokémon Rosa gratuito diretamente da pilha para sua equipe[cite: 30].'
    },
    {
        id: 'pokemon_fossil',
        name: 'Pokémon Fossil',
        type: 'pokemon',
        desc: 'Ganhe um Pokémon Verde gratuito diretamente da pilha para sua equipe[cite: 30].'
    },
    {
        id: 'prof_birch',
        name: "Professor Birch",
        type: 'items',
        desc: 'O jogador com menos cartas de item compra itens até igualar o segundo menor, ou ganha vantagem definida por quem ativou[cite: 30].'
    },
    {
        id: 'regional_map',
        name: 'Regional Map',
        type: 'capture',
        desc: 'Tente capturar qualquer Pokémon revelado no tabuleiro, independentemente de onde você esteja[cite: 30].'
    },
    {
        id: 'rocket_bribe',
        name: 'Rocket Bribe',
        type: 'continuous',
        desc: 'Até o seu próximo turno, qualquer Evento que seus oponentes tirarem terá os efeitos copiados para você. Se copiar ao menos um, pule seu próximo turno[cite: 30].'
    },
    {
        id: 'prepare_for_trouble',
        name: 'Prepare for Trouble',
        type: 'continuous',
        desc: 'Evento contínuo de 2 turnos. Todos (exceto quem ativou) só podem andar 1 espaço no tabuleiro, independentemente dos dados[cite: 30].'
    },
    {
        id: 'sketchy_salesman',
        name: 'Sketchy Salesman',
        type: 'pokemon',
        desc: 'Opcional: envie 2 Pokémon da mesma cor para a pilha de descarte e compre 1 Pokémon daquela cor[cite: 30].'
    },
    {
        id: 'ss_anne',
        name: 'S.S. Anne',
        type: 'trade',
        desc: 'Faça uma troca de Pokémon com um oponente (mesma cor). O oponente alvo compra 2 cartas[cite: 30].'
    },
    {
        id: 'team_aqua_strikes',
        name: 'Team Aqua Strikes',
        type: 'items',
        desc: 'Todos os jogadores descartam seus itens e compram a mesma quantidade que descartaram. Bloqueável por Poké Doll[cite: 30].'
    },
    {
        id: 'team_magma_strikes',
        name: 'Team Magma Strikes',
        type: 'trainer',
        desc: 'Todos os jogadores descartam seus Cartões de Treinador e compram outro do monte. Bloqueável por Poké Doll[cite: 30].'
    },
    {
        id: 'team_rocket_strikes',
        name: 'Team Rocket Strikes',
        type: 'items',
        desc: 'Todos compram um item e roubam um item aleatório da mão do jogador à sua direita[cite: 31].'
    },
    {
        id: 'trade',
        name: 'Trade',
        type: 'trade',
        desc: 'Força uma troca de 1 Pokémon por 1 Pokémon de mesma cor com outro jogador. Bloqueável por Poké Doll[cite: 31].'
    }
];