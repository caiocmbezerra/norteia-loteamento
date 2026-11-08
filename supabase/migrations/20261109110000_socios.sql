-- Fase 6c · Sócios das SPEs (RN-S01 a RN-S03): participações com vigência, aportes, mútuos e
-- distribuições. O rateio do resultado e o retorno por sócio são calculados pelo motor.

insert into public.papel_permissoes (papel, permissao) values ('dono', 'socios.gerenciar');

create table public.socios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nome text not null check (length(trim(nome)) >= 2),
  documento text check (documento is null or documento ~ '^\d{11}$|^\d{14}$'),
  email extensions.citext,
  -- Acesso ao portal do sócio (Fase 7).
  usuario_id uuid references public.perfis (id) on delete set null,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id)
);

create table public.participacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  spe_id uuid not null,
  socio_id uuid not null,
  percentual numeric(9, 6) not null check (percentual > 0 and percentual <= 1),
  vigencia daterange not null check (not isempty(vigencia) and lower(vigencia) is not null),
  motivo text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  foreign key (tenant_id, spe_id) references public.spes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, socio_id) references public.socios (tenant_id, id) on delete restrict,
  constraint participacoes_sem_sobreposicao exclude using gist (spe_id with =, socio_id with =, vigencia with &&)
);

create table public.movimentos_socio (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  spe_id uuid not null,
  socio_id uuid not null,
  -- Aporte e mútuo entram no caixa da SPE; distribuição e devolução de mútuo saem.
  tipo text not null check (tipo in ('aporte', 'mutuo', 'devolucao_mutuo', 'distribuicao')),
  data date not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  observacao text,
  estornado_em timestamptz,
  motivo_estorno text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  check ((estornado_em is null) = (motivo_estorno is null)),
  foreign key (tenant_id, spe_id) references public.spes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, socio_id) references public.socios (tenant_id, id) on delete restrict
);

create index socios_tenant_idx on public.socios (tenant_id);
create index socios_usuario_idx on public.socios (usuario_id) where usuario_id is not null;
create index participacoes_spe_idx on public.participacoes (tenant_id, spe_id);
create index participacoes_socio_idx on public.participacoes (tenant_id, socio_id);
create index movimentos_socio_spe_idx on public.movimentos_socio (tenant_id, spe_id, data);
create index movimentos_socio_socio_idx on public.movimentos_socio (tenant_id, socio_id);

create trigger participacoes_por_funcao before update or delete on public.participacoes
  for each row execute function privado.carteira_somente_por_funcao();
create trigger movimentos_socio_por_funcao before update or delete on public.movimentos_socio
  for each row execute function privado.carteira_somente_por_funcao();

alter table public.socios enable row level security;
alter table public.participacoes enable row level security;
alter table public.movimentos_socio enable row level security;

-- Sócio com acesso vê só o que é dele (RN-S03); gestão financeira vê tudo.
create function privado.e_socio(p_socio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.socios where id = p_socio and usuario_id = auth.uid()) $$;

create policy "ler sócios" on public.socios for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id) or usuario_id = (select auth.uid()));
create policy "cadastrar sócios" on public.socios for insert to authenticated
  with check (privado.pode('socios.gerenciar', tenant_id));
create policy "alterar sócios" on public.socios for update to authenticated
  using (privado.pode('socios.gerenciar', tenant_id)) with check (privado.pode('socios.gerenciar', tenant_id));
create policy "ler participações" on public.participacoes for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id, 'spe', spe_id) or privado.e_socio(socio_id));
create policy "ler movimentos de sócio" on public.movimentos_socio for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id, 'spe', spe_id) or privado.e_socio(socio_id));
revoke insert, update, delete, truncate on public.participacoes, public.movimentos_socio from authenticated, anon;
revoke delete, truncate on public.socios from authenticated, anon;

select privado.instrumentar('public.socios');
select privado.instrumentar('public.participacoes');
select privado.instrumentar('public.movimentos_socio');

-- Nova participação a partir de p_inicio: encerra a vigente do sócio na véspera; a soma das
-- participações da SPE nunca passa de 100%.
create function public.definir_participacao(p_spe uuid, p_socio uuid, p_percentual numeric, p_inicio date, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.spes;
  v_id uuid;
  v_total numeric;
begin
  select * into s from public.spes where id = p_spe;
  if s.id is null or not privado.pode('socios.gerenciar', s.tenant_id) then
    raise exception 'Sem permissão para alterar participações.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.socios where id = p_socio and tenant_id = s.tenant_id) then
    raise exception 'Sócio não encontrado.' using errcode = 'foreign_key_violation';
  end if;
  if p_inicio is null or length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe a data de início e o motivo.' using errcode = 'check_violation';
  end if;
  perform set_config('app.carteira', 'on', true);
  perform set_config('app.motivo', p_motivo, true);
  delete from public.participacoes where spe_id = s.id and socio_id = p_socio and lower(vigencia) >= p_inicio;
  update public.participacoes set vigencia = daterange(lower(vigencia), p_inicio)
   where spe_id = s.id and socio_id = p_socio and vigencia @> p_inicio;
  if coalesce(p_percentual, 0) > 0 then
    insert into public.participacoes (tenant_id, spe_id, socio_id, percentual, vigencia, motivo)
    values (s.tenant_id, s.id, p_socio, p_percentual, daterange(p_inicio, null), trim(p_motivo))
    returning id into v_id;
  end if;
  -- Nenhuma data com participações somando mais de 100%.
  select max(t) into v_total from (
    select sum(p.percentual) as t
      from public.participacoes p
      join (select distinct lower(vigencia) as d from public.participacoes where spe_id = s.id) datas
        on p.vigencia @> datas.d
     where p.spe_id = s.id
     group by datas.d
  ) x;
  if v_total > 1 then
    raise exception 'As participações da SPE passariam de 100%%.' using errcode = 'check_violation', hint = 'percentual';
  end if;
  perform set_config('app.carteira', '', true);
  return v_id;
end;
$$;

create function public.registrar_movimento_socio(p_spe uuid, p_socio uuid, p_tipo text, p_data date, p_valor bigint, p_observacao text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.spes;
  v_id uuid;
begin
  select * into s from public.spes where id = p_spe;
  if s.id is null or not privado.pode('socios.gerenciar', s.tenant_id) then
    raise exception 'Sem permissão para registrar movimentos de sócios.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.socios where id = p_socio and tenant_id = s.tenant_id) then
    raise exception 'Sócio não encontrado.' using errcode = 'foreign_key_violation';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Informe o valor.' using errcode = 'check_violation', hint = 'valor';
  end if;
  if p_data is null or p_data > current_date then
    raise exception 'A data não pode estar no futuro.' using errcode = 'check_violation';
  end if;
  insert into public.movimentos_socio (tenant_id, spe_id, socio_id, tipo, data, valor_centavos, observacao)
  values (s.tenant_id, s.id, p_socio, p_tipo, p_data, p_valor, nullif(trim(coalesce(p_observacao, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.estornar_movimento_socio(p_movimento uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.movimentos_socio;
begin
  select * into m from public.movimentos_socio where id = p_movimento for update;
  if m.id is null or not privado.pode('socios.gerenciar', m.tenant_id) then
    raise exception 'Sem permissão para estornar movimentos de sócios.' using errcode = 'insufficient_privilege';
  end if;
  if m.estornado_em is not null then
    raise exception 'O movimento já foi estornado.' using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo do estorno.' using errcode = 'check_violation';
  end if;
  perform set_config('app.carteira', 'on', true);
  perform set_config('app.motivo', p_motivo, true);
  update public.movimentos_socio set estornado_em = now(), motivo_estorno = trim(p_motivo) where id = m.id;
  perform set_config('app.carteira', '', true);
end;
$$;

revoke execute on function public.definir_participacao(uuid, uuid, numeric, date, text) from public, anon;
revoke execute on function public.registrar_movimento_socio(uuid, uuid, text, date, bigint, text) from public, anon;
revoke execute on function public.estornar_movimento_socio(uuid, text) from public, anon;
grant execute on function public.definir_participacao(uuid, uuid, numeric, date, text) to authenticated;
grant execute on function public.registrar_movimento_socio(uuid, uuid, text, date, bigint, text) to authenticated;
grant execute on function public.estornar_movimento_socio(uuid, text) to authenticated;
grant execute on function privado.e_socio(uuid) to authenticated, service_role;
revoke execute on function privado.e_socio(uuid) from public, anon;
