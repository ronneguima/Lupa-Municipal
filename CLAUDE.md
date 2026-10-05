# CLAUDE.md — Lupa Municipal

> Nome provisório. Troque à vontade (procure e substitua "Lupa Municipal").

## O que é este projeto

Plataforma de **fiscalização e controle social** dos contratos e gastos públicos de municípios brasileiros.
Cada município tem uma página que traduz contratos, licitações, fornecedores e despesas para linguagem simples
e aponta **indícios que merecem atenção** (alertas automáticos), sempre com link para o documento original.

Público: cidadãos, jornalistas locais, vereadores, conselhos municipais, observatórios sociais.
Não é um produto comercial de inteligência de licitações.

MVP: municípios da Serra da Mantiqueira paulista, começando por **Campos do Jordão (IBGE 3509700, confirmado em 04/10/2026)**.
Vizinhos monitorados: São Bento do Sapucaí (3548609) e Santo Antônio do Pinhal (3548203).

@AGENTS.md — o Next.js aqui é a versão 16: leia `node_modules/next/dist/docs/` antes de usar APIs do framework.

## Documentação (leia antes de implementar qualquer coisa)

- `docs/01-visao-produto.md` — o que construir e para quem
- `docs/02-fontes-de-dados.md` — APIs, endpoints, parâmetros, armadilhas
- `docs/03-alertas.md` — catálogo de alertas com a lógica de cada um
- `docs/04-arquitetura.md` — stack, pipeline de ingestão, modelo de dados
- `docs/05-roadmap.md` — fases e critérios de pronto
- `docs/06-prompts-claude-code.md` — prompts prontos por fase
- `docs/07-juridico-e-etica.md` — regras de linguagem, LGPD, direito de resposta
- `supabase/migrations/0001_schema_inicial.sql` — schema inicial

## Stack

- **Frontend/site:** Next.js (App Router) + TypeScript + Tailwind, deploy na Vercel. Páginas de município geradas com ISR (revalidação diária).
- **Banco:** Supabase (Postgres). Leitura pública via RLS; escrita só com service role.
- **Ingestão:** scripts TypeScript em `ingest/` rodando via **GitHub Actions agendado** (não usar Vercel Cron para ingestão longa — limite de tempo de função).
- **Gerenciador de pacotes:** pnpm.
- **Testes:** Vitest. Fixtures JSON reais das APIs em `ingest/__fixtures__/`.

## Regras inegociáveis

1. **Nunca inventar endpoint, parâmetro ou campo de API.** Antes de codar um cliente de API, baixe a especificação
   (ex.: `https://pncp.gov.br/api/consulta/v3/api-docs`) ou faça uma chamada real e salve a resposta como fixture.
   Itens marcados como **[VERIFICAR]** nos docs ainda não foram confirmados.
2. **Alerta é indício, não acusação.** Todo texto exibido ao público segue `docs/07-juridico-e-etica.md`.
   Nunca usar as palavras "fraude", "corrupção", "superfaturamento", "irregular" em alertas automáticos.
3. **Todo dado exibido tem fonte e link.** Cada registro guarda `fonte`, `url_origem` e `coletado_em`.
4. **CPF nunca é armazenado.** Fornecedor pessoa física é identificado por `'pf_' + sha256(cpf + CPF_HASH_SALT)` truncado,
   e exibido com CPF mascarado (`***.456.789-**`), gerado no momento da ingestão. De sócios, só nome, qualificação e data de entrada.
   **Atenção:** MEI traz o CPF dentro da razão social. Todo payload passa por `sanitizarPayload` (`lib/privacidade.ts`)
   antes de ser gravado, inclusive em `raw_registros`.
5. **Ingestão idempotente.** Upsert por chave natural (ex.: `numero_controle_pncp`). Rodar duas vezes não duplica nada.
6. **Respeitar as APIs públicas:** rate limit conservador (padrão 2 req/s por fonte), retry com backoff exponencial em 429/5xx, User-Agent identificando o projeto com e-mail de contato.
7. **Lógica de alerta é código puro e testado:** cada alerta é uma função `(dados) => Alerta[]` em `alerts/`, com teste cobrindo caso positivo, negativo e borda. Limiares ficam na tabela `config_parametros`, não hardcoded.
8. **Valores monetários** em `numeric(18,2)` no banco e formatados em pt-BR na UI (`R$ 1.234,56`). Datas em `America/Sao_Paulo`.

## Convenções

- Código, nomes de tabelas e colunas em **português sem acento** e snake_case no banco (`contratos`, `valor_global`); camelCase no TypeScript.
- Commits pequenos, mensagem em português no imperativo ("adiciona cliente PNCP de contratos").
- Toda tarefa grande: entrar em **plan mode** primeiro, propor o plano, só então implementar.
- Ao terminar uma fase, atualizar o checklist em `docs/05-roadmap.md`.

## Comandos

```bash
pnpm dev                 # site local
pnpm test                # testes (Vitest)
pnpm lint                # ESLint (bloqueia import do cliente admin em app/ e components/)
pnpm typecheck           # next typegen + tsc
pnpm build               # build de produção
pnpm ingest:municipios   # IBGE → municipios, marca os 3 monitorados (precisa de .env.local)
pnpm ingest:pncp -- --municipio 3509700 --desde 2024-01-01            # carga inicial
pnpm ingest:pncp -- --municipio 3509700 --incremental                 # últimos 3 dias (/atualizacao)
pnpm ingest:pncp -- --municipio 3509700 --etapas resultados --limite-resultados 300
#   etapas: contratacoes,contratos,resultados (padrão: todas). Resultados é uma fila: cada execução avança um pedaço.
# a criar:
pnpm ingest:siconfi -- --municipio 3509700 --ano 2025
pnpm alerts:run -- --municipio 3509700
```

## Variáveis de ambiente

Ver `.env.example`.
