-- 0001_schema_inicial.sql — Lupa Municipal
-- Schema inicial (fases 0–2). Revisar contra docs/02 antes de aplicar.

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ---------------------------------------------------------------
-- Referência
-- ---------------------------------------------------------------
create table municipios (
  codigo_ibge   char(7) primary key,
  nome          text not null,
  uf            char(2) not null,
  populacao     integer,
  monitorado    boolean not null default false,
  atualizado_em timestamptz not null default now()
);

create table modalidades (
  id    integer primary key,         -- código do PNCP (popular via API de domínio)
  nome  text not null,
  contratacao_direta boolean not null default false  -- dispensa / inexigibilidade
);

create table orgaos (
  cnpj            char(14) primary key,
  razao_social    text not null,
  esfera          text,               -- valor de orgaoEntidade.esferaId
  poder           text,
  municipio_ibge  char(7) references municipios(codigo_ibge),
  incluir         boolean not null default true,   -- false = órgão estadual/federal sediado na cidade
  atualizado_em   timestamptz not null default now()
);
create index on orgaos (municipio_ibge);

-- ---------------------------------------------------------------
-- Camada bruta (reprocessável)
-- ---------------------------------------------------------------
create table raw_registros (
  id           bigserial primary key,
  fonte        text not null,          -- 'pncp_contratacao', 'pncp_contrato', 'brasilapi_cnpj', 'siconfi_dca'...
  chave        text not null,          -- chave natural na fonte
  payload      jsonb not null,          -- SEMPRE passar por sanitizarPayload (lib/privacidade.ts): MEI traz CPF no nome
  hash         text not null,
  coletado_em  timestamptz not null default now(),
  normalizado  boolean not null default false,
  unique (fonte, chave)
);

-- ---------------------------------------------------------------
-- Contratações (processos) e contratos — PNCP
-- ---------------------------------------------------------------
create table contratacoes (
  numero_controle_pncp   text primary key,
  orgao_cnpj             char(14) not null references orgaos(cnpj),
  municipio_ibge         char(7) references municipios(codigo_ibge),
  unidade_nome           text,
  ano_compra             integer,
  sequencial_compra      integer,
  numero_compra          text,
  processo               text,
  modalidade_id          integer references modalidades(id),
  amparo_legal_codigo    integer,
  amparo_legal_nome      text,
  objeto                 text,
  valor_estimado         numeric(18,2),
  valor_homologado       numeric(18,2),
  situacao               text,
  srp                    boolean,
  emenda_parlamentar     boolean,
  data_publicacao        timestamptz,
  data_atualizacao_fonte timestamptz,
  link_sistema_origem    text,
  url_origem             text,          -- link público no pncp.gov.br
  fonte                  text not null default 'pncp',
  coletado_em            timestamptz not null default now()
);
create index on contratacoes (municipio_ibge, data_publicacao desc);
create index on contratacoes (modalidade_id);
create index contratacoes_objeto_trgm on contratacoes using gin (objeto gin_trgm_ops);

create table fornecedores (
  id                      text primary key,          -- PJ: CNPJ (14 dígitos). PF: 'pf_' + sha256(cpf || SALT) truncado. CPF nunca é armazenado.
  tipo_pessoa             text not null check (tipo_pessoa in ('PJ','PF','PE')),
  documento_exibicao      text not null,             -- CNPJ formatado ou CPF MASCARADO
  nome                    text not null,
  data_abertura           date,
  capital_social          numeric(18,2),
  cnae_principal          text,
  cnaes_secundarios       text[],
  situacao_cadastral      text,
  data_situacao_cadastral date,
  municipio               text,
  uf                      char(2),
  status_enriquecimento   text not null default 'pendente'
                          check (status_enriquecimento in ('pendente','ok','erro','nao_aplicavel')),
  enriquecido_em          timestamptz,
  atualizado_em           timestamptz not null default now()
);
create index fornecedores_nome_trgm on fornecedores using gin (nome gin_trgm_ops);
-- SALT fica em variável de ambiente (CPF_HASH_SALT), nunca no banco nem no repositório.

create table fornecedor_socios (
  id              bigserial primary key,
  fornecedor_id   text not null references fornecedores(id) on delete cascade,
  nome            text not null,
  nome_normalizado text not null,      -- unaccent + upper + espaços colapsados
  qualificacao    text,
  data_entrada    date,
  unique (fornecedor_id, nome_normalizado, qualificacao)
  -- NÃO armazenar CPF de sócio (CLAUDE.md, regra 4)
);
create index on fornecedor_socios (nome_normalizado);

create table contratos (
  numero_controle_pncp        text primary key,
  -- Sem FK de propósito: contrato pode vir de adesão a ata de outro órgão (fruto_adesao)
  -- ou de compra publicada fora da janela ingerida. A ligação é resolvida por join.
  numero_controle_pncp_compra text,
  orgao_cnpj                  char(14) not null references orgaos(cnpj),
  municipio_ibge              char(7) references municipios(codigo_ibge),
  fornecedor_id               text references fornecedores(id),
  tipo_contrato               text,
  categoria_processo          text,
  numero_contrato             text,
  objeto                      text,
  valor_inicial               numeric(18,2),
  valor_global                numeric(18,2),
  valor_acumulado             numeric(18,2),
  data_assinatura             date,
  vigencia_inicio             date,
  vigencia_fim                date,
  numero_retificacao          integer,
  fruto_adesao                boolean,
  emenda_parlamentar          boolean,
  data_publicacao             timestamptz,
  data_atualizacao_fonte      timestamptz,
  url_origem                  text,
  fonte                       text not null default 'pncp',
  coletado_em                 timestamptz not null default now()
);
create index on contratos (municipio_ibge, data_assinatura desc);
create index on contratos (fornecedor_id);
create index on contratos (numero_controle_pncp_compra);

create table termos_aditivos (
  id                     bigserial primary key,
  contrato_pncp          text not null references contratos(numero_controle_pncp) on delete cascade,
  sequencial             integer not null,
  tipo                   text,
  valor_acrescido        numeric(18,2),
  prazo_aditado_dias     integer,
  data_assinatura        date,
  objeto                 text,
  url_origem             text,
  coletado_em            timestamptz not null default now(),
  unique (contrato_pncp, sequencial)
);

-- ---------------------------------------------------------------
-- Finanças — SICONFI (despesa por função)
-- ---------------------------------------------------------------
create table despesas_funcao (
  municipio_ibge  char(7) not null references municipios(codigo_ibge),
  exercicio       integer not null,
  funcao          text not null,
  subfuncao       text not null default '',
  estagio         text not null,        -- empenhada / liquidada / paga
  valor           numeric(18,2),
  fonte           text not null default 'siconfi_dca',
  coletado_em     timestamptz not null default now(),
  primary key (municipio_ibge, exercicio, funcao, subfuncao, estagio)
);

-- ---------------------------------------------------------------
-- Sanções (CEIS/CNEP) — fase 3
-- ---------------------------------------------------------------
create table sancoes (
  id               bigserial primary key,
  cadastro         text not null check (cadastro in ('CEIS','CNEP')),
  documento        varchar(14) not null,
  nome             text,
  tipo_sancao      text,
  orgao_sancionador text,
  abrangencia      text,
  data_inicio      date,
  data_fim         date,
  url_origem       text,
  coletado_em      timestamptz not null default now()
);
create index on sancoes (documento);

-- ---------------------------------------------------------------
-- Configuração de alertas
-- ---------------------------------------------------------------
create table config_parametros (
  chave       text primary key,
  valor       numeric not null,
  descricao   text not null,
  atualizado_em timestamptz not null default now()
);

insert into config_parametros (chave, valor, descricao) values
  ('a01_minimo_percentual', 40,     'A01: % mínimo do valor contratado via contratação direta'),
  ('a02_janela_dias',       90,     'A02: janela para somar dispensas ao mesmo fornecedor'),
  ('a03_dias',              180,    'A03: dias entre abertura do CNPJ e assinatura'),
  ('a04_multiplicador',     20,     'A04: valor do contrato / capital social'),
  ('a04_valor_minimo',      100000, 'A04: valor mínimo do contrato para avaliar'),
  ('a05_percentual',        25,     'A05: % do valor anual do órgão em um fornecedor'),
  ('a06_percentual',        20,     'A06: % de acréscimo por aditivo sobre o valor inicial');

create table limites_dispensa (
  -- Limites do art. 75 da Lei 14.133, atualizados anualmente por decreto. Preencher com o decreto vigente (não inventar).
  vigencia_inicio date not null,
  tipo            text not null check (tipo in ('obras_engenharia','compras_servicos')),
  valor           numeric(18,2) not null,
  decreto         text not null,
  primary key (vigencia_inicio, tipo)
);

-- ---------------------------------------------------------------
-- Alertas
-- ---------------------------------------------------------------
create table alertas (
  id              bigserial primary key,
  codigo          text not null,         -- 'A01'...'A13'
  nivel           text not null check (nivel in ('informativo','atencao','relevante')),
  status          text not null default 'ativo'
                  check (status in ('ativo','pendente_revisao','contestado','expirado','descartado')),
  municipio_ibge  char(7) references municipios(codigo_ibge),
  contrato_pncp   text references contratos(numero_controle_pncp),
  contratacao_pncp text references contratacoes(numero_controle_pncp),
  fornecedor_id   text references fornecedores(id),
  titulo          text not null,
  texto           text not null,
  evidencias      jsonb not null,        -- valores e ids usados no cálculo
  chave_dedup     text not null unique,  -- evita alerta duplicado entre execuções
  gerado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index on alertas (municipio_ibge, status, gerado_em desc);

create table contestacoes (
  id             bigserial primary key,
  alerta_id      bigint references alertas(id),
  contrato_pncp  text references contratos(numero_controle_pncp),
  nome           text not null,
  email          text not null,
  vinculo        text,                  -- órgão, empresa, cidadão, imprensa
  mensagem       text not null,
  status         text not null default 'recebida' check (status in ('recebida','em_analise','acatada','rejeitada')),
  criado_em      timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Operação
-- ---------------------------------------------------------------
create table ingestao_execucoes (
  id               bigserial primary key,
  fonte            text not null,
  municipio_ibge   char(7),
  parametros       jsonb,
  iniciado_em      timestamptz not null default now(),
  finalizado_em    timestamptz,
  registros_novos  integer default 0,
  registros_alterados integer default 0,
  erros            jsonb,
  status           text not null default 'rodando' check (status in ('rodando','ok','erro'))
);

create table qualidade_dados (
  id             bigserial primary key,
  fonte          text not null,
  chave          text not null,
  problema       text not null,         -- 'valor_nulo', 'data_inconsistente', 'cnpj_invalido'...
  detalhe        jsonb,
  detectado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- RLS: leitura pública, escrita só via service role
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'municipios','modalidades','orgaos','contratacoes','contratos','termos_aditivos',
    'fornecedores','fornecedor_socios','despesas_funcao','sancoes','config_parametros',
    'limites_dispensa','alertas'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy leitura_publica on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- Alertas: público só vê ativos
drop policy leitura_publica on alertas;
create policy leitura_publica_alertas on alertas for select to anon, authenticated
  using (status = 'ativo');

-- Tabelas internas: RLS ligado e sem policy para anon (apenas service role acessa)
alter table raw_registros       enable row level security;
alter table ingestao_execucoes  enable row level security;
alter table qualidade_dados     enable row level security;
alter table contestacoes        enable row level security;

-- Contestações: qualquer um pode enviar, ninguém lê pela API pública
create policy enviar_contestacao on contestacoes for insert to anon, authenticated with check (true);
