# Poachnomic 3000

Scanner de guildas míticas de World of Warcraft para recrutamento ("poach"). Ele varre as guildas de um ou mais
realms, monta o raid team real de cada uma pelos logs, dá uma nota para cada raider e mostra tudo numa lista com
filtros, horários e contatos.

Uso pessoal, roda só em dev.

## Como rodar

```bash
npm install
cp .env.example .env.local   # e preencha as chaves
npm run dev
```

Abra http://localhost:3000, clique em **Escanear** e escolha os realms.

### Chaves

- **Warcraft Logs** (obrigatória para parses, presença e horários): crie um client em
  https://www.warcraftlogs.com/api/clients. Qualquer nome serve, e a redirect URL pode ser `http://localhost`.
  Copie o *client id* e o *secret* para `WCL_CLIENT_ID` / `WCL_CLIENT_SECRET`.
- **Raider.io** (opcional): `RAIDERIO_API_KEY` aumenta o rate limit.

Os dados ficam em `data/poach.db` (SQLite, fora do git). Apagar o arquivo zera o cache.

## O que ele faz

1. **Descobre o tier atual** no Raider.io (raid, número de bosses, season de M+) e a zone correspondente na WCL.
2. **Lista as guildas** com progresso mítico no escopo escolhido (todos os realms BR ou realms específicos,
   com faixa de progresso).
3. **Monta o raid team pelos logs da guilda na WCL**: quem esteve nas lutas míticas do tier. Isso inclui quem raida
   na guilda vindo de outro realm, sem ser membro. Se a guilda não loga, usa o roster do Raider.io (membros com
   kill mítico no tier).
4. Para cada raider busca **parses** (WCL `zoneRankings`; HPS para healers), **score de M+**, **redes sociais**,
   **main** e **bio** (perfil público do Raider.io).

### Nosso score (0–100)

Média ponderada (pesos ajustáveis na interface) das partes que têm dados:

| Parte | Como é calculada |
| --- | --- |
| Logs | Parse médio (melhor por boss) no mítico do tier, da WCL |
| Progressão | Bosses míticos do tier mortos ÷ total |
| Mítica+ | Score da season convertido pelos percentis do Raider.io (top 0,1% = 100, top 1% = 90, top 10% = 70…) |
| Horário | Quanto do **nosso** horário de raid (configurável) bate com as horas em que o jogador aparece |

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
