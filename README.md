# Poachnomic 3000

Encontra raiders míticos em outras guildas de World of Warcraft para recrutamento ("poach"). Ele varre as guildas
dos realms que você escolher, monta o raid team real de cada uma pelos logs, acha também jogadores avulsos que fazem
mítico em pug e dá uma nota para cada um. Tudo aparece numa lista com filtros, horários, histórico e contatos.

## Baixar e instalar

Baixe o instalador do seu sistema na página de
**[Releases](https://github.com/keter45/poachnomic3000/releases/latest)**:

| Sistema | Arquivo |
| --- | --- |
| Windows 10/11 | `Poachnomic-3000-Setup-<versão>.exe` |
| macOS (Apple Silicon: M1, M2…) | `Poachnomic-3000-<versão>-mac-arm64.dmg` |
| macOS (Intel) | `Poachnomic-3000-<versão>-mac-x64.dmg` |
| Linux | `Poachnomic-3000-<versão>-linux-x86_64.AppImage` |

O app ainda não tem assinatura digital paga, então o sistema avisa na primeira vez:

- **Windows**: se aparecer "O Windows protegeu o computador", clique em **Mais informações › Executar assim mesmo**.
  O instalador não pede permissão de administrador e cria um atalho na área de trabalho.
- **macOS**: arraste o app para **Aplicativos**. Na primeira vez, clique com o botão direito no app › **Abrir** ›
  **Abrir**. Se aparecer "está danificado e não pode ser aberto", rode no Terminal e abra de novo:

  ```bash
  xattr -cr "/Applications/Poachnomic 3000.app"
  ```

- **Linux**: dê permissão de execução ao `.AppImage` (botão direito › Propriedades › Permitir executar, ou
  `chmod +x` no terminal) e abra com dois cliques.

### Primeiro uso

Na primeira vez o app abre em **Configurações › Chaves de API** com um passo a passo para conectar a Warcraft Logs.
É grátis e leva uns 2 minutos:

1. Entre na sua conta da [Warcraft Logs](https://www.warcraftlogs.com) (ou crie uma) e abra
   https://www.warcraftlogs.com/api/clients.
2. Clique em **Create Client**. Dê qualquer nome, use `http://localhost` como *Redirect URL* e deixe
   **Public Client desmarcado**.
3. Copie o **Client ID** e o **Client Secret** para o app e clique em **Testar e salvar**.

Depois clique em **Escanear**, escolha os realms e pronto. A chave do Raider.io é opcional.

As chaves e os dados ficam só no seu computador, na pasta de dados do app:

- Windows: `%APPDATA%\Poachnomic 3000`
- macOS: `~/Library/Application Support/Poachnomic 3000`
- Linux: `~/.config/Poachnomic 3000`

Desinstalar o app não apaga essa pasta. Para começar do zero, apague-a.

## Rodar a partir do código

Para quem quer mexer no projeto.

### Pré-requisitos

- **Node.js 22 ou mais novo** ([nodejs.org](https://nodejs.org)). Confira com `node -v`. Com o
  [nvm](https://github.com/nvm-sh/nvm), `nvm use` lê a versão do `.nvmrc`.
- **Git**.

### Instalar e rodar

```bash
git clone https://github.com/keter45/poachnomic3000.git
cd poachnomic3000
npm run setup
npm run dev
```

Abra http://localhost:3000. As chaves podem ser configuradas na própria tela (**Configurações › Chaves de API**),
igual ao app instalado. Quem preferir pode usar o `.env.local` criado pelo `npm run setup`
(`WCL_CLIENT_ID`, `WCL_CLIENT_SECRET`, `RAIDERIO_API_KEY`). A chave salva no app tem prioridade. Em dev, os dados
ficam em `data/poach.db`.

### Gerar o app desktop

| Comando | O que faz |
| --- | --- |
| `npm run app` | Gera o build e abre o app desktop (Electron) localmente |
| `npm run dist` | Gera o instalador do sistema atual em `release/` |
| `npm run icon` | Regera o ícone (`build/icon.png`) |

O app desktop roda o servidor Next (build `standalone`) num processo interno, só em `127.0.0.1`, e guarda os dados
na pasta de dados do usuário.

### Publicar uma versão

1. Atualize o campo `version` no `package.json` e faça o commit.
2. Crie e envie a tag: `git tag v0.2.0 && git push origin v0.2.0`.
3. O workflow **Release** do GitHub Actions gera os instaladores de Windows, macOS e Linux e anexa a um release em
   rascunho.
4. Revise o rascunho em *Releases*, escreva as notas e publique.

### Problemas comuns

| Sintoma | Causa e solução |
| --- | --- |
| "A Warcraft Logs recusou o ID ou o secret" | Copie os dois de novo. Se persistir, o client foi criado como **Public Client**: crie outro com a opção desmarcada. |
| "Esperando a cota da Warcraft Logs" no scan | Normal: a WCL libera 3.600 pontos por hora. O scan continua sozinho quando a cota renova. |
| `npm install` falha no `better-sqlite3` | Node abaixo do 22. Atualize o Node e rode `npm run setup` de novo. |
| Porta 3000 ocupada (dev) | `npm run dev -- -p 3001` e abra http://localhost:3001. |
| O app desktop não abre | O log do servidor interno fica em `logs/server.log`, dentro da pasta de dados do app. |

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

### Contas (vários personagens, um jogador)

A análise olha o **jogador**, não só o personagem. Personagens são agrupados numa conta quando têm o mesmo
usuário do Raider.io (o dono vinculou os personagens ao perfil dele), a mesma BattleTag, o mesmo Discord ou
quando um aponta o outro como main. Para cada conta o app busca no Raider.io a lista completa de personagens.

- Por padrão a lista mostra **uma linha por jogador** (o personagem de maior score), com "+N na conta".
- Progressão mítica e M+ do score usam o **melhor personagem da conta**: um alt na lista não esconde um main 8/8.
- O filtro de classe considera todas as classes que o jogador joga em nível alto.
- O detalhe mostra todos os personagens da conta com ilvl, progressão e M+.

Para agrupar personagens que já estavam no banco antes desta versão, use **Escanear › Atualizar contas** (só
Raider.io, não gasta pontos da WCL).

### Histórico de guildas

Ao abrir o detalhe, o app monta a linha do tempo de guildas do personagem pelos logs da Warcraft Logs (cada report
diz a guilda e a data). Guildas com 3 raids ou mais contam como passagem pela guilda; menos que isso aparece como
avulso (pug). O botão **Incluir os alts da conta** faz o mesmo para os principais alts. Custa uns 3 pontos da WCL
por página de 100 logs e fica em cache por 7 dias. O app também registra a guilda no jogo a cada scan e mostra as
trocas que observou.

O [WowProgress](https://www.wowprogress.com) tem o histórico de entradas e saídas de guilda, mas bloqueia acesso
automatizado com um desafio anti-bot. O app não tenta contornar isso: o detalhe tem um link para abrir a página do
personagem no WowProgress no navegador.

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

Média ponderada (pesos ajustáveis na interface) das partes que têm dados. Progressão e M+ usam o melhor personagem da conta.
No menu lateral, cada métrica tem faixa de mínimo e máximo.

| Parte | Como é calculada |
| --- | --- |
| Logs | Parse médio (melhor por boss) no mítico do tier, da WCL |
| Progressão | Bosses míticos do tier mortos ÷ total |
| Mítica+ | Score da season convertido pelos percentis do Raider.io (top 0,1% = 100, top 1% = 90, top 10% = 70…) |
| Horário | Quanto do **nosso** horário de raid (configurável) bate com as horas em que o jogador aparece |
| Histórico | Tiers anteriores, do mais recente ao mais antigo (pesos 4, 3, 2, 1): CE = 100; senão a fração de bosses míticos no personagem (até 90); AOTC sem mítico = 30 |
| Presença | % das noites míticas logadas da guilda em que ele estava. Pouca presença indica banco ou pouco tempo de jogo |
| Pouco tempo na guilda | Peso baixo por padrão: menos de 1 mês = 100, cai até 0 com 1 ano ou mais (quem chegou há pouco é mais fácil de trazer) |

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
- `src/lib/scanner.ts`: o job de scan (roda dentro do servidor Next).
- `src/lib/keys.ts`: chaves de API salvas no banco local (com o `.env.local` como alternativa).
- `src/lib/candidates.ts`: monta as linhas da lista.
- `src/lib/score.ts`: o score, calculado no cliente para os pesos responderem na hora.
- `src/components/`: a interface (tabela, filtros, detalhe, scan, configurações).
- `electron/main.cjs`: o app desktop, que sobe o servidor e abre a janela.
- `electron-builder.yml` e `.github/workflows/release.yml`: instaladores e release.

Parte dos dados vem de endpoints internos do site do Raider.io (roster, detalhes da guilda e redes sociais). Eles
podem mudar sem aviso. Se quebrarem, o scan segue sem esses campos.
