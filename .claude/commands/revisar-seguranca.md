---
description: Revisão de privacidade, linguagem e robustez antes de commit/deploy
---

Revise as mudanças ainda não commitadas (ou o diretório $ARGUMENTS, se informado) procurando:

- CPF armazenado, logado ou exibido sem máscara; CPF de sócio em qualquer lugar
- `SUPABASE_SERVICE_ROLE_KEY` ou cliente admin importável a partir de `app/`
- Escrita no banco com o cliente anon
- Alerta que pode disparar com valor nulo/zerado
- Texto público com palavra proibida (docs/07-juridico-e-etica.md)
- Chamada HTTP fora de `ingest/http.ts` (sem rate limit/retry)
- Upsert sem chave natural (risco de duplicar)
- Dado exibido sem fonte e link

Liste cada problema com arquivo e linha, corrija, e rode `pnpm test`.
