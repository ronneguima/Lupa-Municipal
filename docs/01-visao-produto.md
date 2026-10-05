# 01 — Visão do produto

## Problema

Os dados de contratações e gastos municipais são públicos, mas estão espalhados (PNCP, Tesouro, TCE, diários oficiais),
em formato técnico e sem contexto. O cidadão comum não sabe se R$ 2 milhões em "locação de estrutura para eventos"
é muito ou pouco para uma cidade de 50 mil habitantes, nem que a empresa contratada abriu o CNPJ um mês antes.

## Proposta

Uma página por município que responde, em dois minutos de leitura:

1. **Quanto a prefeitura gasta e em quê?** Comparado com cidades de porte parecido.
2. **Quem recebe o dinheiro?** Maiores fornecedores, evolução no tempo.
3. **O que foi contratado recentemente?** Linha do tempo de contratos e aditivos.
4. **O que merece atenção?** Alertas automáticos com explicação e link para o documento.
5. **De onde veio o dinheiro de fora?** Repasses federais e emendas parlamentares.

## Públicos e o que cada um precisa

| Público | Precisa de |
|---|---|
| Cidadão | Resumo simples, comparação com cidades vizinhas, linguagem sem jargão |
| Jornalista local | Alertas com evidência, exportar CSV, link para documento original, histórico do fornecedor |
| Vereador / assessoria | Acompanhar contratos novos, aditivos, receber aviso por e-mail |
| Observatório social / conselho | Metodologia transparente, dados abertos para reuso |

## Páginas (MVP)

- `/` — busca de município + destaques da semana na região.
- `/municipio/[ibge]` — painel do município (resumo, gastos por função, top fornecedores, contratos recentes, alertas).
- `/municipio/[ibge]/contratos` — lista filtrável (período, modalidade, fornecedor, valor) + exportar CSV.
- `/contrato/[numeroControlePncp]` — detalhe do contrato: objeto, valores, vigência, aditivos, fornecedor, alertas, link PNCP.
- `/fornecedor/[cnpj]` — dados cadastrais (BrasilAPI/Receita), contratos em todos os municípios cobertos, sócios (só nome), sanções.
- `/alertas` — feed de alertas recentes com filtros.
- `/metodologia` — explicação de cada alerta, fontes, limitações, data da última atualização.
- `/sobre` — quem mantém, contato, direito de resposta, como contribuir.

## Fora do escopo (por enquanto)

- Ranking de "corrupção" ou nota única por prefeito/município.
- Dados pessoais de servidores (folha de pagamento nominal).
- Login de usuários no MVP (alertas por e-mail entram na fase 4).
- Cobertura nacional antes de validar com a região.

## Métrica de sucesso do MVP

Um caso real encontrado pela ferramenta, verificado manualmente, e repercutido por um veículo ou vereador local.
Tráfego vem depois.
