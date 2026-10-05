# 04 — Arquitetura

## Visão geral

```
APIs públicas (PNCP, SICONFI, TCE-SP, BrasilAPI, CGU, Querido Diário)
        │
        ▼
GitHub Actions (cron diário 03:15 BRT)  ──►  ingest/*.ts  ──►  Supabase Postgres
                                                  │              (tabelas brutas + normalizadas)
                                                  ▼
                                          alerts/*.ts  ──►  tabela alertas
                                                  │
                                                  ▼
                              Next.js na Vercel (ISR, revalida 24h + on-demand após ingestão)
```

## Estrutura de pastas

```
lupa-municipal/
├── app/                      # Next.js App Router
│   ├── municipio/[ibge]/
│   ├── contrato/[id]/
│   ├── fornecedor/[cnpj]/
│   ├── alertas/
│   ├── metodologia/
│   └── api/revalidate/       # revalidação on-demand chamada pelo job de ingestão
├── components/
├── lib/
│   ├── supabase/             # clientes (anon no site, service role só no ingest)
│   ├── format.ts             # moeda, datas, CNPJ/CPF mascarado
│   └── textos-alertas.ts     # templates de texto público
├── ingest/
│   ├── http.ts               # fetch com rate limit, retry, backoff, User-Agent
│   ├── pncp/
│   │   ├── client.ts         # cliente tipado (tipos gerados do OpenAPI)
│   │   ├── orgaos.ts         # descoberta de órgãos por município
│   │   ├── contratacoes.ts
│   │   └── contratos.ts
│   ├── siconfi.ts
│   ├── fornecedores.ts       # BrasilAPI com cache
│   ├── sancoes.ts
│   ├── tce/sp.ts
│   ├── run.ts                # CLI: pnpm ingest:<fonte> -- --municipio ...
│   └── __fixtures__/         # respostas reais salvas para testes
├── alerts/
│   ├── types.ts
│   ├── a01-contratacao-direta.ts
│   ├── ...
│   └── run.ts
├── supabase/migrations/
├── .github/workflows/ingest.yml
└── docs/
```

## Pipeline de ingestão

1. **Bruto primeiro:** cada resposta de API é gravada como JSON em `raw_registros` (fonte, chave, payload jsonb, hash, coletado_em).
   Se o hash não mudou, pula. Permite reprocessar sem chamar a API de novo.
2. **Normalização:** de `raw_registros` para tabelas tipadas (`contratacoes`, `contratos`, `fornecedores`...) via upsert por chave natural.
3. **Enriquecimento:** novos CNPJs de fornecedor entram numa fila (`fornecedores.status_enriquecimento = 'pendente'`) consumida em ritmo lento.
4. **Alertas:** recalculados para os registros alterados na execução. Alerta que deixou de valer → `status = 'expirado'` (nunca apagar).
5. **Log:** cada execução grava em `ingestao_execucoes` (fonte, município, início, fim, registros novos/alterados, erros).
6. **Revalidação:** ao final, chama `/api/revalidate` com secret para atualizar as páginas afetadas.

## Tipos das APIs

Gerar tipos TypeScript a partir do OpenAPI do PNCP com `openapi-typescript`:
```bash
pnpm dlx openapi-typescript https://pncp.gov.br/api/consulta/v3/api-docs -o ingest/pncp/schema.d.ts
```
Validar respostas em runtime com `zod` nos campos que usamos (APIs públicas mudam sem aviso).

## Supabase

- Plano gratuito tem 500 MB — suficiente para a região. Guardar `raw_registros` por 90 dias e depois descartar os que já foram normalizados.
- RLS: `select` liberado para `anon` nas tabelas públicas; nenhuma escrita via `anon`. Ingestão usa `SUPABASE_SERVICE_ROLE_KEY` **só** no GitHub Actions (secret), nunca no front.
- Extensões: `pg_trgm` (similaridade de objetos e nomes), `unaccent`.
- Views materializadas para os painéis (`mv_resumo_municipio`, `mv_top_fornecedores`) atualizadas ao final da ingestão.

## GitHub Actions

- `ingest.yml`: cron `15 6 * * *` (UTC = 03:15 BRT), timeout 120 min, `workflow_dispatch` com inputs (fonte, município, desde) para cargas manuais.
- Matriz por município quando passar de ~10 municípios.
- Falha → abrir issue automática ou notificar por e-mail.

## Custos estimados (MVP regional)

Vercel Hobby (grátis) + Supabase Free + GitHub Actions (2.000 min/mês grátis em repo privado; ilimitado em repo público).
Domínio ~R$ 40/ano. Se for código aberto, Actions sai de graça.
