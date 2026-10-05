# 05 — Roadmap

Marque `[x]` ao concluir. Cada fase termina com algo publicável.

## Fase 0 — Fundação (1 fim de semana)
- [ ] Repositório no GitHub (decidir: público/código aberto recomendado) — `git init` local feito
- [x] Projeto Next.js 16 + TypeScript + Tailwind 4 + pnpm + Vitest (05/10/2026)
- [ ] Projeto Supabase criado, migration `0001_schema_inicial.sql` aplicada — schema revisado; falta criar o projeto
- [ ] Deploy na Vercel com página "em construção" — página pronta, falta o deploy
- [x] `ingest/http.ts` com rate limit, retry, backoff e User-Agent (com testes)
- [ ] Popular `municipios` (SP) a partir da API do IBGE — script e testes prontos; falta rodar contra o Supabase
- [x] `lib/privacidade.ts` (hash de CPF, máscara, CPF dentro de texto) e `lib/format.ts`
- [x] Clientes Supabase público/admin, com lint impedindo o admin no site
- **Pronto quando:** `pnpm test` passa e o site está no ar.

## Fase 1 — Um município de ponta a ponta (1–2 semanas)
- [ ] Tipos do PNCP gerados do OpenAPI
- [ ] Popular `modalidades` a partir da API de domínio
- [ ] Descoberta de órgãos de Campos do Jordão (só esfera municipal)
- [ ] Ingestão de contratações e contratos desde 01/01/2024 (carga inicial + incremental)
- [ ] Página `/municipio/3509700` com totais, contratos recentes, top fornecedores
- [ ] Página `/contrato/[id]` com link para o PNCP
- [ ] Exportar CSV
- **Pronto quando:** os números batem com uma conferência manual de 10 contratos no site do PNCP.

## Fase 2 — Região + primeiros alertas (2–3 semanas)
- [ ] Lista de municípios configurável (`municipios.monitorado = true`)
- [ ] Enriquecimento de fornecedores via BrasilAPI (fila lenta, cache 30 dias)
- [ ] SICONFI: despesa por função, per capita, comparação regional
- [ ] Alertas A01–A07 com testes
- [ ] Página `/fornecedor/[cnpj]`, `/alertas`, `/metodologia`
- [ ] GitHub Actions diário
- **Pronto quando:** revisão manual de todos os alertas gerados para 1 município, com taxa de falso positivo anotada.

## Fase 3 — Execução financeira e cruzamentos (3–4 semanas)
- [ ] Adaptador TCE-SP (empenhos/pagamentos por fornecedor)
- [ ] CEIS/CNEP (arquivo completo)
- [ ] Transferências federais e emendas por município
- [ ] Sócios (QSA) e alertas A08–A11
- [ ] Querido Diário (se houver cobertura dos municípios)

## Fase 4 — Público e confiança
- [ ] Painel admin (Supabase Auth, só administradores) para revisar alertas "relevante"
- [ ] Botão "contestar / direito de resposta" em cada alerta e contrato
- [ ] Assinatura por e-mail de alertas por município (Resend ou similar)
- [ ] Página `/sobre`, política de privacidade, termos
- [ ] Contato com imprensa local e observatório social da região

## Fase 5 — Escala
- [ ] Todos os 644 municípios de SP
- [ ] Comparação de preços por item (A12) e período eleitoral (A13)
- [ ] Segundo estado (novo adaptador de TCE)
- [ ] API pública / dados abertos do próprio projeto
