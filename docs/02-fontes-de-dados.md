# 02 — Fontes de dados

Legenda: **[CONFIRMADO]** = verificado na especificação oficial em 04/10/2026. **[VERIFICAR]** = ainda não confirmado; confirme com uma chamada real antes de codar.

---

## 1. PNCP — Portal Nacional de Contratações Públicas (fonte principal)

Contratações (licitações, dispensas, inexigibilidades), contratos/empenhos, atas de registro de preço.
Acesso público, sem login. Especificação OpenAPI: `https://pncp.gov.br/api/consulta/v3/api-docs` **[CONFIRMADO]**

Base: `https://pncp.gov.br/api/consulta`

### Endpoints de consulta **[CONFIRMADO]**

| Endpoint | Obrigatórios | Filtros úteis | `tamanhoPagina` máx. |
|---|---|---|---|
| `GET /v1/contratacoes/publicacao` | `dataInicial`, `dataFinal` (yyyyMMdd), `codigoModalidadeContratacao`, `pagina` | `codigoMunicipioIbge`, `uf`, `cnpj` | **50** |
| `GET /v1/contratacoes/atualizacao` | idem | idem | 50 |
| `GET /v1/contratacoes/proposta` | `dataFinal`, `pagina` | `codigoMunicipioIbge`, `codigoModalidadeContratacao` | 50 |
| `GET /v1/contratos` | `dataInicial`, `dataFinal`, `pagina` | **`cnpjOrgao`** (não aceita município!) | 500 |
| `GET /v1/contratos/atualizacao` | idem | `cnpjOrgao` | 500 |
| `GET /v1/atas` | `dataInicial`, `dataFinal`, `pagina` | `cnpj` | 500 |
| `GET /v1/orgaos/{cnpj}/compras/{ano}/{sequencial}` | — | — | — |
| `GET /v1/pca/` | `anoPca`, `codigoClassificacaoSuperior`, `pagina` | — | 500 |

Resposta paginada: `{ data[], totalRegistros, totalPaginas, numeroPagina, paginasRestantes, empty }`.
HTTP **204 sem corpo** quando não há resultados — tratar como lista vazia **[CONFIRMADO em 05/10/2026]**.

### Limites da API **[CONFIRMADO em 05/10/2026]**

- **Janela máxima de 365 dias** entre `dataInicial` e `dataFinal`. Acima disso: HTTP 422
  `"Período maior que 365 dias."`. Ingestão usa blocos mensais.
- **`tamanhoPagina` mínimo é 10** (HTTP 400 `"must be greater than or equal to 10"`).
- **Rate limit agressivo, sem `Retry-After`:** HTTP 429 com página HTML "Limite de requisições excedido".
  Após rajadas, bloqueou na 8ª requisição mesmo a 1 req/s; o bloqueio durou ~25 s. O limite exato não foi medido
  (paramos para não abusar). Por isso: PNCP a **0,5 req/s** e backoff de 429 começando em **30 s** (`ingest/http.ts`).

### Campos importantes

**Contratação** (`RecuperarCompraPublicacaoDTO`): `numeroControlePNCP`, `orgaoEntidade{cnpj, razaoSocial, poderId, esferaId}`,
`unidadeOrgao{codigoIbge, municipioNome, ufSigla}`, `modalidadeId/Nome`, `amparoLegal{codigo,nome}`, `objetoCompra`,
`valorTotalEstimado`, `valorTotalHomologado`, `situacaoCompraId/Nome`, `srp`, `emendaParlamentar`,
`dataPublicacaoPncp`, `dataAtualizacaoGlobal`, `linkSistemaOrigem`.

**Contrato** (`RecuperarContratoDTO`): `numeroControlePNCP`, `numeroControlePncpCompra` (liga ao processo),
`niFornecedor`, `tipoPessoa` (PJ/PF/PE), `nomeRazaoSocialFornecedor`, `objetoContrato`, `valorInicial`, `valorGlobal`,
`valorAcumulado`, `dataAssinatura`, `dataVigenciaInicio/Fim`, `tipoContrato`, `categoriaProcesso`, `numeroRetificacao`,
`frutoAdesao`, `emendaParlamentar`, `unidadeOrgao{codigoIbge}`, `orgaoEntidade{esferaId}`, `anoContrato`, `sequencialContrato`,
`numeroContratoEmpenho`, `numeroControlePncpAta`.
**[CONFIRMADO na especificação em 05/10/2026]** `tipoContrato` e `categoriaProcesso` são **objetos `{id, nome}`**, não texto
(ex.: `"Contrato (termo inicial)"`, `"Empenho"`; `"Compras"`, `"Obras"`, `"Serviços de Saúde"`).
Tipos TypeScript gerados em `ingest/pncp/schema.d.ts` a partir de `ingest/pncp/openapi-consulta.json`.

**[CONFIRMADO em 05/10/2026] `/v1/contratos` filtra pela data de publicação no PNCP (`dataPublicacaoPncp`), não pela assinatura.**
A prefeitura de Campos do Jordão só começou a publicar contratos em fev/2025 — e publicou ali contratos assinados de 2021 a 2024.
Resultado: 2023 → nada; 2024 → 1 contrato; 2025 → 133; 2026 (até out) → 102. A UI deve dizer
"contratos publicados no PNCP" e mostrar a data de assinatura separadamente.
Contratos são atualizados depois de publicados (`dataAtualizacao` até set/2026 em contratos de 2025): o incremental é essencial.

Endpoint extra na especificação: `/v1/instrumentoscobranca/inclusao` (instrumentos de cobrança com **nota fiscal eletrônica**
vinculada ao contrato). Pode mostrar execução/pagamento sem depender do TCE. **[VERIFICAR cobertura — fase 3]**

### Estratégia por município (importante)

`/v1/contratos` **não filtra por município**. Fluxo:

1. **Descobrir órgãos:** para cada modalidade, buscar `/v1/contratacoes/publicacao?codigoMunicipioIbge=XXXX` e coletar
   os `orgaoEntidade.cnpj` distintos. Guardar na tabela `orgaos`.
2. **Filtrar esfera municipal:** manter só `esferaId = 'M'` **[CONFIRMADO em 05/10/2026: valores vistos "M" e "F"]** — senão entram unidades estaduais/federais
   sediadas na cidade. Caso real: o **Instituto Federal de SP** (10882594000165, esfera F) aparece em Campos do Jordão
   pelo campus local, e `/v1/contratos?cnpjOrgao=` dele traz contratos de **todos os campi do estado**.
3. **Buscar contratos** de cada CNPJ em `/v1/contratos?cnpjOrgao=...`.
4. **Incremental:** depois da carga inicial, usar os endpoints `/atualizacao` com janela dos últimos 3 dias (sobreposição de segurança).

Janela de datas: máximo de 365 dias (ver "Limites da API"). Usar blocos mensais.

### Reconhecimento de Campos do Jordão (04–05/10/2026)

| Órgão | CNPJ | esferaId | poderId | Unidades (`codigoUnidade`) |
|---|---|---|---|---|
| MUNICIPIO DE CAMPOS DO JORDAO | 45699626000176 | M | N | 27647, 984, 1 |
| CAMPOS DO JORDAO CAMARA MUNICIPAL | 51623908000192 | M | L | 2 |
| INSTITUTO FEDERAL DE SP (campus local) | 10882594000165 | **F** | E | 158347 — **excluir** |

Varredura de 2024–2025 em todas as modalidades ficou incompleta (429 no meio). Nenhum fundo/autarquia municipal apareceu
até ali; a primeira carga completa deve confirmar.

Contratações publicadas em 2025 (`/v1/contratacoes/publicacao`): pregão eletrônico (6) 71, **dispensa (8) 434**,
inexigibilidade (9) 22, concorrência eletrônica (4) 24, credenciamento (12) 9.
Contratos publicados em 2025 (`/v1/contratos`): prefeitura 133 (~R$ 85 mi; 129 "Contrato (termo inicial)" e 4 "Empenho";
todos com `numeroControlePncpCompra`; nenhum `frutoAdesao`; 6 de pessoa física), Câmara 40 (~R$ 342 mil).
Em nenhum dos 133 `valorGlobal` difere de `valorInicial` — aditivos só aparecem pela API de termos (A06 depende dela).

**Consequência:** a maioria das dispensas **não gera registro em `/v1/contratos`** (provável empenho direto).
Alertas sobre contratação direta (A01, A02) precisam partir de `contratacoes` + resultados por item, não só de `contratos`.

### Licitações com proposta aberta **[CONFIRMADO em 04/10/2026]**

`/v1/contratacoes/proposta?dataFinal=...&codigoModalidadeContratacao=6&uf=SP` funciona sem `dataInicial`
e traz `dataEncerramentoProposta`. Útil para uma seção "licitações abertas agora" no município.

### Códigos de modalidade **[CONFIRMADO em 05/10/2026]**

Endpoint de domínio: `https://pncp.gov.br/api/pncp/v1/modalidades` → lista `{id, nome, descricao, statusAtivo, ...}`.
São **19 modalidades**, não 13: além de 1–13, há 14 Inaplicabilidade da Licitação, 15 Chamada pública,
16–19 versões internacionais de concorrência e pregão. A ingestão itera sobre a tabela `modalidades` (populada da API),
nunca sobre um intervalo fixo. `contratacao_direta = true` para 8 (Dispensa) e 9 (Inexigibilidade).

### API de integração (itens, resultados, aditivos) **[PARCIALMENTE CONFIRMADO]**

Para preço unitário, vencedores por item e termos aditivos é outra API (`https://pncp.gov.br/api/pncp`). Caminhos:
- `/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens` **[CONFIRMADO em 04/10/2026]** — campos `numeroItem`, `descricao`,
  `quantidade`, `unidadeMedida`, `valorUnitarioEstimado`, `materialOuServicoNome`, `codigoItemCatalogo` (pode vir vazio)
- `/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens/{numeroItem}/resultados` **[CONFIRMADO em 05/10/2026]** — lista com
  `niFornecedor`, `tipoPessoa`, `nomeRazaoSocialFornecedor`, `quantidadeHomologada`, `valorUnitarioHomologado`,
  `valorTotalHomologado`, `percentualDesconto`, `porteFornecedorNome` (ME/EPP...), `dataResultado`, `situacaoCompraItemResultadoNome`.
  **É assim que se sabe quem venceu uma dispensa** que não virou contrato.
- `/v1/orgaos/{cnpj}/contratos/{ano}/{sequencial}/termos` **[CONFIRMADO que existe em 05/10/2026]** — devolveu 204 para um contrato
  sem aditivo; formato do corpo ainda não visto.
- `/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/arquivos` **[CONFIRMADO em 04/10/2026]** — lista com `titulo`, `tipoDocumentoNome`
  ("Edital", "Outros Documentos"...) e `url` de download do PDF

Swagger provável: `https://pncp.gov.br/api/pncp/swagger-ui/index.html` **[VERIFICAR]**.

### Armadilhas conhecidas

- Muitos municípios publicam com campos vazios ou valores zerados — nunca gerar alerta a partir de valor nulo.
  Visto em Campos do Jordão (2025): 6 de 133 contratos com `valorGlobal = 0`; credenciamentos com `valorTotalEstimado = 0`.
  Zero publicado como valor de contrato também não deve disparar alerta (tratar como "valor não informado").
- **CPF dentro do nome do fornecedor:** MEI aparece como `"NOME DA PESSOA 12345678909"` em `nomeRazaoSocialFornecedor`.
  Também há contrato PF com dois nomes no mesmo campo (casal) — não dá para separar pessoa por nome.
  Todo payload passa por `sanitizarPayload` (`lib/privacidade.ts`) **antes** de ir para `raw_registros`; o id do fornecedor PF
  é calculado antes da sanitização.
- `numeroRetificacao > 0` indica contrato retificado; usar a versão mais recente.
- Contratos anteriores a 2024 (Lei 8.666) podem não estar no PNCP. Deixar isso explícito na UI.
- Cobertura desigual: mostrar na página do município "X contratos publicados no PNCP desde 2024" para o leitor entender a base.

---

## 2. SICONFI — Tesouro Nacional (orçamento e despesa por função)

Receitas e despesas declaradas pelos municípios (RREO bimestral, RGF quadrimestral, DCA anual).

Base provável: `https://apidatalake.tesouro.gov.br/ords/siconfi/tt/` **[VERIFICAR]**
- `/entes` — lista de entes com código IBGE e população
- `/rreo?an_exercicio=2025&nr_periodo=6&co_tipo_demonstrativo=RREO&id_ente=3509700`
- `/dca?an_exercicio=2024&id_ente=3509700` — despesa por função/subfunção (anual, mais completa)
- `/rgf?...` — gastos com pessoal vs limite da LRF

Uso: "quanto se gasta e em quê", comparação per capita com municípios de porte similar (usar população de `/entes` ou IBGE).

---

## 3. TCE-SP — Portal da Transparência Municipal (execução: empenho, liquidação, pagamento)

Cobre as 644 prefeituras paulistas fiscalizadas pelo TCE-SP. Tem conjuntos de dados para download e APIs.
Portal: `https://transparencia.tce.sp.gov.br/`

- Conjuntos de dados (CSV/ZIP por ano) e API JSON de despesas por município/ano/mês **[VERIFICAR caminhos e formato do identificador do município — provavelmente slug do nome, não código IBGE]**.
- Também tem consulta por fornecedor.

Uso: ligar contrato → pagamento efetivo (por CNPJ do fornecedor + período). É o dado que mostra **quem recebeu de fato**,
inclusive pagamentos sem contrato no PNCP. Fase 3.

Outros estados: cada TCE tem portal próprio e formato diferente. Planejar um adaptador por TCE (`ingest/tce/sp.ts`, `ingest/tce/mg.ts`...).

---

## 4. Dados de fornecedores (CNPJ)

**MVP: consulta pontual, só dos fornecedores que aparecem nos contratos.**
- BrasilAPI: `https://brasilapi.com.br/api/cnpj/v1/{cnpj}` — retorna razão social, data de abertura, capital social,
  CNAE, endereço, situação cadastral e QSA (sócios) **[VERIFICAR campos atuais]**. Cachear na tabela `fornecedores`,
  revalidar a cada 30 dias. Rate limit baixo — fila com 1 req/s.
- Alternativa futura: base completa da Receita Federal (arquivos mensais, dezenas de GB) — só quando escalar para o estado inteiro.

**LGPD:** do QSA guardar apenas nome do sócio, qualificação e data de entrada. Nada de CPF.

---

## 5. Sanções — CEIS / CNEP (Portal da Transparência / CGU)

Empresas inidôneas/suspensas e punidas pela Lei Anticorrupção.
- API: `https://api.portaldatransparencia.gov.br/api-de-dados/` — exige **chave gratuita** (cadastro com e-mail) no header `chave-api-dados` **[VERIFICAR]**.
- Endpoints prováveis: `/ceis?cnpjSancionado=...`, `/cnep?cnpjSancionado=...` **[VERIFICAR]**.
- Alternativa: download dos arquivos completos CEIS/CNEP (CSV) e cruzamento local — mais simples e sem rate limit.

Mesma API traz **transferências federais e emendas parlamentares por município** (fase 3).

---

## 6. Querido Diário — diários oficiais municipais (Open Knowledge Brasil)

Busca textual em diários oficiais. Útil para extratos de contrato, aditivos e dispensas não publicados no PNCP.
- API: `https://api.queridodiario.ok.org.br/gazettes?territory_ids=3509700&querystring=...` **[VERIFICAR]**
- Verificar se Campos do Jordão e vizinhos estão cobertos antes de depender disso.

Fase 3. Considerar parceria em vez de reimplementar raspagem.

---

## 7. IBGE — municípios e população

- `https://servicodados.ibge.gov.br/api/v1/localidades/estados/35/municipios` — lista de municípios de SP com código IBGE
  **[CONFIRMADO em 04/10/2026: 645 municípios; Campos do Jordão 3509700, São Bento do Sapucaí 3548609, Santo Antônio do Pinhal 3548203]**.
- População: API de agregados do IBGE ou `/entes` do SICONFI.
- Popular `municipios` a partir da API, **não** de códigos digitados à mão.
