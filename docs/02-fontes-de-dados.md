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
HTTP **204 sem corpo** quando não há resultados — tratar como lista vazia.

### Campos importantes

**Contratação** (`RecuperarCompraPublicacaoDTO`): `numeroControlePNCP`, `orgaoEntidade{cnpj, razaoSocial, poderId, esferaId}`,
`unidadeOrgao{codigoIbge, municipioNome, ufSigla}`, `modalidadeId/Nome`, `amparoLegal{codigo,nome}`, `objetoCompra`,
`valorTotalEstimado`, `valorTotalHomologado`, `situacaoCompraId/Nome`, `srp`, `emendaParlamentar`,
`dataPublicacaoPncp`, `dataAtualizacaoGlobal`, `linkSistemaOrigem`.

**Contrato** (`RecuperarContratoDTO`): `numeroControlePNCP`, `numeroControlePncpCompra` (liga ao processo),
`niFornecedor`, `tipoPessoa` (PJ/PF/PE), `nomeRazaoSocialFornecedor`, `objetoContrato`, `valorInicial`, `valorGlobal`,
`valorAcumulado`, `dataAssinatura`, `dataVigenciaInicio/Fim`, `tipoContrato`, `categoriaProcesso`, `numeroRetificacao`,
`frutoAdesao`, `emendaParlamentar`, `unidadeOrgao{codigoIbge}`, `orgaoEntidade{esferaId}`.

### Estratégia por município (importante)

`/v1/contratos` **não filtra por município**. Fluxo:

1. **Descobrir órgãos:** para cada modalidade, buscar `/v1/contratacoes/publicacao?codigoMunicipioIbge=XXXX` e coletar
   os `orgaoEntidade.cnpj` distintos. Guardar na tabela `orgaos`.
2. **Filtrar esfera municipal:** manter só `esferaId = 'M'` **[CONFIRMADO em 04/10/2026 que prefeitura e Câmara vêm com "M"; demais valores ainda não vistos]** — senão entram unidades estaduais/federais
   sediadas na cidade (ex.: escola estadual). Prefeitura, Câmara, autarquias, fundos e SAAE costumam ter CNPJs distintos.
3. **Buscar contratos** de cada CNPJ em `/v1/contratos?cnpjOrgao=...`.
4. **Incremental:** depois da carga inicial, usar os endpoints `/atualizacao` com janela dos últimos 3 dias (sobreposição de segurança).

Janela de datas: um ano inteiro (20250101–20251231) funcionou numa só chamada em 04/10/2026 **[limite máximo ainda não testado]**.
Manter blocos mensais por segurança e para reprocessar por partes.

### Reconhecimento de Campos do Jordão (04/10/2026, ano de 2025)

| Órgão | CNPJ | esferaId | poderId |
|---|---|---|---|
| MUNICIPIO DE CAMPOS DO JORDAO | 45699626000176 | M | N |
| CAMPOS DO JORDAO CAMARA MUNICIPAL | 51623908000192 | M | L |

Só a 1ª página de cada modalidade foi lida — na carga completa, verificar se há fundo de previdência/autarquia com CNPJ próprio.

Contratações publicadas em 2025 (`/v1/contratacoes/publicacao`): pregão eletrônico (6) 71, **dispensa (8) 434**,
inexigibilidade (9) 22, concorrência eletrônica (4) 24, credenciamento (12) 9.
Contratos em 2025 (`/v1/contratos`): prefeitura 133 (~R$ 85 mi), Câmara 40 (~R$ 342 mil).

**Consequência:** a maioria das dispensas **não gera registro em `/v1/contratos`** (provável empenho direto).
Alertas sobre contratação direta (A01, A02) precisam partir de `contratacoes` + resultados por item, não só de `contratos`.

### Licitações com proposta aberta **[CONFIRMADO em 04/10/2026]**

`/v1/contratacoes/proposta?dataFinal=...&codigoModalidadeContratacao=6&uf=SP` funciona sem `dataInicial`
e traz `dataEncerramentoProposta`. Útil para uma seção "licitações abertas agora" no município.

### Códigos de modalidade **[VERIFICAR via tabela de domínio]**

Provável endpoint de domínio: `https://pncp.gov.br/api/pncp/v1/modalidades` **[VERIFICAR]**. Valores esperados
(Lei 14.133): 1 Leilão eletrônico, 2 Diálogo competitivo, 3 Concurso, 4 Concorrência eletrônica, 5 Concorrência presencial,
6 Pregão eletrônico, 7 Pregão presencial, **8 Dispensa**, **9 Inexigibilidade**, 10 Manifestação de interesse,
11 Pré-qualificação, 12 Credenciamento, 13 Leilão presencial. Popular a tabela `modalidades` a partir da API, não deste texto.

### API de integração (itens, resultados, aditivos) **[PARCIALMENTE CONFIRMADO]**

Para preço unitário, vencedores por item e termos aditivos é outra API (`https://pncp.gov.br/api/pncp`). Caminhos:
- `/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens` **[CONFIRMADO em 04/10/2026]** — campos `numeroItem`, `descricao`,
  `quantidade`, `unidadeMedida`, `valorUnitarioEstimado`, `materialOuServicoNome`, `codigoItemCatalogo` (pode vir vazio)
- `/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens/{numeroItem}/resultados` **[VERIFICAR]**
- `/v1/orgaos/{cnpj}/contratos/{ano}/{sequencial}/termos` **[VERIFICAR]**
- `/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/arquivos` **[CONFIRMADO em 04/10/2026]** — lista com `titulo`, `tipoDocumentoNome`
  ("Edital", "Outros Documentos"...) e `url` de download do PDF

Swagger provável: `https://pncp.gov.br/api/pncp/swagger-ui/index.html` **[VERIFICAR]**.

### Armadilhas conhecidas

- Muitos municípios publicam com campos vazios ou valores zerados — nunca gerar alerta a partir de valor nulo.
  Visto em Campos do Jordão (2025): 6 de 133 contratos sem `valorGlobal`; credenciamentos com `valorTotalEstimado = 0`.
- **CPF dentro do nome do fornecedor:** MEI aparece como `"NOME DA PESSOA 18967200803"` em `nomeRazaoSocialFornecedor`.
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
