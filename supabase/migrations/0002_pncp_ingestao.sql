-- 0002_pncp_ingestao.sql — ajustes do reconhecimento do PNCP (docs/02, 05/10/2026)

-- ---------------------------------------------------------------
-- Modalidades: o domínio do PNCP tem 19, com descrição
-- ---------------------------------------------------------------
alter table modalidades add column descricao text;
alter table modalidades add column ativa boolean not null default true;

-- ---------------------------------------------------------------
-- Contratações: unidade, prazos de proposta, modo de disputa, fila de resultados
-- ---------------------------------------------------------------
alter table contratacoes add column codigo_unidade text;
alter table contratacoes add column modo_disputa text;
alter table contratacoes add column data_abertura_proposta timestamptz;
alter table contratacoes add column data_encerramento_proposta timestamptz;
-- null = falta buscar itens/resultados (zerado sempre que a contratação muda na fonte)
alter table contratacoes add column resultados_coletados_em timestamptz;
create index contratacoes_fila_resultados on contratacoes (modalidade_id)
  where resultados_coletados_em is null;

-- ---------------------------------------------------------------
-- Contratos: tipo e categoria vêm como {id, nome}; ano/sequencial servem para a API de termos
-- ---------------------------------------------------------------
alter table contratos add column codigo_unidade text;
alter table contratos add column tipo_contrato_id integer;
alter table contratos add column categoria_processo_id integer;
alter table contratos add column ano_contrato integer;
alter table contratos add column sequencial_contrato integer;
alter table contratos add column numero_controle_pncp_ata text;

-- ---------------------------------------------------------------
-- Itens e resultados por item (API de integração do PNCP).
-- É daqui que sai o fornecedor de dispensas que não viram contrato.
-- ---------------------------------------------------------------
create table itens_contratacao (
  contratacao_pncp        text not null references contratacoes(numero_controle_pncp) on delete cascade,
  numero_item             integer not null,
  descricao               text,
  material_ou_servico     text,            -- 'M' / 'S'
  quantidade              numeric(18,4),
  unidade_medida          text,
  valor_unitario_estimado numeric(18,4),
  valor_total_estimado    numeric(18,2),
  criterio_julgamento     text,
  situacao                text,
  tem_resultado           boolean,
  codigo_catalogo         text,            -- catalogoCodigoItem (frequentemente vazio)
  coletado_em             timestamptz not null default now(),
  primary key (contratacao_pncp, numero_item)
);
create index itens_contratacao_descricao_trgm on itens_contratacao using gin (descricao gin_trgm_ops);

create table resultados_itens (
  contratacao_pncp           text not null references contratacoes(numero_controle_pncp) on delete cascade,
  numero_item                integer not null,
  sequencial_resultado       integer not null,
  fornecedor_id              text references fornecedores(id),
  quantidade_homologada      numeric(18,4),
  valor_unitario_homologado  numeric(18,4),
  valor_total_homologado     numeric(18,2),
  percentual_desconto        numeric(9,4),
  porte_fornecedor           text,         -- ME, EPP, Demais...
  data_resultado             date,
  situacao                   text,
  coletado_em                timestamptz not null default now(),
  primary key (contratacao_pncp, numero_item, sequencial_resultado)
);
create index on resultados_itens (fornecedor_id);

alter table itens_contratacao enable row level security;
alter table resultados_itens  enable row level security;
create policy leitura_publica on itens_contratacao for select to anon, authenticated using (true);
create policy leitura_publica on resultados_itens  for select to anon, authenticated using (true);

-- Evita registrar o mesmo problema de qualidade a cada execução
alter table qualidade_dados add constraint qualidade_dados_unica unique (fonte, chave, problema);
