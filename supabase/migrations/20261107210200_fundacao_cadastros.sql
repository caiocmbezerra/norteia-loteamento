-- Fase 1 · Fundação (3/5): empresas, SPEs, glebas, empreendimentos, etapas, quadras e lotes.
-- Chaves estrangeiras compostas com tenant_id impedem, por construção, referência entre clientes.
-- docs/arquitetura.md §7 · RN-G01, RN-G02, RN-G07, RN-C04.

create type public.empreendimento_tipo as enum ('loteamento', 'desmembramento', 'condominio_lotes');

create type public.empreendimento_situacao as enum (
  'estudo',
  'aprovacao',
  'registrado',
  'em_vendas',
  'encerrado'
);

create type public.gleba_situacao as enum (
  'identificada',
  'em_analise',
  'negociando',
  'adquirida',
  'descartada'
);

create type public.lote_status as enum ('disponivel', 'reservado', 'vendido', 'bloqueado', 'permuta');

-- ---------------------------------------------------------------------------
-- Empresas e SPEs
-- ---------------------------------------------------------------------------

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  razao_social text not null check (length(trim(razao_social)) >= 2),
  nome_fantasia text,
  cnpj text check (privado.cnpj_valido(cnpj)),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id)
);

create unique index empresas_cnpj_idx on public.empresas (tenant_id, cnpj) where cnpj is not null;

create table public.spes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  empresa_id uuid not null,
  razao_social text not null check (length(trim(razao_social)) >= 2),
  cnpj text check (privado.cnpj_valido(cnpj)),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  foreign key (tenant_id, empresa_id) references public.empresas (tenant_id, id) on delete restrict
);

create unique index spes_cnpj_idx on public.spes (tenant_id, cnpj) where cnpj is not null;
create index spes_empresa_idx on public.spes (empresa_id);

comment on table public.spes is
  'Sociedade de Propósito Específico. O regime tributário é parâmetro com vigência (tributario.regime).';

-- ---------------------------------------------------------------------------
-- Glebas (prospecção). Geometria em WGS 84.
-- ---------------------------------------------------------------------------

create table public.glebas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nome text not null check (length(trim(nome)) >= 2),
  situacao public.gleba_situacao not null default 'identificada',
  municipio text,
  uf char(2) check (uf ~ '^[A-Z]{2}$'),
  area_m2 numeric(14, 2) check (area_m2 > 0),
  matriculas text[] not null default '{}',
  poligono extensions.geometry(MultiPolygon, 4326),
  ponto extensions.geometry(Point, 4326),
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id)
);

create index glebas_poligono_idx on public.glebas using gist (poligono);
create index glebas_tenant_situacao_idx on public.glebas (tenant_id, situacao);

-- ---------------------------------------------------------------------------
-- Empreendimentos, etapas, quadras e lotes
-- ---------------------------------------------------------------------------

create table public.empreendimentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  spe_id uuid not null,
  gleba_id uuid,
  nome text not null check (length(trim(nome)) >= 2),
  tipo public.empreendimento_tipo not null default 'loteamento',
  situacao public.empreendimento_situacao not null default 'estudo',
  municipio text,
  uf char(2) check (uf ~ '^[A-Z]{2}$'),
  data_base date not null check (extract(day from data_base) = 1),
  data_registro date,
  registro_matricula text,
  area_total_m2 numeric(14, 2) check (area_total_m2 > 0),
  area_vendavel_m2 numeric(14, 2) check (area_vendavel_m2 > 0),
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  foreign key (tenant_id, spe_id) references public.spes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, gleba_id) references public.glebas (tenant_id, id) on delete set null (gleba_id),
  check (area_vendavel_m2 is null or area_total_m2 is null or area_vendavel_m2 <= area_total_m2),
  -- Situação "registrado" em diante exige a data de registro (Lei 6.766, RN-C01).
  check (situacao in ('estudo', 'aprovacao') or data_registro is not null)
);

comment on column public.empreendimentos.data_base is 'Mês 0 do fluxo de caixa (sempre dia 1). RN-F04.';
comment on column public.empreendimentos.data_registro is
  'Data do registro do loteamento em cartório. Sem ela, a venda é bloqueada (RN-C01).';

create index empreendimentos_spe_idx on public.empreendimentos (spe_id);

create table public.etapas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  empreendimento_id uuid not null,
  nome text not null check (length(trim(nome)) >= 1),
  ordem smallint not null default 1,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, empreendimento_id, id),
  unique (empreendimento_id, nome),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete cascade
);

create table public.quadras (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  empreendimento_id uuid not null,
  etapa_id uuid,
  codigo text not null check (length(trim(codigo)) between 1 and 20),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, empreendimento_id, id),
  unique (empreendimento_id, codigo),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete cascade,
  foreign key (tenant_id, empreendimento_id, etapa_id)
    references public.etapas (tenant_id, empreendimento_id, id) on delete set null (etapa_id)
);

create table public.lotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  empreendimento_id uuid not null,
  quadra_id uuid not null,
  numero text not null check (length(trim(numero)) between 1 and 20),
  area_m2 numeric(12, 2) not null check (area_m2 > 0),
  testada_m numeric(10, 2) check (testada_m > 0),
  preco_base_centavos bigint check (preco_base_centavos >= 0),
  status public.lote_status not null default 'disponivel',
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  unique (quadra_id, numero),
  foreign key (tenant_id, empreendimento_id, quadra_id)
    references public.quadras (tenant_id, empreendimento_id, id) on delete restrict
);

comment on column public.lotes.preco_base_centavos is
  'Preço de referência no cadastro. A tabela de preços com vigência entra na Fase 4.';

create index lotes_empreendimento_status_idx on public.lotes (empreendimento_id, status);

-- ---------------------------------------------------------------------------
-- Regras
-- ---------------------------------------------------------------------------

-- RN-C04: reservado e vendido só por funções do módulo comercial (Fase 4) ou distrato,
-- que ligam app.transicao_lote na própria transação. Pelo cadastro, só
-- disponível, bloqueado e permuta.
create function privado.validar_status_lote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.transicao_lote', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.status in ('reservado', 'vendido') then
    raise exception 'Lote não pode ser cadastrado como %; use o fluxo comercial.', new.status
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and (new.status in ('reservado', 'vendido') or old.status in ('reservado', 'vendido')) then
    raise exception 'Transição de % para % só pelo fluxo comercial ou distrato (RN-C04).',
      old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger validar_status_lote
  before insert or update of status on public.lotes
  for each row execute function privado.validar_status_lote();

-- RN-G07: limite de lotes sob gestão pelo plano do tenant.
create function privado.verificar_limite_lotes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_total integer;
begin
  select p.max_lotes into v_limite
    from public.tenants t
    join public.planos p on p.id = t.plano_id
   where t.id = new.tenant_id;

  if v_limite is null then
    return new;
  end if;

  -- Serializa inserções concorrentes do mesmo tenant.
  perform pg_advisory_xact_lock(hashtextextended('limite_lotes:' || new.tenant_id::text, 0));
  select count(*) into v_total from public.lotes where tenant_id = new.tenant_id;
  if v_total >= v_limite then
    raise exception 'O plano contratado permite até % lotes sob gestão.', v_limite
      using errcode = 'check_violation', hint = 'plano_limite_lotes';
  end if;
  return new;
end;
$$;

create trigger verificar_limite_lotes
  before insert on public.lotes
  for each row execute function privado.verificar_limite_lotes();

-- Papéis só podem ter escopo dentro do próprio tenant.
create function privado.validar_escopo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  v_ok := case new.escopo_tipo
    when 'tenant' then true
    when 'empresa' then exists (select 1 from public.empresas where id = new.escopo_id and tenant_id = new.tenant_id)
    when 'spe' then exists (select 1 from public.spes where id = new.escopo_id and tenant_id = new.tenant_id)
    when 'empreendimento' then exists (select 1 from public.empreendimentos where id = new.escopo_id and tenant_id = new.tenant_id)
  end;
  if not v_ok then
    raise exception 'Escopo % inexistente neste cliente.', new.escopo_tipo
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger validar_escopo
  before insert or update on public.atribuicoes_papel
  for each row execute function privado.validar_escopo();

create trigger validar_escopo
  before insert or update on public.convites
  for each row execute function privado.validar_escopo();

grant execute on all functions in schema privado to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS. Leitura no próprio escopo; escrita checa o escopo do "pai" na inserção.
-- ---------------------------------------------------------------------------

alter table public.empresas enable row level security;
alter table public.spes enable row level security;
alter table public.glebas enable row level security;
alter table public.empreendimentos enable row level security;
alter table public.etapas enable row level security;
alter table public.quadras enable row level security;
alter table public.lotes enable row level security;

-- Empresas
create policy "ler empresas" on public.empresas for select to authenticated
  using (privado.pode('cadastro.ler', tenant_id, 'empresa', id));
create policy "criar empresas" on public.empresas for insert to authenticated
  with check (privado.pode('estrutura.editar', tenant_id));
create policy "alterar empresas" on public.empresas for update to authenticated
  using (privado.pode('estrutura.editar', tenant_id, 'empresa', id))
  with check (privado.pode('estrutura.editar', tenant_id, 'empresa', id));
create policy "excluir empresas" on public.empresas for delete to authenticated
  using (privado.pode('estrutura.editar', tenant_id));

-- SPEs
create policy "ler spes" on public.spes for select to authenticated
  using (privado.pode('cadastro.ler', tenant_id, 'spe', id));
create policy "criar spes" on public.spes for insert to authenticated
  with check (privado.pode('estrutura.editar', tenant_id, 'empresa', empresa_id));
create policy "alterar spes" on public.spes for update to authenticated
  using (privado.pode('estrutura.editar', tenant_id, 'spe', id))
  with check (privado.pode('estrutura.editar', tenant_id, 'empresa', empresa_id));
create policy "excluir spes" on public.spes for delete to authenticated
  using (privado.pode('estrutura.editar', tenant_id, 'empresa', empresa_id));

-- Glebas (nível do tenant: ainda não pertencem a uma SPE)
create policy "ler glebas" on public.glebas for select to authenticated
  using (privado.pode('gleba.ler', tenant_id) or privado.pode('gleba.editar', tenant_id));
create policy "criar glebas" on public.glebas for insert to authenticated
  with check (privado.pode('gleba.editar', tenant_id));
create policy "alterar glebas" on public.glebas for update to authenticated
  using (privado.pode('gleba.editar', tenant_id))
  with check (privado.pode('gleba.editar', tenant_id));
create policy "excluir glebas" on public.glebas for delete to authenticated
  using (privado.pode('gleba.editar', tenant_id));

-- Empreendimentos
create policy "ler empreendimentos" on public.empreendimentos for select to authenticated
  using (privado.pode('cadastro.ler', tenant_id, 'empreendimento', id));
create policy "criar empreendimentos" on public.empreendimentos for insert to authenticated
  with check (privado.pode('empreendimento.editar', tenant_id, 'spe', spe_id));
create policy "alterar empreendimentos" on public.empreendimentos for update to authenticated
  using (privado.pode('empreendimento.editar', tenant_id, 'empreendimento', id))
  with check (privado.pode('empreendimento.editar', tenant_id, 'spe', spe_id));
create policy "excluir empreendimentos" on public.empreendimentos for delete to authenticated
  using (privado.pode('empreendimento.editar', tenant_id, 'spe', spe_id));

-- Etapas, quadras e lotes: escopo do empreendimento
create policy "ler etapas" on public.etapas for select to authenticated
  using (privado.pode('cadastro.ler', tenant_id, 'empreendimento', empreendimento_id));
create policy "editar etapas" on public.etapas for all to authenticated
  using (privado.pode('empreendimento.editar', tenant_id, 'empreendimento', empreendimento_id))
  with check (privado.pode('empreendimento.editar', tenant_id, 'empreendimento', empreendimento_id));

create policy "ler quadras" on public.quadras for select to authenticated
  using (privado.pode('cadastro.ler', tenant_id, 'empreendimento', empreendimento_id));
create policy "editar quadras" on public.quadras for all to authenticated
  using (privado.pode('empreendimento.editar', tenant_id, 'empreendimento', empreendimento_id))
  with check (privado.pode('empreendimento.editar', tenant_id, 'empreendimento', empreendimento_id));

create policy "ler lotes" on public.lotes for select to authenticated
  using (privado.pode('cadastro.ler', tenant_id, 'empreendimento', empreendimento_id));
create policy "editar lotes" on public.lotes for all to authenticated
  using (privado.pode('empreendimento.editar', tenant_id, 'empreendimento', empreendimento_id))
  with check (privado.pode('empreendimento.editar', tenant_id, 'empreendimento', empreendimento_id));

select privado.instrumentar('public.empresas');
select privado.instrumentar('public.spes');
select privado.instrumentar('public.glebas');
select privado.instrumentar('public.empreendimentos');
select privado.instrumentar('public.etapas');
select privado.instrumentar('public.quadras');
select privado.instrumentar('public.lotes');
