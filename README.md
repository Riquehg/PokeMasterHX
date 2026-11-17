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
- **Tabuleiro:** as mesmas 120 casas e coordenadas do seu `map.js`. Casas coloridas = tier **fixo** do Pokémon: Rosa só tier 1, Verde só tier 2, Azul só tier 3, Vermelha só tier 4, Amarela só tier 5 (o Pokémon do Dia também só aparece nas casas do tier dele). O Pokémon revelado **fica na casa** (com o HP que sobrou) até alguém capturar ou derrotar. Casas `?` = eventos (ouro, itens, treinadores, Equipe Rocket, Professor, atalho, tempestade...).
- **Pokédex completa:** os 806 Pokémon (#001–#806, Gen 1–7) com tipos atuais, evoluções e tier. Os 302 das cartas originais mantêm os valores das cartas; os demais vêm de `scripts/data/species.txt` (gerado com `node scripts/build-pokedex.mjs`). Os sprites continuam em `sprites/monsters/NNN.png` e `sprites/monsters/shiny/NNN.png`.
- **Cada Pokémon é único:** natureza + potencial (IV 0–31 em HP/Ataque/Velocidade, até ±8%) + variação do 2º golpe (forte 140%, pesado 170% que erra no 🎲1–2, cobertura de outro tipo ou suporte). Os cards mostram barrinhas de status (cheia = indivíduo perfeito para a espécie/nível), ▲▼ da natureza, estrelas de potencial, XP e os 2 golpes. Pokémon antigos da Coleção recebem valores fixos (derivados do id) na primeira vez que a conta abre.
- **Golpes (2 por Pokémon):** golpe rápido do 1º tipo (nunca erra) + golpe forte do 2º tipo (140%, erra no 🎲1); +20% quando o golpe é do tipo do Pokémon. Pokémon de suporte (Blissey, Togekiss, Gyarados, Arcanine, Amoonguss...) têm Recover, Swords Dance, Intimidate ou Giga Drain. Tabela em `shared/data/moves.js`.
- **Batalha:** rodadas; quem tem mais **Velocidade** (nível × natureza) ataca primeiro. Dano = ataque × 0,7 + 🎲, × efetividade de tipo; 🎲6 = crítico, 🎲1 = golpe fraco. Trocar, usar item, jogar Pokébola e fugir gastam a rodada.
- **Captura:** precisa tirar Rosa 3+, Verde 4+, Azul 5+, Vermelho 6+, Lendário 7+ (shiny +1). Bônus de bola (+1 a +3; bolas temáticas dão +3 contra certos tipos), HP baixo (+1/+2), nível bem maior (+1). 🎲1 sempre falha e o selvagem pode fugir. A tela mostra a **% de chance** de cada bola.
- **Shiny:** raríssimo — 1/450 (1/64 para o Pokémon do Dia; Amuleto Shiny triplica), com celebração em tela cheia. +10% de status, mais XP e pontos.
- **XP e evolução:** quem derruba ganha tudo; quem participou 60%; o resto da equipe 40%; vencer Pokémon muito mais fracos rende pouco. Evolui no nível do catálogo ou com Pedra Evolutiva.
- **Naturezas:** cada Pokémon nasce com uma das 25 naturezas oficiais (Adamant, Modest, Timid...), adaptadas aos 3 atributos do jogo: +10% em Ataque, HP ou Velocidade e −10% em outro (5 neutras). Fica salva na Coleção.
- **Obediência por insígnias:** Pokémon obtidos de tier 3 só lutam com 2 insígnias, tier 4 com 3 e tier 5 com 4 (a regra vale pelo tier em que ele foi obtido; evoluir um Pokémon de tier baixo não trava). O inicial e os trazidos da Coleção sempre obedecem. Os travados aparecem com 🔒 e não podem entrar na batalha.
- **Prêmios de insígnia:** 1ª kit de bolas/poções · 2ª ovo tier 2 · 3ª ovo tier 3 + Ultra Balls · 4ª ovo tier 4 + Rare Candy · 5ª kit de elite · 6ª ovo lendário + Master Ball (tabela em `shared/data/trainers.js` → `BADGE_REWARDS`).
- **Equipe cheia:** com 6 na equipe, capturas e ovos vão direto para o PC (aparece um aviso).
- **Raid lendária (solo ou em grupo):** nas casas de evento Azuis e Vermelhas. Em grupo, cada jogador escolhe 1 Pokémon e todos lutam contra o lendário (HP cresce com o grupo; o chefe atinge vários por rodada). Pokébolas só depois da vitória: cada um tenta capturar com a bola que escolher, na ordem do dano causado (6% + 2% por insígnia + bônus da bola, máx. 35%; Master Ball garante). Vitória dá ouro e Rare Candy a todos.
- **Condições de status:** Queimado, Envenenado, Paralisado, Dormindo e Congelado, aplicados por golpes de Fogo/Veneno/Elétrico/Planta-Fantasma/Gelo. Chips coloridos nas caixas de HP e animações próprias. Full Heal na loja.
- **Missões e Companheiros:** 3 missões fixas por partida (aba 🏅 Metas). Completar dá ouro/itens ou um dos 20 companheiros (salvos em `profiles.stats.companions`), que anda ao lado do peão e dá bônus por tipo, XP, poções ou ouro.
- **Insígnias no mapa:** ícones nas cidades (conquistada / falta / próxima mais perto com distância) e painel de insígnias na aba Metas.
- **Loja de Diamantes (novos):** dados personalizados (Dourado, Cristal, Fogo, Gelo, Galáxia, Pokébola), cenários de batalha (Praia, Caverna, Neve, Vulcão, Floresta à noite, Salão da Liga), cartão de treinador (fundo da ficha e do perfil), efeitos de vitória (fogos, estrelas, corações, Pokébolas, ouro, pétalas) e conveniências de compra única: +50 vagas na Coleção (350) e apelidos para Pokémon. Itens novos do catálogo entram sozinhos na vitrine salva pelo admin (dá para desativar no painel).
- **Eventos relâmpago:** a cada rodada há 40% de chance de surgir (máx. 2 ao mesmo tempo) um ícone numa casa de evento livre: Baú do Tesouro, Raid Relâmpago (casas tier 3+) ou Pokémon Misterioso (silhueta, um tier acima, 8% extra de shiny). Some em 4 rodadas; quem parar na casa ativa. Estado em `state.hotspots`.
- **Sprites dos Pokémon:** o jogo procura primeiro pelo número (`monsters/063.png`, `monsters/shiny/063.png`) e, se não achar, pelo nome (`shinys/abra.png`, `shiny/abra.png`, `monsters/shiny/abra.png`...; nomes com espaço/ponto aceitam `mr-mime`, `mr_mime`, `mrmime`). O formato que funcionar fica lembrado no aparelho. Shiny sem arquivo mostra o sprite normal.
- **Peão:** o fundo do peão segue o cartão de treinador comprado (sem cartão = branco); bordas e molduras continuam iguais.
- **Pokédex:** 806 espécies com progresso por tier, onde aparece, obediência, condições que causa e registro de shiny visto/capturado (salvo em `profiles.stats.shinyDex` / `shinySeen`).
- **Assistir:** botão “👀 Assistir a batalha” mostra golpes e banco de cada lado; ficha do treinador mostra PC e últimas capturas.
- **Eventos especiais (casas Amarelas):** Santuário Lendário (Raid), Ás da Liga (batalha difícil com prêmio grande), Chuva de Estrelas (shiny garantido), Tesouro da Liga, Bênção de Mew e Ovo Ancestral.
- **Lendários:** todos no tier 5 (casas Amarelas). Captura só com 10+ (🎲 + bônus) e 60% de chance de fugir depois de escapar; Raid dá 8%–20% de captura; a 6ª insígnia não dá mais lendário nem Master Ball.
- **Trocas na partida:** Pokémon, itens e ouro entre jogadores (CPUs aceitam só trocas vantajosas). Desligado no Competitivo.
- **Ouro da conta e Mercado Global:** cada partida salva (Treino/Online) rende ouro da conta (ouro final ÷ 10 + 40 por insígnia + bônus de vitória/Campeão, máx. 1200). No 🏪 Mercado Global você anuncia Pokémon da Coleção por ouro e/ou 💎, compra na hora ou faz ofertas (Pokémon + ouro + 💎). Tudo fica em custódia até fechar; taxa de 5% para o vendedor. Vendas de lendários/shinies aparecem no banner global.
- **Modo Coleção e insígnias:** o time trazido da Coleção segue a regra das insígnias pelo tier **atual** da espécie (Dragonite T4 precisa de 3). Se nenhum dos trazidos obedece sem insígnias, o inicial escolhido entra junto.
- **Evolução animada:** silhuetas brancas alternando, flash e a nova forma (como nos jogos); para os outros jogadores aparece um aviso.
- **Comunidade (botão 💬 no canto):** chat global para todos os online (com emojis, sem links, 1 mensagem a cada 2 s), lista de quem está online e amigos (buscar por nome, pedir/aceitar, ver quem está online e entrar na sala do amigo). Banners de shiny/lendário (captura, Raid, ovo) e vendas especiais do Mercado aparecem para todo mundo online.
- **Elos do Competitivo:** Bronze (<950), Prata (950), Ouro (1100), Platina (1250), Diamante (1400), Mestre (1550) e Grão-Mestre (1700+), com painel no Ranking.
- **Abandonar partida:** a CPU assume, a partida some de "Minhas partidas" e as jogadas param de aparecer para quem saiu.
- **PC com a Coleção inteira:** nos modos em que se leva o time (📦 Coleção online e Treino com time), o resto da Coleção vai para o PC da partida — dá para trocar numa cidade, como sempre.
- **⚔️ Torneio (duelo ranqueado):** fila de matchmaking 1x1 (pareia pelo Elo mais próximo). Só batalha, sem tabuleiro: time de até 6 da Coleção (ou os 6 mais fortes), Nv. máx 50, todos obedecem, kit igual (2 Poções, 1 Super Poção, 1 Revive), sem XP. Vitória/derrota mudam o Elo; vencedor ganha 60 de ouro da conta. Sair ou ficar parado 90 s = derrota por W.O. Também dá para criar uma sala "Duelo" para desafiar um amigo.
- **🏟️ Copa:** sala com até 8 treinadores (CPUs completam), chaveamento eliminatório sorteado (passe direto quando o número não é potência de 2), cada confronto é um duelo. Duelos entre humanos valem Elo. Com 4+ humanos: campeão ganha 5 💎 por humano participante e +15 de Elo; vice ganha 2 💎 por humano (regras em `shared/data/cup.js`).
- **App instalável (PWA):** botão "📲 Instalar o app" no menu (Android/PC instala direto; no iPhone mostra o passo a passo do Safari). Ícone próprio, tela cheia e cache dos sprites para economizar dados (`manifest.webmanifest`, `sw.js`, `icons/`).
- **PvP:** caiu na mesma casa de outro treinador → desafie. Quem perde paga 15% do ouro.
- **CPUs:** completam salas e jogam sozinhas; se alguém sai, uma CPU assume. Se alguém fica 90 s parado, os outros podem deixar a CPU jogar a vez dele.
- **Coleção da conta:** todo Pokémon da sua equipe e do PC em partidas salvas na conta (🤖 Treino contra CPUs e 🌐 Online) vai para a Coleção, com nível e evolução atualizados **durante a partida** (a cada captura, fim de batalha, uso do PC ou de itens). A Pokédex da conta também. Limite de 300; ⭐ favoritos e shinies nunca são descartados.
- **Modos de sala online:** ⚖️ **Balanceado** (todos começam com 1 inicial Nv.5), 📦 **Coleção** (cada um leva até 6 Pokémon da Coleção, com nível máximo opcional: 15/25/35/45) e 🏆 **Competitivo** (balanceado, só humanos, sempre com limite de turnos, muda o **rating Elo**; ranking próprio).
- **🤖 Treino contra CPUs:** partida privada que roda no servidor (salva na conta), começando com inicial ou com time da Coleção. É o jeito de "farmar". O **📱 Modo offline** continua existindo, mas não salva na conta (roda só no navegador).
- **Cartas de Evento:** 14 cartas com história curta e recompensa/penalidade (Bolsa Perdida, Mochila de Campista, Árvore de Frutinhas, Treinador na Rota, Emboscada Rocket, Aula do Professor, Grama Agitada, Ovo Misterioso, Tempestade, Nuvem de Zubats, Pedágio do Snorlax, Meowth Ladrão, Atalho Secreto, Achado Raro). Texto e efeitos em `shared/data/events.js`.
- **Animações:** dado 3D (para na face sorteada pelo servidor), peão andando casa a casa, faixa de troca de turno, carta de evento virando, entrada de batalha (Pokémon saindo da grama / tela VS contra treinadores), golpes com investida, dano flutuante, HP descendo, crítico e "super efetivo", desmaio, captura com arremesso da Pokébola e até 3 balançadas. Os turnos das CPUs também são animados. Botão 🎬 alterna normal / rápida / desligada.
- **Avisos globais:** quando alguém captura um **lendário** ou um **shiny** (ou vira Campeão), aparece um banner para todos os jogadores conectados. O admin também pode publicar pop-ups de aviso.
- **CPUs mais competitivas:** escolhem o melhor golpe, trocam de Pokémon por tipo, usam poções na hora certa, X Attack em lutas importantes, montam a equipe com quem obedece, enfraquecem antes de capturar e recusam PvP desfavorável.
- **Loja de Diamantes:** só cosméticos (estilo de captura/aura, moldura do treinador, título). Não altera a força de nada. No tabuleiro, quem tem moldura ganha um halo animado e brilho no chão, o estilo de captura solta partículas em volta do peão e o título aparece numa faixa dourada embaixo do nome. Comprar/equipar atualiza na hora as partidas em andamento. Diamantes por Pix automático (Mercado Pago).
- **Mapa:** proporção real da imagem, zoom (roda do mouse, pinça no celular, botões + − ⤢), arrastar para mover, ◎ centraliza no seu peão; peões e Pokémon têm tamanho fixo na tela em qualquer zoom.
- **Balanceamento:** testado com simulações de partidas só com CPUs (`npm run sim`): todas terminam, ~75% de vitória nos ginásios quando a equipe está no nível, campeão entre os turnos 60 e 100 no modo completo (por isso as salas têm os modos Rápida e Normal).

## 3. Publicar (passo a passo, só pelo navegador)

### 3.1 Supabase
1. Abra o seu projeto em [supabase.com](https://supabase.com) (pode ser o mesmo de hoje — os sprites do Storage continuam iguais).
2. **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique **Run** (rode de novo a cada atualização — ele só adiciona o que falta). Ele cria `profiles`, `matches`, `match_players`, `match_secrets`, `game_config`, as políticas de segurança (RLS) e liga o Realtime. Não mexe na tabela antiga `accounts`.
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
   - `SUPABASE_SERVICE_ROLE_KEY` ← **secreta**, nunca coloque no código. Em projetos novos do Supabase ela se chama **Secret key** (`sb_secret_...`); a pública é a **Publishable key** (`sb_publishable_...`) e vai em `SUPABASE_ANON_KEY`.
3. **Deploy**. A cada commit no GitHub, a Vercel publica sozinha.
4. Pode desligar/apagar o serviço do Render.

### 3.4 Conferir se está tudo certo
> **Erro "Servidor sem as chaves do Supabase"**: falta a chave do servidor na Vercel. Em *Settings → Environment Variables* crie `SUPABASE_SERVICE_ROLE_KEY` com a chave **service_role** (Supabase → Project Settings → API Keys → aba *Legacy API keys*, botão *Reveal*) **ou** a **Secret key** `sb_secret_...`. Marque **Production** (e Preview), salve e vá em *Deployments → ⋯ → Redeploy*. O servidor também aceita os nomes `SUPABASE_SECRET_KEY` e `SUPABASE_KEY` (o do servidor antigo).

Abra **`https://SEU-SITE.vercel.app/api/health`**. Ele mostra se as 3 variáveis estão presentes, se a chave do servidor é mesmo a `service_role`/`secret` (e não a pública) e se as tabelas existem. Se aparecer "Erro interno"/"Problema no servidor" no jogo, é aqui que se descobre o motivo. Depois de mudar variáveis na Vercel, faça **Redeploy**.

### 3.5 Virar administrador e usar o painel
1. Entre no jogo com a sua conta pelo menos uma vez (isso cria o seu perfil).
2. No Supabase, abra **SQL Editor → New query**, cole a linha abaixo trocando o e-mail e clique **Run**:
```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'seu@email.com');
```
3. Recarregue o jogo: aparece o botão vermelho **🛡️ Painel do admin** no menu inicial. Abas:
   - **📢 Avisos** — escreve um pop-up (Aviso, Atenção, Evento ou Novidade) que aparece para todo mundo; dá para pré-visualizar e desativar.
   - **💎 Loja** — itens cosméticos: nome, tipo, valor visual, preço em diamantes, descrição e se está à venda.
   - **💰 Pacotes Pix** — quantos diamantes cada pacote dá, bônus e preço em reais.
   - **🧾 Vendas** — todas as compras, total recebido e um botão para creditar manualmente se algum Pix não cair sozinho.
   - **⭐ Pokémon do Dia** e **👥 Usuários** — dar diamantes, dar Pokémon (vai para a Coleção) e promover outros admins.

### 3.6 Loja de Diamantes com Pix automático (Mercado Pago)
O jogador escolhe um pacote → aparece o QR Code / Pix Copia e Cola → ao pagar, o Mercado Pago avisa o servidor (webhook) → o servidor **confere o pagamento direto na API do Mercado Pago** (valor e status) e credita os diamantes na hora, uma única vez.
1. Crie/entre na sua conta em [mercadopago.com.br](https://www.mercadopago.com.br) e **cadastre uma chave Pix** nela.
2. Acesse [mercadopago.com.br/developers](https://www.mercadopago.com.br/developers) → **Suas integrações → Criar aplicação** (tipo: pagamentos online / Checkout Transparente).
3. Em **Credenciais de produção**, copie o **Access Token** (`APP_USR-...`) e crie na Vercel a variável `MP_ACCESS_TOKEN` (tipo Secret, Production).
4. Na aplicação, abra **Webhooks → Configurar notificações**: URL `https://SEU-SITE.vercel.app/api/mp-webhook`, evento **Pagamentos**. Copie a **assinatura secreta** e crie na Vercel `MP_WEBHOOK_SECRET`.
5. **Redeploy.** Na aba 💰 Pacotes do painel o aviso de "falta configurar" some.
6. Teste primeiro com as **credenciais de teste** (Access Token `TEST-...`) e um usuário de teste do Mercado Pago; depois troque para as de produção.

Custos: o Mercado Pago informa taxa de 0,99% por Pix recebido online (confira a sua conta). Sem mensalidade.

> ⚠️ **Importante sobre cobrar dinheiro:** "Pokémon", os nomes e os sprites são marcas e obras da Nintendo / The Pokémon Company. Jogos de fã costumam ser tolerados enquanto são gratuitos, mas **monetizar (vender diamantes, cosméticos)** é exatamente o que costuma gerar notificações de remoção e processos. Antes de ligar os pagamentos, considere: (1) manter o jogo grátis e aceitar **doações** (sem vender nada dentro do jogo), ou (2) transformar em um jogo próprio, com criaturas, nome e artes originais — o motor, o tabuleiro e a loja já funcionam para isso. Vale conversar com um advogado. Também é preciso emitir nota fiscal/declarar a renda conforme o seu enquadramento (MEI, por exemplo).

### 3.7 Contas antigas (opcional)
As contas da tabela `accounts` não entram automaticamente (as senhas estavam em texto puro). Para migrar e-mail, senha, nome e Pokédex de uma vez, rode no seu computador:
```bash
npm install
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-accounts.mjs
```
Depois disso, **apague a coluna `password`** (ou a tabela `accounts`).

> A Vercel no plano grátis aceita até 12 funções `/api`; o projeto agora usa **12** (o limite). Uma função nova vai exigir juntar duas.

## 4. Rodar e testar no computador (opcional)
```bash
npm test          # 47 testes: regras, tipos, captura, PvP, AFK, salas, permissões, simulações
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
api/*.js                     funções da Vercel: match, action, rooms, profile, leaderboard, admin, config, market
api/_lib/core.js             lógica do backend (salas, jogadas, resultados, admin)
supabase/schema.sql          tabelas + segurança (RLS) + Realtime
scripts/dev-server.mjs       servidor local com banco em memória
tests/                       testes automáticos e simulador
```

**Para mudar regras/balanceamento** mexa só em `shared/` — o mesmo código vale para o local e o online. Exemplos: níveis dos selvagens em `shared/rules/monsters.js` (`WILD_LEVELS`), times dos líderes em `shared/data/trainers.js`, preços em `shared/data/items.js`. Rode `npm test` e `npm run sim` depois.

## 6. Próximos passos sugeridos
- Trocas de Pokémon entre jogadores (o motor já tem a base de "pendências" usada pelo convite de PvP).
- Animação passo a passo dos turnos das CPUs no modo local (hoje elas jogam instantaneamente e o log mostra tudo).
- Sprites que faltarem no Storage — enquanto não existirem, o jogo mostra um selo com as iniciais. Os nomes respeitam maiúsculas e espaços:
  - `sprites/leaders/`: `Brock.png`, `misty.png`, `Lt. Surge.png`, `Erika.png`, `Blaine.png`, `Koga.png` (já existem) + `lorelei.png`, `bruno.png`, `agatha.png`, `lance.png`, `blue.png` (Elite e Campeão).
  - `sprites/trainers/` (treinadores das casas de evento): `youngster.png`, `bugcatcher.png`, `hiker.png`, `swimmer.png`, `psychic.png`, `blackbelt.png`, `birdkeeper.png`, `scientist.png`, `dragontamer.png`, `channeler.png`, `rocket.png`, `acetrainer_m.png`, `acetrainer_f.png`, `veteran.png`.
- Agendar limpeza de partidas antigas (comando pronto no fim do `schema.sql`).
