# 03 — Catálogo de alertas

Princípios:
- Alerta = **indício que merece atenção**, nunca conclusão. Texto público segue `07-juridico-e-etica.md`.
- Cada alerta tem: código, nível (`informativo` | `atencao` | `relevante`), evidências (ids dos registros e valores usados),
  texto explicativo gerado por template, link para os documentos.
- Limiares ficam em `config_parametros` (editáveis sem deploy) e são mostrados na página `/metodologia`.
- Nunca disparar com dado nulo, zerado ou inconsistente — registrar em `qualidade_dados` em vez disso.
- Cada alerta é uma função pura em `alerts/<codigo>.ts` com teste (positivo, negativo, borda).

---

## Fase 2 — com PNCP + CNPJ

### A01 — Peso alto de contratação direta
- **Lógica:** soma de valor de dispensas + inexigibilidades ÷ valor total contratado no ano, por município.
  Disparar se > `p90` dos municípios cobertos **e** > `a01_minimo_percentual` (padrão 40%).
- **Nível:** informativo.
- **Falso positivo comum:** municípios pequenos, saúde (credenciamentos), shows artísticos (inexigibilidade é legal).
- **Texto:** "Neste ano, X% do valor contratado pela prefeitura foi sem licitação (dispensa ou inexigibilidade). A mediana da região é Y%."

### A02 — Possível fracionamento de despesa
- **Lógica:** mesmo órgão + mesmo fornecedor, ≥ 2 dispensas por valor em janela de `a02_janela_dias` (padrão 90),
  cuja soma ultrapassa o limite legal de dispensa vigente na data (tabela `limites_dispensa`, atualizada por decreto anual — **não hardcodar**).
  Refinamento: objetos com similaridade textual alta (trigram `pg_trgm` > 0,5).
- **Nível:** atenção.
- **Texto:** "A prefeitura fez N contratações diretas com a mesma empresa em X dias, somando R$ Y — acima do limite para dispensa individual (R$ Z)."

### A03 — Empresa recém-aberta
- **Lógica:** `data_assinatura - data_abertura_cnpj < a03_dias` (padrão 180 dias).
- **Nível:** atenção (relevante se combinado com A04).
- **Texto:** "A empresa foi aberta N dias antes de assinar este contrato."

### A04 — Valor desproporcional ao capital social
- **Lógica:** `valor_global > capital_social × a04_multiplicador` (padrão 20) e `valor_global > a04_valor_minimo` (padrão R$ 100 mil).
- **Nível:** informativo.
- **Falso positivo:** capital social declarado é frequentemente desatualizado. Deixar isso claro no texto.

### A05 — Concentração em um fornecedor
- **Lógica:** um fornecedor recebe > `a05_percentual` (padrão 25%) do valor contratado pelo órgão no ano, excluindo
  concessionárias (energia, água, telefonia) via lista de CNAEs ignorados.
- **Nível:** informativo.

### A06 — Aditivos elevados
- **Lógica:** `(valor_global - valor_inicial) / valor_inicial > a06_percentual` (padrão 20%). Lei 14.133 limita acréscimos a 25% (50% em reforma).
  Usar termos aditivos (API de integração) quando disponível; `valorAcumulado` **não** é aditivo — **[VERIFICAR semântica]**.
- **Nível:** atenção acima de 20%, relevante acima de 25%.

### A07 — Situação cadastral irregular
- **Lógica:** CNPJ com situação ≠ ATIVA na data da consulta, ou baixado/inapto antes da data de assinatura.
- **Nível:** relevante.

---

## Fase 3 — com CEIS/CNEP, QSA e TCE

### A08 — Fornecedor com sanção vigente
- **Lógica:** CNPJ consta no CEIS/CNEP com sanção vigente na data de assinatura e abrangência que alcance o município.
- **Nível:** relevante.
- **Atenção:** verificar abrangência da sanção (algumas valem só para o órgão sancionador).

### A09 — Sócios em comum entre fornecedores
- **Lógica:** duas empresas com sócio em comum (nome normalizado + qualificação) contratadas pelo mesmo órgão,
  especialmente no mesmo processo (`numeroControlePncpCompra`).
- **Nível:** atenção (relevante se no mesmo processo).
- **Falso positivo:** homônimos. Só usar nome completo com ≥ 3 palavras e exibir como "possível vínculo".

### A10 — Pagamento sem contrato publicado
- **Lógica:** fornecedor recebeu > `a10_valor` no ano segundo o TCE, sem nenhum contrato/dispensa no PNCP.
- **Nível:** informativo (pode ser contrato antigo, 8.666, ou falha de publicação).

### A11 — CNAE incompatível com o objeto
- **Lógica:** classificação do objeto (LLM, com saída estruturada e revisão humana amostral) vs CNAE principal e secundários.
- **Nível:** informativo. Só exibir com confiança alta.

---

## Fase 5 — comparação de preços

### A12 — Preço unitário acima da referência
- **Lógica:** para itens com mesmo código de catálogo (CATMAT/CATSER) e unidade de fornecimento, preço homologado > `p90`
  nacional do PNCP nos últimos 12 meses, com amostra ≥ `a12_amostra_minima` (padrão 20).
- **Nível:** atenção.
- **Texto:** "O preço pago por unidade foi R$ X; em N compras do mesmo item no país, 90% pagaram até R$ Y." Nunca usar "superfaturamento".

### A13 — Pico em período eleitoral
- **Lógica:** volume de contratações diretas no semestre pré-eleitoral > 1,5× a média dos mesmos semestres de anos não eleitorais.
- **Nível:** informativo.

---

## Combinações

Um contrato com múltiplos alertas sobe de nível (ex.: A03 + A04 + A01 no mesmo contrato → relevante).
Não criar "score" numérico público; exibir os alertas lado a lado.

## Revisão humana

Alertas de nível **relevante** entram como `pendente_revisao` e só são publicados após revisão manual no painel admin (fase 4).
Antes disso, ficam visíveis apenas para administradores.
