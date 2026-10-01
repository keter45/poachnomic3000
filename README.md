# Poachnomic 3000

Scanner de guildas míticas de World of Warcraft para recrutamento ("poach"). Ele varre as guildas de um ou mais
realms, monta o raid team real de cada uma pelos logs, dá uma nota para cada raider e mostra tudo numa lista com
filtros, horários e contatos.

Uso pessoal, roda só em dev.

## Como rodar

### Pré-requisitos

- **Node.js 22 ou mais novo** ([nodejs.org](https://nodejs.org)). Confira com `node -v`. Com o
  [nvm](https://github.com/nvm-sh/nvm), `nvm use` lê a versão do `.nvmrc`.
- **Git**.
- Uma conta gratuita na [Warcraft Logs](https://www.warcraftlogs.com) para gerar a chave da API.

### 1. Clonar e instalar

```bash
git clone https://github.com/keter45/poachnomic3000.git
cd poachnomic3000
npm run setup
```

O `npm run setup` instala as dependências, confere a versão do Node e cria o `.env.local` a partir do
`.env.example`. O `.env.local` fica fora do git, então suas chaves nunca são commitadas.

### 2. Chave da Warcraft Logs

A WCL é obrigatória para parses, presença no raid, horários e jogadores avulsos. Sem ela o app até abre, mas só
com dados do Raider.io.

1. Entre na sua conta da Warcraft Logs e abra https://www.warcraftlogs.com/api/clients.
2. Clique em **Create Client** e preencha:
   - **Name**: qualquer nome, por exemplo `poachnomic`.
   - **Redirect URLs**: `http://localhost`. O app não usa login, então qualquer URL serve.
   - **Public Client**: deixe **desmarcado**. Cliente público não tem secret e não funciona aqui.
3. Salve. A página mostra o **Client ID** e o **Client Secret**.
4. Abra o `.env.local` na raiz do projeto e cole os dois valores:

   ```
   WCL_CLIENT_ID=9a1b2c3d-...
   WCL_CLIENT_SECRET=abc123...
   ```

   Sem aspas e sem espaços em volta do `=`.

Trate o secret como uma senha: não cole em issues, prints ou chats. Se ele vazar, gere outro na mesma página.

### 3. Chave do Raider.io (opcional)

O Raider.io funciona sem chave. Uma chave (`RAIDERIO_API_KEY`) só aumenta o limite de requisições, o que deixa
scans grandes um pouco mais rápidos. Ela é gerada no painel de aplicações da sua conta do Raider.io. Pode deixar
o campo vazio.

### 4. Rodar

```bash
npm run dev
```

Abra http://localhost:3000, clique em **Escanear**, escolha os realms e inicie. Os personagens aparecem conforme
cada guilda termina. Se você mexer no `.env.local` com o servidor rodando, pare (`Ctrl+C`) e rode `npm run dev` de
novo: as variáveis só são lidas na inicialização.

Os dados ficam em `data/poach.db` (SQLite, fora do git). Apagar a pasta `data/` zera o cache e começa do zero.

### Problemas comuns

| Sintoma | Causa e solução |
| --- | --- |
| Faixa amarela "Falta a chave da Warcraft Logs" | `.env.local` sem `WCL_CLIENT_ID`/`WCL_CLIENT_SECRET`, ou servidor não reiniciado depois de editar. |
| Scan falha com `HTTP 401` / `invalid_client` | ID ou secret errados, ou o client foi criado como **Public Client**. Crie outro com a opção desmarcada. |
| `npm install` falha no `better-sqlite3` | Node abaixo do 22. Atualize o Node e rode `npm run setup` de novo. |
| "Esperando a cota da Warcraft Logs" no scan | Normal: a WCL libera 3.600 pontos por hora. O scan continua sozinho quando a cota renova. |
| Porta 3000 ocupada | `npm run dev -- -p 3001` e abra http://localhost:3001. |

## O que ele faz

1. **Descobre o tier atual** no Raider.io (raid, número de bosses, season de M+) e a zone correspondente na WCL.
2. **Lista as guildas** com progresso mítico no escopo escolhido (todos os realms BR ou realms específicos,
   com faixa de progresso).
3. **Monta o raid team pelos logs da guilda na WCL**: quem esteve nas lutas míticas do tier. Isso inclui quem raida
   na guilda vindo de outro realm, sem ser membro. Se a guilda não loga, usa o roster do Raider.io (membros com
   kill mítico no tier).
4. Para cada raider busca **parses** (WCL `zoneRankings`; HPS para healers), **score de M+**, **redes sociais**,
   **main**, **bio** e **histórico dos tiers anteriores** (perfil público do Raider.io).
5. **Jogadores avulsos** (opcional): quem matou bosses míticos do tier mas não está em nenhum raid team escaneado.
   Vêm de duas fontes: os rankings por boss da WCL nos realms do escopo, que pegam quem loga, inclusive sem guilda,
   e os rosters de guildas só heroicas no Raider.io, que pegam membros com kill mítico em pug.
6. **Importar log por link**: cole o link de um report (público ou não listado) e quem lutou contra bosses nele
   entra como avulso. Útil para pugs postados no Discord.

### Histórico de tiers

Para cada personagem aparecem os 4 últimos raids de tier (da expansão atual e da anterior), com os kills míticos
**naquele personagem** e o AOTC/Cutting Edge **da conta**. Como as conquistas são da conta, um CE com 0/8 no
personagem indica que o jogador fez o raid em outro personagem. O parse de tiers passados não entra no score;
a progressão entra.

### Logs privados

A API da Warcraft Logs não deixa ler logs privados de outras pessoas, nem com login. O login de usuário só libera
os privados que a sua conta já vê. Logs **não listados** podem ser lidos por quem tem o link, por isso a importação
por link funciona com eles.

### Nosso score (0–100)

Média ponderada (pesos ajustáveis na interface) das partes que têm dados:

| Parte | Como é calculada |
| --- | --- |
| Logs | Parse médio (melhor por boss) no mítico do tier, da WCL |
| Progressão | Bosses míticos do tier mortos ÷ total |
| Mítica+ | Score da season convertido pelos percentis do Raider.io (top 0,1% = 100, top 1% = 90, top 10% = 70…) |
| Horário | Quanto do **nosso** horário de raid (configurável) bate com as horas em que o jogador aparece |
| Histórico | Tiers anteriores, do mais recente ao mais antigo (pesos 4, 3, 2, 1): CE = 100; senão a fração de bosses míticos no personagem (até 90); AOTC sem mítico = 30 |

### Estimativas (leia antes de confiar)

- **Horário de raid da guilda**: inferido das horas dos logs míticos. Sem logs, sai dos pulls registrados no
  Raider.io, o que é bem menos preciso. A bio da guilda aparece no detalhe e costuma trazer o horário.
- **Horário do jogador**: horas dos logs em que ele aparece, mais os logouts vistos pelo Raider.io a cada scan.
- **Tempo na guilda**: primeiro boss com a guilda dentro da janela de histórico consultada. Se ele já aparece no
  log mais antigo, mostra "> N meses".
- **Redes sociais**: só o que o próprio jogador publicou no perfil do Raider.io (Discord, Twitch, X, YouTube,
  BattleTag) e @handles achados na bio.

### Cota da Warcraft Logs

A WCL libera 3.600 pontos por hora. Cada personagem custa cerca de 5 pontos (parses) e cada report de guilda cerca
de 2. O primeiro scan de todas as guildas BR pode levar algumas horas: o scanner pausa sozinho quando a cota acaba
e continua depois. Reports antigos ficam em cache para sempre e parses por 24h, então os scans seguintes são
rápidos.

## Estrutura

- `src/lib/raiderio.ts`, `src/lib/wcl.ts`: clientes das APIs, com cache em SQLite e throttle.
- `src/lib/scanner.ts`: o job de scan (roda dentro do `next dev`).
- `src/lib/candidates.ts`: monta as linhas da lista.
- `src/lib/score.ts`: o score, calculado no cliente para os pesos responderem na hora.
- `src/components/`: a interface (tabela, filtros, detalhe, scan, horário).

Parte dos dados vem de endpoints internos do site do Raider.io (roster, detalhes da guilda e redes sociais). Eles
podem mudar sem aviso. Se quebrarem, o scan segue sem esses campos.
