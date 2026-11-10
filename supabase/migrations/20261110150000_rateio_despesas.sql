-- Fase 3 · Rateio de despesas comuns entre empreendimentos. A despesa é dividida por um critério
-- (lotes, área, VGV de tabela ou percentuais informados) e vira uma conta a pagar em cada
-- empreendimento, que entra no custo e no fluxo de cada um como qualquer outra conta.

create table public.rateios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  descricao text not null check (length(trim(descricao)) >= 2),
  centro_codigo text not null,
  fornecedor_id uuid,
  valor_centavos bigint not null check (valor_centavos > 0),
  vencimento date not null,
  documento_numero text,
  criterio text not null check (criterio in ('lotes', 'area', 'vgv', 'manual')),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  foreign key (tenant_id, centro_codigo) references public.centros_custo (tenant_id, codigo) on update cascade,
  foreign key (tenant_id, fornecedor_id) references public.fornecedores (tenant_id, id) on delete restrict
);
create index rateios_tenant_idx on public.rateios (tenant_id, criado_em desc);
create index rateios_fornecedor_idx on public.rateios (tenant_id, fornecedor_id) where fornecedor_id is not null;
create index rateios_centro_idx on public.rateios (tenant_id, centro_codigo);

alter table public.contas_pagar add column rateio_id uuid;
alter table public.contas_pagar
  add foreign key (tenant_id, rateio_id) references public.rateios (tenant_id, id) on delete restrict;
create index contas_pagar_rateio_idx on public.contas_pagar (tenant_id, rateio_id) where rateio_id is not null;

alter table public.rateios enable row level security;
-- Quem lê o financeiro de algum empreendimento do rateio vê o rateio.
create policy "ler rateios" on public.rateios for select to authenticated
  using (exists (
    select 1 from public.contas_pagar cp
     where cp.rateio_id = rateios.id and privado.pode('financeiro.ler', cp.tenant_id, 'empreendimento', cp.empreendimento_id)
  ));
revoke insert, update, delete, truncate on public.rateios from authenticated, anon;
select privado.instrumentar('public.rateios');

-- Divide p_total pelos pesos, em centavos, sem perder nem sobrar: cada parte recebe o piso da sua
-- fração e os centavos restantes vão para as maiores sobras (empate: ordem informada).
create function privado.dividir_centavos(p_total bigint, p_pesos numeric[])
returns bigint[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_soma numeric := 0;
  v_partes bigint[] := '{}'::bigint[];
  v_resto bigint;
  v_i integer;
begin
  select coalesce(sum(p), 0) into v_soma from unnest(p_pesos) p;
  if v_soma <= 0 then
    raise exception 'Os pesos do rateio somam zero.' using errcode = 'check_violation', hint = 'criterio';
  end if;
  select array_agg(floor(p_total * p / v_soma)::bigint order by i)
    into v_partes
    from unnest(p_pesos) with ordinality u(p, i);
  v_resto := p_total - (select sum(x) from unnest(v_partes) x);
  for v_i in
    select i from unnest(p_pesos) with ordinality u(p, i)
     order by (p_total * p / v_soma) - floor(p_total * p / v_soma) desc, i
     limit v_resto
  loop
    v_partes[v_i] := v_partes[v_i] + 1;
  end loop;
  return v_partes;
end;
$$;
grant execute on function privado.dividir_centavos(bigint, numeric[]) to authenticated, service_role;

-- p_rateio: descricao, centro_codigo, fornecedor_id, valor_centavos, vencimento, documento_numero,
-- criterio; p_empreendimentos: ids; p_percentuais (só manual): {empreendimento_id: fração}.
create function public.ratear_despesa(p_rateio jsonb, p_empreendimentos uuid[], p_percentuais jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_criterio text := p_rateio ->> 'criterio';
  v_total bigint := (p_rateio ->> 'valor_centavos')::bigint;
  v_ids uuid[];
  v_pesos numeric[];
  v_partes bigint[];
  v_id uuid;
begin
  select array_agg(distinct x) into v_ids from unnest(p_empreendimentos) x;
  if coalesce(array_length(v_ids, 1), 0) < 2 then
    raise exception 'Escolha ao menos dois empreendimentos para ratear.' using errcode = 'check_violation', hint = 'empreendimentos';
  end if;
  select min(e.tenant_id::text)::uuid into v_tenant from public.empreendimentos e where e.id = any (v_ids);
  if (select count(*) from public.empreendimentos e where e.id = any (v_ids) and e.tenant_id = v_tenant) <> array_length(v_ids, 1)
     or exists (select 1 from unnest(v_ids) x where not privado.pode('custos.editar', v_tenant, 'empreendimento', x)) then
    raise exception 'Sem permissão para lançar custos em todos os empreendimentos escolhidos.' using errcode = 'insufficient_privilege';
  end if;
  if v_total is null or v_total <= 0 then
    raise exception 'Informe o valor da despesa.' using errcode = 'check_violation', hint = 'valor';
  end if;

  -- Ordem estável: pelo nome do empreendimento.
  select array_agg(e.id order by e.nome, e.id) into v_ids from public.empreendimentos e where e.id = any (v_ids);
  v_pesos := case v_criterio
    when 'lotes' then (select array_agg((select count(*) from public.lotes l where l.empreendimento_id = x)::numeric order by o) from unnest(v_ids) with ordinality u(x, o))
    when 'area' then (select array_agg(coalesce((select sum(l.area_m2) from public.lotes l where l.empreendimento_id = x), 0) order by o) from unnest(v_ids) with ordinality u(x, o))
    when 'vgv' then (select array_agg(coalesce((select sum(l.preco_base_centavos) from public.lotes l where l.empreendimento_id = x), 0)::numeric order by o) from unnest(v_ids) with ordinality u(x, o))
    when 'manual' then (select array_agg(coalesce((p_percentuais ->> x::text)::numeric, 0) order by o) from unnest(v_ids) with ordinality u(x, o))
  end;
  if v_pesos is null then
    raise exception 'Critério de rateio inválido.' using errcode = 'check_violation', hint = 'criterio';
  end if;
  if v_criterio = 'manual' and (
       exists (select 1 from unnest(v_pesos) p where p <= 0)
       or (select sum(p) from unnest(v_pesos) p) <> 1
  ) then
    raise exception 'Os percentuais precisam ser positivos e somar 100%%.' using errcode = 'check_violation', hint = 'criterio';
  end if;
  if exists (select 1 from unnest(v_pesos) p where p <= 0) then
    raise exception 'Algum empreendimento não tem base para este critério (sem lotes, área ou preço).'
      using errcode = 'check_violation', hint = 'criterio';
  end if;
  v_partes := privado.dividir_centavos(v_total, v_pesos);

  insert into public.rateios (tenant_id, descricao, centro_codigo, fornecedor_id, valor_centavos, vencimento, documento_numero, criterio)
  values (
    v_tenant, trim(p_rateio ->> 'descricao'), p_rateio ->> 'centro_codigo', nullif(p_rateio ->> 'fornecedor_id', '')::uuid,
    v_total, (p_rateio ->> 'vencimento')::date, nullif(trim(coalesce(p_rateio ->> 'documento_numero', '')), ''), v_criterio
  ) returning id into v_id;

  for v_i in 1 .. array_length(v_ids, 1) loop
    if v_partes[v_i] > 0 then
      insert into public.contas_pagar (
        tenant_id, empreendimento_id, centro_codigo, fornecedor_id, descricao, valor_centavos, vencimento, documento_numero, rateio_id
      ) values (
        v_tenant, v_ids[v_i], p_rateio ->> 'centro_codigo', nullif(p_rateio ->> 'fornecedor_id', '')::uuid,
        trim(p_rateio ->> 'descricao') || ' (rateio)', v_partes[v_i], (p_rateio ->> 'vencimento')::date,
        nullif(trim(coalesce(p_rateio ->> 'documento_numero', '')), ''), v_id
      );
    end if;
  end loop;
  return v_id;
end;
$$;
revoke execute on function public.ratear_despesa(jsonb, uuid[], jsonb) from public, anon;
grant execute on function public.ratear_despesa(jsonb, uuid[], jsonb) to authenticated;
