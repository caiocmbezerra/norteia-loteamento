-- Fase 1 · Fundação (2/5): planos, tenants, perfis, membros, papéis com escopo e convites.
-- docs/arquitetura.md §8 · docs/decisoes.md D-003 · RN-G01, RN-G07.

-- ---------------------------------------------------------------------------
-- Planos e funcionalidades (RN-G07). Dados de referência, globais.
-- ---------------------------------------------------------------------------

create table public.planos (
  id text primary key,
  nome text not null,
  max_lotes integer check (max_lotes is null or max_lotes > 0),
  ordem smallint not null default 0
);

comment on column public.planos.max_lotes is 'Limite de lotes sob gestão no tenant. Nulo = sem limite.';

create table public.funcionalidades (
  chave text primary key,
  descricao text not null
);

create table public.plano_funcionalidades (
  plano_id text not null references public.planos (id) on delete cascade,
  funcionalidade text not null references public.funcionalidades (chave) on delete cascade,
  primary key (plano_id, funcionalidade)
);

-- Faixas PROVISÓRIAS: o preço e os limites definitivos são decisão comercial (D-016).
insert into public.planos (id, nome, max_lotes, ordem) values
  ('essencial', 'Essencial', 200, 1),
  ('profissional', 'Profissional', 1500, 2),
  ('empresarial', 'Empresarial', null, 3),
  ('demonstracao', 'Demonstração', null, 9);

insert into public.funcionalidades (chave, descricao) values
  ('multi_spe', 'Mais de uma empresa e SPE'),
  ('socios', 'Sócios, aportes e distribuição'),
  ('permuta_financeira', 'Permuta financeira com repasse automático'),
  ('cobranca_automatica', 'Boleto/Pix, conciliação e régua de cobrança'),
  ('portal_socio', 'Portal somente leitura para sócios e permutantes'),
  ('exportacao_contabil', 'Exportação para o contador'),
  ('ia', 'Assistente com inteligência artificial');

insert into public.plano_funcionalidades (plano_id, funcionalidade)
select p.id, f.chave
  from public.planos p
 cross join public.funcionalidades f
 where p.id in ('profissional', 'empresarial', 'demonstracao')
    or (p.id = 'essencial' and f.chave in ('cobranca_automatica'));

-- ---------------------------------------------------------------------------
-- Tenant (cliente da NorteIA): unidade de isolamento e de cobrança.
-- ---------------------------------------------------------------------------

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) between 2 and 120),
  plano_id text not null default 'essencial' references public.planos (id),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

-- ---------------------------------------------------------------------------
-- Perfil do usuário (um por usuário do Supabase Auth). D-003: pessoa_global_id
-- permite unificar o login da família NorteIA no futuro.
-- ---------------------------------------------------------------------------

create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  email extensions.citext not null,
  pessoa_global_id uuid not null unique default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create function privado.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''), coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger criar_perfil
  after insert on auth.users
  for each row execute function privado.criar_perfil();

-- ---------------------------------------------------------------------------
-- Membros e papéis
-- ---------------------------------------------------------------------------

create table public.membros (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, usuario_id),
  unique (tenant_id, id)
);

create index membros_usuario_idx on public.membros (usuario_id) where ativo;

create table public.papel_permissoes (
  papel public.papel not null,
  permissao text not null,
  primary key (papel, permissao)
);

comment on table public.papel_permissoes is
  'O que cada papel pode fazer. Referência global; alterar exige migration.';

insert into public.papel_permissoes (papel, permissao)
select papel::public.papel, permissao
  from (values
    ('dono', 'tenant.administrar'),
    ('dono', 'membros.gerenciar'),
    ('dono', 'auditoria.ler'),
    ('financeiro', 'auditoria.ler'),
    ('contador', 'auditoria.ler'),
    ('dono', 'estrutura.editar'),
    ('financeiro', 'estrutura.editar'),
    ('dono', 'empreendimento.editar'),
    ('engenharia', 'empreendimento.editar'),
    ('comercial_gestor', 'empreendimento.editar'),
    ('dono', 'gleba.editar'),
    ('engenharia', 'gleba.editar'),
    ('dono', 'parametros.editar'),
    ('financeiro', 'parametros.editar'),
    ('dono', 'parametros.ler'),
    ('financeiro', 'parametros.ler'),
    ('engenharia', 'parametros.ler'),
    ('contador', 'parametros.ler'),
    ('comercial_gestor', 'parametros.ler')
  ) as v (papel, permissao)
union all
-- Quem lê os cadastros: todos os papéis internos, corretor (disponibilidade, RN-C07)
-- e sócio. O permutante só verá o próprio extrato (Fase 6).
select papel, 'cadastro.ler'
  from unnest(enum_range(null::public.papel)) as papel
 where papel <> 'permutante_leitura'
union all
select papel, 'gleba.ler'
  from unnest(array['dono', 'engenharia', 'financeiro', 'comercial_gestor']::public.papel[]) as papel;

create table public.atribuicoes_papel (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  membro_id uuid not null,
  papel public.papel not null,
  escopo_tipo public.escopo not null default 'tenant',
  escopo_id uuid,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  foreign key (tenant_id, membro_id) references public.membros (tenant_id, id) on delete cascade,
  check ((escopo_tipo = 'tenant') = (escopo_id is null))
);

create unique index atribuicoes_papel_unica_idx
  on public.atribuicoes_papel (membro_id, papel, escopo_tipo, coalesce(escopo_id, '00000000-0000-0000-0000-000000000000'));

-- ---------------------------------------------------------------------------
-- Convites
-- ---------------------------------------------------------------------------

create table public.convites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email extensions.citext not null,
  papel public.papel not null,
  escopo_tipo public.escopo not null default 'tenant',
  escopo_id uuid,
  token_hash bytea not null unique,
  expira_em timestamptz not null,
  aceito_em timestamptz,
  aceito_por uuid,
  cancelado_em timestamptz,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  check ((escopo_tipo = 'tenant') = (escopo_id is null))
);

-- ---------------------------------------------------------------------------
-- Autorização (usada pelas políticas de RLS)
-- ---------------------------------------------------------------------------

create function privado.e_membro(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membros m
     where m.tenant_id = p_tenant and m.usuario_id = auth.uid() and m.ativo
  );
$$;

-- O usuário atual tem a permissão no tenant, no escopo indicado?
-- Um papel no tenant vale para tudo; num escopo, vale para ele e para o que está abaixo dele.
-- Para 'tenant' só valem papéis atribuídos no tenant inteiro.
create function privado.pode(
  p_permissao text,
  p_tenant uuid,
  p_escopo public.escopo default 'tenant',
  p_escopo_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_empresa uuid;
  v_spe uuid;
  v_empreendimento uuid;
begin
  if v_uid is null or p_tenant is null then
    return false;
  end if;

  if p_escopo = 'empreendimento' then
    select e.id, e.spe_id, s.empresa_id
      into v_empreendimento, v_spe, v_empresa
      from public.empreendimentos e
      join public.spes s on s.id = e.spe_id
     where e.id = p_escopo_id and e.tenant_id = p_tenant;
  elsif p_escopo = 'spe' then
    select s.id, s.empresa_id into v_spe, v_empresa
      from public.spes s
     where s.id = p_escopo_id and s.tenant_id = p_tenant;
  elsif p_escopo = 'empresa' then
    select em.id into v_empresa
      from public.empresas em
     where em.id = p_escopo_id and em.tenant_id = p_tenant;
  end if;

  return exists (
    select 1
      from public.membros m
      join public.atribuicoes_papel a on a.membro_id = m.id
      join public.papel_permissoes pp on pp.papel = a.papel
     where m.usuario_id = v_uid
       and m.tenant_id = p_tenant
       and m.ativo
       and pp.permissao = p_permissao
       and (
         a.escopo_tipo = 'tenant'
         or (a.escopo_tipo = 'empresa' and a.escopo_id = v_empresa)
         or (a.escopo_tipo = 'spe' and a.escopo_id = v_spe)
         or (a.escopo_tipo = 'empreendimento' and a.escopo_id = v_empreendimento)
       )
  );
end;
$$;

-- Funcionalidade liberada pelo plano do tenant (RN-G07).
create function privado.tem_funcionalidade(p_tenant uuid, p_chave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.tenants t
      join public.plano_funcionalidades pf on pf.plano_id = t.plano_id
     where t.id = p_tenant and pf.funcionalidade = p_chave
  );
$$;

grant execute on all functions in schema privado to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.planos enable row level security;
alter table public.funcionalidades enable row level security;
alter table public.plano_funcionalidades enable row level security;
alter table public.papel_permissoes enable row level security;
alter table public.tenants enable row level security;
alter table public.perfis enable row level security;
alter table public.membros enable row level security;
alter table public.atribuicoes_papel enable row level security;
alter table public.convites enable row level security;
alter table public.auditoria enable row level security;

create policy "referência: leitura autenticada" on public.planos
  for select to authenticated using (true);
create policy "referência: leitura autenticada" on public.funcionalidades
  for select to authenticated using (true);
create policy "referência: leitura autenticada" on public.plano_funcionalidades
  for select to authenticated using (true);
create policy "referência: leitura autenticada" on public.papel_permissoes
  for select to authenticated using (true);

create policy "membros leem o tenant" on public.tenants
  for select to authenticated using (privado.e_membro(id));
create policy "dono altera o tenant" on public.tenants
  for update to authenticated
  using (privado.pode('tenant.administrar', id))
  with check (privado.pode('tenant.administrar', id));

-- Colega = alguém que é membro de um tenant em que o usuário atual está ativo.
create function privado.e_colega(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.membros eu
      join public.membros outro on outro.tenant_id = eu.tenant_id
     where eu.usuario_id = auth.uid() and eu.ativo and outro.usuario_id = p_usuario
  );
$$;

grant execute on function privado.e_colega(uuid) to authenticated, service_role;

create policy "usuário lê o próprio perfil e o de colegas" on public.perfis
  for select to authenticated using (id = auth.uid() or privado.e_colega(id));
create policy "usuário altera o próprio perfil" on public.perfis
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "membro vê a si mesmo; dono vê todos" on public.membros
  for select to authenticated
  using (usuario_id = auth.uid() or privado.pode('membros.gerenciar', tenant_id));
create policy "dono ativa e desativa membros" on public.membros
  for update to authenticated
  using (privado.pode('membros.gerenciar', tenant_id))
  with check (privado.pode('membros.gerenciar', tenant_id));

create policy "membro vê os próprios papéis; dono vê todos" on public.atribuicoes_papel
  for select to authenticated using (
    privado.pode('membros.gerenciar', tenant_id)
    or exists (
      select 1 from public.membros m
       where m.id = atribuicoes_papel.membro_id and m.usuario_id = auth.uid()
    )
  );
create policy "dono atribui papéis" on public.atribuicoes_papel
  for insert to authenticated with check (privado.pode('membros.gerenciar', tenant_id));
create policy "dono remove papéis" on public.atribuicoes_papel
  for delete to authenticated using (privado.pode('membros.gerenciar', tenant_id));

create policy "dono vê convites" on public.convites
  for select to authenticated using (privado.pode('membros.gerenciar', tenant_id));
create policy "dono cancela convites" on public.convites
  for update to authenticated
  using (privado.pode('membros.gerenciar', tenant_id))
  with check (privado.pode('membros.gerenciar', tenant_id));

create policy "auditoria: leitura por permissão" on public.auditoria
  for select to authenticated using (privado.pode('auditoria.ler', tenant_id));

-- Ninguém escreve na auditoria diretamente; só o gatilho (security definer).
revoke insert, update, delete, truncate on public.auditoria from authenticated, anon;
-- Planos e permissões só mudam por migration.
revoke insert, update, delete, truncate on public.planos, public.funcionalidades,
  public.plano_funcionalidades, public.papel_permissoes from authenticated, anon;

select privado.instrumentar('public.tenants');
select privado.instrumentar('public.perfis');
select privado.instrumentar('public.membros');
select privado.instrumentar('public.atribuicoes_papel');
select privado.instrumentar('public.convites');
