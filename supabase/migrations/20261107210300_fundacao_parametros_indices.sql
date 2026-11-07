-- Fase 1 · Fundação (4/5): parâmetros com vigência e índices econômicos.
-- RN-G06: nenhum número legal, tributário ou contratual vive no código.

create type public.parametro_tipo as enum ('decimal', 'inteiro', 'centavos', 'texto', 'booleano');

-- Catálogo de parâmetros (global; muda por migration).
create table public.parametros (
  chave text primary key check (chave ~ '^[a-z_]+(\.[a-z_]+)+$'),
  descricao text not null,
  tipo public.parametro_tipo not null,
  unidade text,
  valores_permitidos text[],
  pendencia_legal text
);

comment on column public.parametros.pendencia_legal is
  'Identificador em docs/pendencias-legais.md quando o valor depende de validação externa.';

insert into public.parametros (chave, descricao, tipo, unidade, valores_permitidos, pendencia_legal) values
  ('financeiro.tma_mensal', 'Taxa mínima de atratividade (real, ao mês) usada no VPL e no payback descontado', 'decimal', 'fração ao mês', null, null),
  ('financeiro.caixa_minimo', 'Saldo mínimo de caixa para cálculo da necessidade de aporte', 'centavos', 'centavos', null, null),
  ('tributario.regime', 'Regime tributário da SPE', 'texto', null, array['lucro_presumido', 'lucro_real', 'simples_nacional', 'ret'], 'PL-07, PL-08'),
  ('comercial.prazo_reserva_horas', 'Prazo de validade de uma reserva de lote', 'inteiro', 'horas', null, null),
  ('comercial.desconto_maximo_sem_aprovacao', 'Desconto máximo sobre a tabela sem aprovação de gestor', 'decimal', 'fração', null, null),
  ('comercial.permite_venda_sem_registro', 'Permite exceção ao bloqueio de venda antes do registro, com justificativa', 'booleano', null, null, 'PL-01');

-- Valores com vigência e escopo. Sem tenant = valor padrão da plataforma.
create table public.parametro_valores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  chave text not null references public.parametros (chave),
  escopo text not null check (escopo in ('plataforma', 'tenant', 'empresa', 'spe', 'empreendimento')),
  escopo_id uuid,
  valor jsonb not null,
  vigencia daterange not null check (not isempty(vigencia) and lower(vigencia) is not null),
  motivo text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  check ((escopo = 'plataforma') = (tenant_id is null)),
  check ((escopo in ('plataforma', 'tenant')) = (escopo_id is null)),
  -- Duas vigências do mesmo parâmetro no mesmo escopo nunca se sobrepõem.
  constraint parametro_valores_sem_sobreposicao exclude using gist (
    chave with =,
    escopo with =,
    (coalesce(escopo_id, coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid))) with =,
    vigencia with &&
  )
);

create index parametro_valores_busca_idx on public.parametro_valores (chave, tenant_id, escopo, escopo_id);

-- Plataforma: padrão de produto (não legal).
insert into public.parametro_valores (tenant_id, chave, escopo, escopo_id, valor, vigencia, motivo) values
  (null, 'comercial.prazo_reserva_horas', 'plataforma', null, '48', daterange('2026-01-01', null), 'Padrão inicial do produto'),
  (null, 'comercial.permite_venda_sem_registro', 'plataforma', null, 'false', daterange('2026-01-01', null), 'Bloqueio por padrão até PL-01');

-- Valida o valor contra o tipo declarado no catálogo.
create function privado.validar_parametro_valor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p public.parametros;
  -- Texto do valor escalar (sem aspas para strings).
  v_texto text := new.valor #>> array[]::text[];
begin
  select * into p from public.parametros where chave = new.chave;
  if not (case p.tipo
    when 'decimal' then jsonb_typeof(new.valor) in ('number', 'string') and v_texto ~ '^-?\d+(\.\d+)?$'
    when 'inteiro' then jsonb_typeof(new.valor) = 'number' and v_texto ~ '^-?\d+$'
    when 'centavos' then jsonb_typeof(new.valor) = 'number' and v_texto ~ '^-?\d+$'
    when 'texto' then jsonb_typeof(new.valor) = 'string'
    when 'booleano' then jsonb_typeof(new.valor) = 'boolean'
  end) then
    raise exception 'Valor inválido para o parâmetro % (tipo %).', new.chave, p.tipo
      using errcode = 'check_violation';
  end if;
  if p.valores_permitidos is not null and not (v_texto = any (p.valores_permitidos)) then
    raise exception 'Valor não permitido para o parâmetro %.', new.chave
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger validar_parametro_valor
  before insert or update on public.parametro_valores
  for each row execute function privado.validar_parametro_valor();

-- Escopo do valor deve pertencer ao tenant (reaproveita a validação de papéis).
create function privado.validar_escopo_parametro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.escopo in ('plataforma', 'tenant') then
    return new;
  end if;
  if not (case new.escopo
    when 'empresa' then exists (select 1 from public.empresas where id = new.escopo_id and tenant_id = new.tenant_id)
    when 'spe' then exists (select 1 from public.spes where id = new.escopo_id and tenant_id = new.tenant_id)
    when 'empreendimento' then exists (select 1 from public.empreendimentos where id = new.escopo_id and tenant_id = new.tenant_id)
  end) then
    raise exception 'Escopo % inexistente neste cliente.', new.escopo using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger validar_escopo_parametro
  before insert or update on public.parametro_valores
  for each row execute function privado.validar_escopo_parametro();

-- ---------------------------------------------------------------------------
-- Índices econômicos (globais). Escritos apenas pela rotina de importação (service role).
-- ---------------------------------------------------------------------------

create table public.indices_economicos (
  codigo text primary key,
  nome text not null,
  fonte text not null,
  serie_sgs integer unique
);

comment on column public.indices_economicos.serie_sgs is
  'Código da série no SGS do Banco Central. Conferir antes de ativar a importação.';

insert into public.indices_economicos (codigo, nome, fonte, serie_sgs) values
  ('IPCA', 'Índice Nacional de Preços ao Consumidor Amplo', 'IBGE via BCB/SGS', 433),
  ('IGP-M', 'Índice Geral de Preços do Mercado', 'FGV via BCB/SGS', 189),
  ('INCC', 'Índice Nacional de Custo da Construção', 'FGV via BCB/SGS', null);

create table public.indice_valores (
  codigo text not null references public.indices_economicos (codigo),
  competencia date not null check (extract(day from competencia) = 1),
  variacao_mensal numeric(12, 6) not null,
  importado_em timestamptz not null default now(),
  primary key (codigo, competencia)
);

comment on column public.indice_valores.variacao_mensal is 'Variação no mês, em percentual (0,39 = 0,39%).';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.parametros enable row level security;
alter table public.parametro_valores enable row level security;
alter table public.indices_economicos enable row level security;
alter table public.indice_valores enable row level security;

create policy "referência: leitura autenticada" on public.parametros
  for select to authenticated using (true);
create policy "referência: leitura autenticada" on public.indices_economicos
  for select to authenticated using (true);
create policy "referência: leitura autenticada" on public.indice_valores
  for select to authenticated using (true);

create policy "ler parâmetros" on public.parametro_valores for select to authenticated
  using (tenant_id is null or privado.pode('parametros.ler', tenant_id));

-- Escrita somente pela função definir_parametro (nova vigência, nunca sobrescreve).
revoke insert, update, delete, truncate on public.parametros, public.parametro_valores,
  public.indices_economicos, public.indice_valores from authenticated, anon;

select privado.instrumentar('public.parametro_valores');
