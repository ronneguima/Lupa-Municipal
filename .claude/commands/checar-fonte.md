---
description: Confirma endpoints [VERIFICAR] de uma fonte com chamadas reais (ex.: /checar-fonte SICONFI)
---

Faça o reconhecimento da fonte $ARGUMENTS listada em docs/02-fontes-de-dados.md:

1. Para cada item marcado [VERIFICAR] dessa fonte, faça uma chamada real (use Campos do Jordão como município de teste).
2. Salve uma resposta representativa de cada endpoint em `ingest/__fixtures__/<fonte>/`.
3. Atualize docs/02: troque [VERIFICAR] por [CONFIRMADO em <data>] ou corrija o endpoint/parâmetro/campo errado.
4. Anote limites de paginação, rate limit observado e formatos de data.
5. Me entregue um resumo do que mudou e o que ainda não foi possível confirmar.

Não escreva código de ingestão nesta tarefa.
