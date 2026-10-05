# 06 — Prompts para o Claude Code

Cole um por vez. Espere terminar, revise, faça commit, e só então siga para o próximo.
Para tarefas grandes, aperte **Shift+Tab** até entrar em *plan mode* antes de colar — o Claude propõe o plano e você aprova.

---

## Fase 0

### 0.1 — Projeto base
```
Leia CLAUDE.md e todos os arquivos em docs/. Depois crie o projeto base seguindo docs/04-arquitetura.md:
Next.js (App Router) + TypeScript + Tailwind + pnpm + Vitest, com a estrutura de pastas descrita.
Não implemente ingestão ainda. Crie uma home simples "Lupa Municipal — em construção".
Configure lint, formatação e o script `pnpm test`. Ao final, me diga os comandos para rodar.
```

### 0.2 — Supabase
```
Revise supabase/migrations/0001_schema_inicial.sql contra docs/02 e docs/03 e me aponte problemas antes de aplicar.
Depois, crie lib/supabase/ com dois clientes: um público (anon, para o site) e um admin (service role, só para ingest/).
Garanta que o cliente admin nunca possa ser importado por código em app/.
```

### 0.3 — HTTP resiliente
```
Implemente ingest/http.ts conforme a regra 6 do CLAUDE.md: rate limit por host (padrão 2 req/s, configurável),
retry com backoff exponencial e jitter em 429/5xx/erros de rede (máx. 5 tentativas), timeout de 30s,
User-Agent "LupaMunicipal/0.1 (+contato: <e-mail do .env>)", e tratamento de HTTP 204 como resposta vazia.
Escreva testes com fetch mockado.
```

### 0.4 — Municípios
```
Crie o script ingest/municipios.ts que busca a lista de municípios de SP na API do IBGE
(https://servicodados.ibge.gov.br/api/v1/localidades/estados/35/municipios), faz upsert na tabela municipios,
e marca como monitorado=true Campos do Jordão, São Bento do Sapucaí e Santo Antônio do Pinhal.
Confirme o código IBGE de Campos do Jordão (esperado 3509700) e me diga os três códigos.
```

---

## Fase 1

### 1.1 — Reconhecimento da API (faça isso antes de codar o cliente)
```
Antes de escrever o cliente do PNCP: baixe https://pncp.gov.br/api/consulta/v3/api-docs, gere os tipos com openapi-typescript
em ingest/pncp/schema.d.ts, e faça chamadas reais para Campos do Jordão em /v1/contratacoes/publicacao
(dataInicial=20250101, dataFinal=20250131, uma chamada por modalidade de 1 a 13, codigoMunicipioIbge=<código>, pagina=1).
Salve uma resposta de cada tipo em ingest/__fixtures__/. Depois me mostre:
- quais modalidades retornaram dados e quantos registros
- os CNPJs de órgãos encontrados, com razão social e esferaId
- todos os itens marcados [VERIFICAR] em docs/02 que você conseguiu confirmar ou desmentir.
Atualize docs/02 com o que descobrir.
```

### 1.2 — Ingestão PNCP
```
Implemente a ingestão do PNCP seguindo docs/02 (seção "Estratégia por município") e docs/04 (pipeline):
raw_registros primeiro, depois normalização com upsert idempotente em orgaos, contratacoes, contratos e fornecedores (só CNPJ e nome por ora).
CLI: pnpm ingest:pncp -- --municipio 3509700 --desde 2024-01-01 [--incremental].
Quebre períodos em blocos mensais. Registre a execução em ingestao_execucoes.
Testes com as fixtures. Rode para Campos do Jordão e me dê o resumo (órgãos, contratações, contratos, valor total).
```

### 1.3 — Páginas do município e do contrato
```
Leia a skill de design de frontend se disponível. Crie /municipio/[ibge] e /contrato/[id] conforme docs/01.
Visual sóbrio, jornalístico, legível no celular; números grandes e claros; toda informação com "Fonte: PNCP" e link.
Mostre no topo do município: "N contratos publicados no PNCP desde jan/2024 — dados atualizados em <data>".
ISR com revalidate de 24h. Inclua exportação CSV dos contratos.
```

### 1.4 — Conferência
```
Escolha 10 contratos aleatórios de Campos do Jordão no banco e gere uma tabela com os links do PNCP
para eu conferir manualmente valores, fornecedor e datas. Liste qualquer inconsistência que você mesmo encontrar.
```

---

## Fase 2

### 2.1 — Fornecedores
```
Implemente ingest/fornecedores.ts: fila de CNPJs pendentes, consulta à BrasilAPI (1 req/s), cache de 30 dias,
gravando data de abertura, capital social, CNAEs, situação cadastral, município/UF e sócios (só nome, qualificação, data de entrada — sem CPF).
Primeiro faça uma chamada real e salve a fixture para confirmar os campos.
```

### 2.2 — SICONFI
```
Faça o reconhecimento da API do SICONFI (docs/02 seção 2, itens [VERIFICAR]) com chamadas reais para Campos do Jordão,
salve fixtures, e implemente a ingestão da DCA (despesa por função) dos últimos 3 anos e população.
Na página do município, adicione "Gastos por área" com valor per capita comparado à mediana dos municípios monitorados.
```

### 2.3 — Alertas
```
Implemente o motor de alertas e os alertas A01 a A07 de docs/03-alertas.md, um arquivo por alerta em alerts/,
cada um como função pura com testes (positivo, negativo, borda). Limiares lidos de config_parametros.
Textos públicos em lib/textos-alertas.ts seguindo docs/07 — revise cada texto contra a lista de palavras proibidas.
Rode para os municípios monitorados e me entregue um relatório com cada alerta gerado e o link do contrato, para eu revisar.
```

### 2.4 — Páginas de alertas, fornecedor e metodologia
```
Crie /alertas, /fornecedor/[cnpj] e /metodologia. A metodologia é gerada a partir de docs/03 e dos valores atuais
de config_parametros, para nunca ficar desatualizada. Cada alerta exibido tem "Por que isso aparece?" e link para a metodologia.
```

### 2.5 — Automação
```
Crie .github/workflows/ingest.yml conforme docs/04: cron diário, workflow_dispatch com inputs, timeout, secrets do Supabase,
execução de ingestão → alertas → refresh das views materializadas → chamada a /api/revalidate.
Me diga quais secrets eu preciso cadastrar no GitHub.
```

---

## Prompts úteis a qualquer momento

```
Revise o código desta fase procurando: CPF exposto, escrita com cliente anon, alerta disparado com dado nulo,
texto público com palavra proibida (docs/07), chamada de API sem rate limit. Liste e corrija.
```

```
Atualize docs/05-roadmap.md marcando o que foi concluído e anote em docs/02 qualquer descoberta sobre as APIs.
```
