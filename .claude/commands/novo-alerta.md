---
description: Implementa um alerta do catálogo (ex.: /novo-alerta A03)
---

Implemente o alerta $ARGUMENTS descrito em docs/03-alertas.md.

1. Releia a seção do alerta, docs/07-juridico-e-etica.md e o CLAUDE.md.
2. Crie `alerts/<codigo>-<nome>.ts` como função pura `(dados, params) => Alerta[]`, lendo limiares de `config_parametros`
   (adicione a chave na migration se não existir, numa nova migration).
3. Nunca dispare com valor nulo, zerado ou data inconsistente; registre em `qualidade_dados`.
4. Gere `chave_dedup` estável para não duplicar entre execuções.
5. Texto público em `lib/textos-alertas.ts`: fato com números + contexto + fonte. Confira a lista de palavras proibidas.
6. Testes em Vitest: caso positivo, negativo e de borda (limiar exato, dado nulo).
7. Rode `pnpm test` e mostre quantos alertas o código gera nos municípios monitorados, com 3 exemplos e links.
