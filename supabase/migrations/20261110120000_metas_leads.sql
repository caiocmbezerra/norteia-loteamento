-- Fase 4b · Metas comerciais (por mês, do empreendimento ou de um corretor) e leads simples.
-- O realizado das metas sai das vendas registradas; nada é digitado.

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  empreendimento_id uuid not null,
  corretor_id uuid,
  nome text not null check (length(trim(nome)) between 2 and 200),
  telefone text check (telefone is null or length(telefone) <= 30),
  email text check (email is null or length(email) <= 200),
  origem text not null default 'outro'
    check (origem in ('site', 'indicacao', 'placa', 'redes_sociais', 'imobiliaria', 'evento', 'outro')),
  situacao text not null default 'novo'
    check (situacao in ('novo', 'em_contato', 'visita', 'proposta', 'ganho', 'perdido')),
  proximo_contato date,
  motivo_perda text check (motivo_perda is null or length(motivo_perda) <= 500),
  observacao text check (observacao is null or length(observacao) <= 1000),
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  check (situacao <> 'perdido' or length(trim(coalesce(motivo_perda, ''))) >= 3),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict,
  foreign key (tenant_id, corretor_id) references public.corretores (tenant_id, id) on delete restrict
);
create index leads_empreendimento_idx on public.leads (tenant_id, empreendimento_id, situacao);
create index leads_corretor_idx on public.leads (tenant_id, corretor_id) where corretor_id is not null;

comment on table public.leads is
  'Interessados por empreendimento, com origem e etapa do funil. Dados pessoais: só a gestão e o corretor do lead veem.';

-- Corretor do usuário atual no tenant (nulo se não for corretor cadastrado).
create function privado.meu_corretor(p_tenant uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select id from public.corretores where tenant_id = p_tenant and usuario_id = auth.uid() and ativo limit 1 $$;
revoke execute on function privado.meu_corretor(uuid) from public, anon;
grant execute on function privado.meu_corretor(uuid) to authenticated, service_role;

-- Corretor cadastra lead sempre em seu nome.
create function privado.lead_do_corretor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.pode('venda.registrar', new.tenant_id, 'empreendimento', new.empreendimento_id) then
    new.corretor_id := privado.meu_corretor(new.tenant_id);
  end if;
  return new;
end;
$$;
create trigger lead_do_corretor
  before insert or update of corretor_id on public.leads
  for each row execute function privado.lead_do_corretor();

alter table public.leads enable row level security;
create policy "ler leads" on public.leads for select to authenticated
  using (
    privado.pode('venda.registrar', tenant_id, 'empreendimento', empreendimento_id)
    or (privado.pode('comercial.cadastrar', tenant_id) and privado.e_corretor(corretor_id))
  );
create policy "cadastrar leads" on public.leads for insert to authenticated
  with check (privado.pode('comercial.cadastrar', tenant_id, 'empreendimento', empreendimento_id));
create policy "alterar leads" on public.leads for update to authenticated
  using (
    privado.pode('venda.registrar', tenant_id, 'empreendimento', empreendimento_id)
    or (privado.pode('comercial.cadastrar', tenant_id) and privado.e_corretor(corretor_id))
  )
  with check (privado.pode('comercial.cadastrar', tenant_id, 'empreendimento', empreendimento_id));
revoke delete, truncate on public.leads from authenticated, anon;
select privado.instrumentar('public.leads');

-- ---------------------------------------------------------------------------
-- Metas
-- ---------------------------------------------------------------------------

create table public.metas_comerciais (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  empreendimento_id uuid not null,
  -- Nulo = meta do empreendimento inteiro.
  corretor_id uuid,
  mes date not null check (extract(day from mes) = 1),
  vendas integer not null check (vendas between 0 and 10000),
  vgv_centavos bigint not null check (vgv_centavos >= 0),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict,
  foreign key (tenant_id, corretor_id) references public.corretores (tenant_id, id) on delete restrict
);
create unique index metas_comerciais_unica_idx on public.metas_comerciais
  (empreendimento_id, mes, coalesce(corretor_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index metas_comerciais_tenant_idx on public.metas_comerciais (tenant_id, empreendimento_id);
create index metas_comerciais_corretor_idx on public.metas_comerciais (tenant_id, corretor_id) where corretor_id is not null;

alter table public.metas_comerciais enable row level security;
create policy "ler metas" on public.metas_comerciais for select to authenticated
  using (
    privado.pode('comercial.ler', tenant_id, 'empreendimento', empreendimento_id)
    or privado.e_corretor(corretor_id)
  );
create policy "definir metas" on public.metas_comerciais for insert to authenticated
  with check (privado.pode('venda.registrar', tenant_id, 'empreendimento', empreendimento_id));
create policy "alterar metas" on public.metas_comerciais for update to authenticated
  using (privado.pode('venda.registrar', tenant_id, 'empreendimento', empreendimento_id))
  with check (privado.pode('venda.registrar', tenant_id, 'empreendimento', empreendimento_id));
create policy "remover metas" on public.metas_comerciais for delete to authenticated
  using (privado.pode('venda.registrar', tenant_id, 'empreendimento', empreendimento_id));
select privado.instrumentar('public.metas_comerciais');
