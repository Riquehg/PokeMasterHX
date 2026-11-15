# Pokémon Master Trainer: HEX Edition — v2

Jogo de tabuleiro Pokémon para o navegador, com **multiplayer online de verdade**, modo local (amigos no mesmo aparelho + CPUs), captura, shinies, vantagem de tipos, batalhas contra selvagens, treinadores, 6 ginásios, Elite dos Quatro, Campeão e PvP.

**Stack:** GitHub → **Vercel** (site + funções `/api`) + **Supabase** (login, banco Postgres e tempo real). Não precisa mais do Render.

---

## 1. O que estava errado na versão anterior

| Problema | Efeito no jogo | Como ficou na v2 |
|---|---|---|
| Toda a regra rodava no navegador; o servidor só repassava o estado que o cliente mandava | Um jogador sobrescrevia o estado dos outros; dava para trapacear mudando o `gameState` | **Servidor autoritativo**: cada jogada vai para `/api/action`, o motor valida e **o servidor rola os dados** |
| `currentAuthenticatedAccount` era atualizado só em `window`, nunca no módulo | O jogo não sabia quem era "você" no online e misturava jogadores | Identidade vem do token do Supabase Auth, verificado no servidor |
| Cliente emitia `submit_pvp_action`, mas o servidor não tinha esse evento | PvP nunca sincronizava | PvP com **escolhas simultâneas** resolvidas no servidor |
| Listeners de socket duplicados em 4 arquivos (`socket.js`, `lobby.js`, `battle-arena.js`, `storage.js`) | Um sobrescrevia o outro; eventos sumiam | Uma única sessão (`js/session.js`) |
| Tipos do catálogo com acento ("Água", "Elétrico", "Psíquico", "Sombrio") x tabela sem acento e sem Sombrio/Fada | Vantagem de tipo quase nunca era aplicada | Tabela oficial de **18 tipos**; tipo duplo **multiplica** (x4, x2, x0,5, x0,25, x0) |
| `calculatePokemonStats` ignorava HP/Força do catálogo (só usava o tier) | Caterpie e Machop eram idênticos | Status = espécie + nível (+10% se shiny) |
| Pokébola inicial com id `ball_poke`, catálogo com `poke_ball` | Pokébola inicial "sem dados" | Itens com ids únicos e efeitos implementados de verdade |
| Senhas salvas em texto puro na tabela `accounts` | Risco grave de vazamento | **Supabase Auth** (senha com hash, recuperação por e-mail) |
| Painel admin com senha `admin123` no próprio JS; servidor aceitava `delete_account`/`give_gold` de qualquer um | Qualquer visitante podia apagar contas | Admin = `profiles.is_admin`, checado no servidor; nada de senha no front |
| Salas só na memória do Render (free hiberna) | 30–60 s de espera e salas perdidas em cada reinício | Salas e partidas no Postgres; servidor sem estado (Vercel) |
| Duas cópias do jogo (`engine.js` de 5,5 mil linhas na raiz + `src/`) | Confusão sobre o que estava em uso | Uma base só, organizada |

## 2. Como o jogo funciona agora

- **Objetivo:** 6 insígnias → Elite dos Quatro (4 lutas seguidas na Liga Pokémon) → Campeão na Arena Final. Com limite de turnos (Rápida 30 / Normal 60), vence quem tiver mais pontos.
- **Tabuleiro:** as mesmas 120 casas e coordenadas do seu `map.js`. Casas coloridas = tier do Pokémon (Rosa → Verde → Azul → Vermelha → Amarela/lendários). O Pokémon revelado **fica na casa** (com o HP que sobrou) até alguém capturar ou derrotar. Casas `?` = eventos (ouro, itens, treinadores, Equipe Rocket, Professor, atalho, tempestade...).
- **Batalha:** rodadas; quem tem nível maior ataca primeiro. Dano = ataque × 0,7 + 🎲, × efetividade de tipo; 🎲6 = crítico, 🎲1 = golpe fraco. Trocar, usar item, jogar Pokébola e fugir gastam a rodada.
- **Captura:** precisa tirar Rosa 3+, Verde 4+, Azul 5+, Vermelho 6+, Lendário 7+ (shiny +1). Bônus de bola (+1 a +3; bolas temáticas dão +3 contra certos tipos), HP baixo (+1/+2), nível bem maior (+1). 🎲1 sempre falha e o selvagem pode fugir. A tela mostra a **% de chance** de cada bola.
- **Shiny:** 1/40 (1/8 para o Pokémon do Dia; Amuleto Shiny triplica). +10% de status, mais XP e pontos.
- **XP e evolução:** quem derruba ganha tudo; quem participou 60%; o resto da equipe 40%; vencer Pokémon muito mais fracos rende pouco. Evolui no nível do catálogo ou com Pedra Evolutiva.
- **PvP:** caiu na mesma casa de outro treinador → desafie. Quem perde paga 15% do ouro.
- **CPUs:** completam salas e jogam sozinhas; se alguém sai, uma CPU assume. Se alguém fica 90 s parado, os outros podem deixar a CPU jogar a vez dele.
- **Cofre e Pokédex:** ao fim de cada partida online o servidor grava sua Pokédex, estatísticas, pontos do ranking e o seu melhor Pokémon no Cofre (dá para levar 1 deles, no nível 10, para a próxima partida).
- **Balanceamento:** testado com simulações de partidas só com CPUs (`npm run sim`): todas terminam, ~75% de vitória nos ginásios quando a equipe está no nível, campeão entre os turnos 60 e 100 no modo completo (por isso as salas têm os modos Rápida e Normal).

## 3. Publicar (passo a passo, só pelo navegador)

### 3.1 Supabase
1. Abra o seu projeto em [supabase.com](https://supabase.com) (pode ser o mesmo de hoje — os sprites do Storage continuam iguais).
2. **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique **Run**. Ele cria `profiles`, `matches`, `match_players`, `match_secrets`, `game_config`, as políticas de segurança (RLS) e liga o Realtime. Não mexe na tabela antiga `accounts`.
3. **Authentication → Providers → Email**: deixe ativo. Para facilitar no começo, você pode desligar **Confirm email** (senão cada jogador precisa clicar no link do e-mail antes de entrar).
4. **Authentication → URL Configuration**: em *Site URL* coloque o endereço da Vercel (ex.: `https://pokemasterhx.vercel.app`).
5. **Project Settings → API**: copie *Project URL*, a chave **anon public** e a chave **service_role**.

### 3.2 GitHub (web)
1. No seu repositório, apague os arquivos antigos: `engine.js`, `dice.js`, `events.js`, `items.js`, `map.js`, `cards-data.js`, `server.js`, `electron-main.js`, `style.css`, `index.html`, a pasta `src/` e `package-lock.json`.
2. **Add file → Upload files** e arraste **o conteúdo** desta pasta (as pastas `api`, `css`, `js`, `shared`, `supabase`, `scripts`, `tests` e os arquivos da raiz). Commit.

### 3.3 Vercel
1. **Add New → Project**, importe o repositório. *Framework Preset*: **Other**. Não precisa de build command.
2. Em **Environment Variables** adicione (veja `.env.example`):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` ← **secreta**, nunca coloque no código
3. **Deploy**. A cada commit no GitHub, a Vercel publica sozinha.
4. Pode desligar/apagar o serviço do Render.

### 3.4 Virar administrador
Cadastre-se no jogo e rode no SQL Editor (trocando o e-mail):
```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'seu@email.com');
```
O botão **🛡️ Painel do admin** aparece no hub (Pokémon do Dia, dar Pokémon para o Cofre de alguém, promover admins).

### 3.5 Contas antigas (opcional)
As contas da tabela `accounts` não entram automaticamente (as senhas estavam em texto puro). Para migrar e-mail, senha, nome e Pokédex de uma vez, rode no seu computador:
```bash
npm install
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-accounts.mjs
```
Depois disso, **apague a coluna `password`** (ou a tabela `accounts`).

## 4. Rodar e testar no computador (opcional)
```bash
npm test          # 30 testes: regras, tipos, captura, PvP, AFK, salas, permissões, simulações
npm run sim       # 20 partidas só com CPUs, mostra o balanceamento
npm run dev       # http://localhost:3000 com banco em memória e login livre (abra 2 abas para testar o online)
```

## 5. Estrutura
```
index.html, css/app.css      interface (sem Tailwind CDN: funciona offline)
js/main.js                   navegação entre telas
js/api.js                    login (Supabase Auth), chamadas /api, tempo real
js/session.js                LocalSession (motor no navegador) e OnlineSession (servidor)
js/ui/*.js                   telas: login/hub/lobby/sala, tabuleiro, batalha, loja, PC, mochila, Pokédex
shared/engine.js             MOTOR DE REGRAS (puro, roda igual no navegador e no servidor)
shared/rules/*.js            tipos, status/XP, batalha, movimento, RNG determinístico
shared/data/*.js             302 Pokémon, 120 casas, itens, ginásios/Elite/Campeão
shared/bots.js               IA das CPUs
api/*.js                     funções da Vercel: match, action, rooms, profile, leaderboard, admin, config
api/_lib/core.js             lógica do backend (salas, jogadas, resultados, admin)
supabase/schema.sql          tabelas + segurança (RLS) + Realtime
scripts/dev-server.mjs       servidor local com banco em memória
tests/                       testes automáticos e simulador
```

**Para mudar regras/balanceamento** mexa só em `shared/` — o mesmo código vale para o local e o online. Exemplos: níveis dos selvagens em `shared/rules/monsters.js` (`WILD_LEVELS`), times dos líderes em `shared/data/trainers.js`, preços em `shared/data/items.js`. Rode `npm test` e `npm run sim` depois.

## 6. Próximos passos sugeridos
- Trocas de Pokémon entre jogadores (o motor já tem a base de "pendências" usada pelo convite de PvP).
- Animação passo a passo dos turnos das CPUs no modo local (hoje elas jogam instantaneamente e o log mostra tudo).
- Sprites que faltarem no Storage (líderes em `sprites/leaders/`, insígnias em `sprites/badges/`, itens novos) — enquanto não existirem, o jogo mostra um selo com as iniciais.
- Agendar limpeza de partidas antigas (comando pronto no fim do `schema.sql`).
