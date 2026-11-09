-- Fase 4b · Tabela de preços com vigência e aprovação de desconto (RN-C05).
-- A venda usa o preço da tabela vigente na data da venda. Desconto acima do limite configurado
-- (comercial.desconto_maximo_sem_aprovacao, por cliente ou empreendimento) só passa com a
-- aprovação de quem tem venda.aprovar_desconto (dono), pedida antes e válida por alguns dias.

insert into public.papel_permissoes (papel, permissao) values
  ('dono', 'comercial.tabela_precos'),
  ('comercial_gestor', 'comercial.tabela_precos'),
  ('dono', 'venda.aprovar_desconto');

insert into public.parametros (chave, descricao, tipo, unidade, pendencia_legal) values
  ('comercial.validade_aprovacao_desconto_dias', 'Dias para usar uma aprovação de desconto antes que ela expire', 'inteiro', 'dias', null);
insert into public.parametro_valores (tenant_id, chave, escopo, escopo_id, valor, vigencia, motivo) values
  (null, 'comercial.validade_aprovacao_desconto_dias', 'plataforma', null, '7', daterange('2026-01-01', null), 'Sugestão da plataforma');

-- ---------------------------------------------------------------------------
-- Tabelas de preço
-- ---------------------------------------------------------------------------

create table public.tabelas_preco (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  empreendimento_id uuid not null,
  nome text not null check (length(trim(nome)) between 2 and 80),
  vigente_desde date not null,
  -- Reajuste aplicado sobre a tabela anterior (informativo; os preços ficam nos itens).
  reajuste numeric(8, 6) not null default 0,
  lotes integer not null,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  unique (empreendimento_id, vigente_desde),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict
);
create index tabelas_preco_tenant_empreendimento_idx on public.tabelas_preco (tenant_id, empreendimento_id);

comment on table public.tabelas_preco is
  'Tabela de preços do empreendimento, vigente a partir de uma data (RN-C05). Publicada pela função publicar_tabela_preco; não se altera.';

create table public.tabela_preco_itens (
  tabela_id uuid not null,
  tenant_id uuid not null,
  lote_id uuid not null,
  preco_centavos bigint not null check (preco_centavos > 0),
  primary key (tabela_id, lote_id),
  foreign key (tenant_id, tabela_id) references public.tabelas_preco (tenant_id, id) on delete cascade,
  foreign key (tenant_id, lote_id) references public.lotes (tenant_id, id) on delete cascade
);
create index tabela_preco_itens_lote_idx on public.tabela_preco_itens (lote_id);
create index tabela_preco_itens_tenant_idx on public.tabela_preco_itens (tenant_id, tabela_id);

alter table public.tabelas_preco enable row level security;
alter table public.tabela_preco_itens enable row level security;
create policy "ler tabelas de preço" on public.tabelas_preco for select to authenticated
  using (privado.pode('cadastro.ler', tenant_id, 'empreendimento', empreendimento_id));
create policy "ler itens da tabela de preço" on public.tabela_preco_itens for select to authenticated
  using (exists (
    select 1 from public.tabelas_preco t
     where t.id = tabela_id and privado.pode('cadastro.ler', t.tenant_id, 'empreendimento', t.empreendimento_id)
  ));
revoke insert, update, delete, truncate on public.tabelas_preco, public.tabela_preco_itens from authenticated, anon;
-- Os itens nascem com a tabela e não mudam; a auditoria fica na tabela.
select privado.instrumentar('public.tabelas_preco');

-- Preço de tabela do lote numa data: o da tabela vigente que inclui o lote; sem tabela, o preço
-- de cadastro do lote.
create function public.preco_tabela(p_lote uuid, p_data date)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select i.preco_centavos
       from public.tabela_preco_itens i
       join public.tabelas_preco t on t.id = i.tabela_id
      where i.lote_id = p_lote and t.vigente_desde <= p_data
      order by t.vigente_desde desc
      limit 1),
    (select l.preco_base_centavos from public.lotes l where l.id = p_lote)
  )
$$;
revoke execute on function public.preco_tabela(uuid, date) from public, anon;
grant execute on function public.preco_tabela(uuid, date) to authenticated, service_role;

-- Lote que está numa tabela tem o preço de cadastro mantido pela tabela vigente.
create function privado.proteger_preco_lote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.preco_base_centavos is distinct from old.preco_base_centavos
     and coalesce(current_setting('app.tabela_preco', true), '') <> 'on'
     and exists (select 1 from public.tabela_preco_itens where lote_id = new.id) then
    raise exception 'O preço deste lote segue a tabela de preços; publique uma nova tabela para mudá-lo.'
      using errcode = 'check_violation', hint = 'tabela_preco';
  end if;
  return new;
end;
$$;
create trigger proteger_preco_lote
  before update of preco_base_centavos on public.lotes
  for each row execute function privado.proteger_preco_lote();

-- Atualiza o preço de cadastro dos lotes para o da tabela vigente hoje.
create function privado.sincronizar_precos(p_empreendimento uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  perform set_config('app.tabela_preco', 'on', true);
  with vigente as (
    select distinct on (i.lote_id) i.lote_id, i.preco_centavos
      from public.tabela_preco_itens i
      join public.tabelas_preco t on t.id = i.tabela_id
     where t.vigente_desde <= current_date
       and (p_empreendimento is null or t.empreendimento_id = p_empreendimento)
     order by i.lote_id, t.vigente_desde desc
  )
  update public.lotes l set preco_base_centavos = v.preco_centavos
    from vigente v
   where l.id = v.lote_id and l.preco_base_centavos is distinct from v.preco_centavos;
  get diagnostics v_total = row_count;
  perform set_config('app.tabela_preco', '', true);
  return v_total;
end;
$$;
revoke execute on function privado.sincronizar_precos(uuid) from public, anon, authenticated;
grant execute on function privado.sincronizar_precos(uuid) to service_role;

-- Tabelas com vigência futura passam a valer no dia (00h10 em São Paulo).
select cron.schedule('aplicar-tabelas-preco', '10 3 * * *', 'select privado.sincronizar_precos()');

-- Publica uma tabela: os preços vigentes na data, reajustados por p_reajuste (fração, ex.: 0.05),
-- com os preços informados em p_precos ({lote_id: centavos}) no lugar do reajuste.
create function public.publicar_tabela_preco(
  p_empreendimento uuid,
  p_nome text,
  p_vigente_desde date,
  p_reajuste numeric default 0,
  p_precos jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.empreendimentos;
  v_id uuid;
  v_total integer;
  v_estranho text;
begin
  select * into e from public.empreendimentos where id = p_empreendimento for update;
  if e.id is null or not privado.pode('comercial.tabela_precos', e.tenant_id, 'empreendimento', e.id) then
    raise exception 'Sem permissão para publicar tabelas de preço.' using errcode = 'insufficient_privilege';
  end if;
  if p_vigente_desde is null or p_vigente_desde < current_date then
    raise exception 'A tabela vale de hoje em diante; não é possível publicar com vigência passada.'
      using errcode = 'check_violation', hint = 'vigente_desde';
  end if;
  if exists (select 1 from public.tabelas_preco where empreendimento_id = e.id and vigente_desde = p_vigente_desde) then
    raise exception 'Já existe uma tabela com vigência em %.', to_char(p_vigente_desde, 'DD/MM/YYYY')
      using errcode = 'check_violation', hint = 'vigente_desde';
  end if;
  if coalesce(p_reajuste, 0) <= -0.5 or coalesce(p_reajuste, 0) > 1 then
    raise exception 'Reajuste fora da faixa aceita (de -50%% a 100%%).' using errcode = 'check_violation', hint = 'reajuste';
  end if;
  if jsonb_typeof(coalesce(p_precos, '{}'::jsonb)) <> 'object' then
    raise exception 'Preços por lote em formato inválido.' using errcode = 'check_violation';
  end if;
  select k into v_estranho
    from jsonb_each_text(coalesce(p_precos, '{}'::jsonb)) as x(k, v)
   where k !~ '^[0-9a-f-]{36}$'
      or not exists (select 1 from public.lotes l where l.id::text = k and l.empreendimento_id = e.id)
      or v !~ '^[0-9]+$' or v::bigint <= 0
   limit 1;
  if v_estranho is not null then
    raise exception 'Preço inválido ou lote de outro empreendimento na tabela.' using errcode = 'check_violation';
  end if;

  insert into public.tabelas_preco (tenant_id, empreendimento_id, nome, vigente_desde, reajuste, lotes)
  values (e.tenant_id, e.id, trim(p_nome), p_vigente_desde, coalesce(p_reajuste, 0), 0)
  returning id into v_id;

  insert into public.tabela_preco_itens (tabela_id, tenant_id, lote_id, preco_centavos)
  select v_id, e.tenant_id, l.id,
         coalesce((p_precos ->> l.id::text)::bigint, round(b.base * (1 + coalesce(p_reajuste, 0)))::bigint)
    from public.lotes l
    cross join lateral (
      select (select i.preco_centavos
                from public.tabela_preco_itens i
                join public.tabelas_preco t on t.id = i.tabela_id
               where i.lote_id = l.id and t.vigente_desde < p_vigente_desde
               order by t.vigente_desde desc
               limit 1) as tabela_anterior
    ) ant
    cross join lateral (select coalesce(ant.tabela_anterior, l.preco_base_centavos)::numeric as base) b
   where l.empreendimento_id = e.id
     and coalesce((p_precos ->> l.id::text)::bigint, round(b.base * (1 + coalesce(p_reajuste, 0)))) > 0;
  get diagnostics v_total = row_count;
  if v_total = 0 then
    raise exception 'Nenhum lote com preço: informe o preço dos lotes antes de publicar a tabela.'
      using errcode = 'check_violation';
  end if;
  update public.tabelas_preco set lotes = v_total where id = v_id;

  if p_vigente_desde <= current_date then
    perform privado.sincronizar_precos(e.id);
  end if;
  return v_id;
end;
$$;
revoke execute on function public.publicar_tabela_preco(uuid, text, date, numeric, jsonb) from public, anon;
grant execute on function public.publicar_tabela_preco(uuid, text, date, numeric, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Aprovação de desconto
-- ---------------------------------------------------------------------------

create table public.aprovacoes_desconto (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  empreendimento_id uuid not null,
  lote_id uuid not null,
  preco_tabela_centavos bigint not null check (preco_tabela_centavos > 0),
  preco_centavos bigint not null check (preco_centavos > 0),
  desconto numeric(8, 6) not null,
  limite numeric(8, 6) not null,
  justificativa text not null check (length(trim(justificativa)) >= 10),
  situacao text not null default 'pendente'
    check (situacao in ('pendente', 'aprovada', 'recusada', 'utilizada', 'cancelada')),
  valida_ate date,
  decidido_por uuid,
  decidido_em timestamptz,
  motivo_decisao text,
  venda_id uuid,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  check (situacao not in ('aprovada', 'utilizada') or valida_ate is not null),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict,
  foreign key (tenant_id, lote_id) references public.lotes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, venda_id) references public.vendas (tenant_id, id) on delete restrict
);
create unique index aprovacoes_desconto_pendente_idx on public.aprovacoes_desconto (lote_id) where situacao = 'pendente';
create index aprovacoes_desconto_tenant_situacao_idx on public.aprovacoes_desconto (tenant_id, situacao);
create index aprovacoes_desconto_empreendimento_idx on public.aprovacoes_desconto (tenant_id, empreendimento_id);
create index aprovacoes_desconto_lote_idx on public.aprovacoes_desconto (tenant_id, lote_id);
create index aprovacoes_desconto_venda_idx on public.aprovacoes_desconto (tenant_id, venda_id) where venda_id is not null;

alter table public.aprovacoes_desconto enable row level security;
create policy "ler aprovações de desconto" on public.aprovacoes_desconto for select to authenticated
  using (
    privado.pode('comercial.ler', tenant_id, 'empreendimento', empreendimento_id)
    or criado_por = (select auth.uid())
  );
revoke insert, update, delete, truncate on public.aprovacoes_desconto from authenticated, anon;
select privado.instrumentar('public.aprovacoes_desconto');

alter table public.vendas
  add column preco_tabela_centavos bigint check (preco_tabela_centavos > 0),
  add column desconto_aprovado_por uuid,
  add column aprovacao_desconto_id uuid;
alter table public.vendas
  add foreign key (tenant_id, aprovacao_desconto_id) references public.aprovacoes_desconto (tenant_id, id) on delete restrict;
create index vendas_aprovacao_desconto_idx on public.vendas (tenant_id, aprovacao_desconto_id) where aprovacao_desconto_id is not null;

comment on column public.vendas.preco_tabela_centavos is
  'Preço da tabela vigente na data da venda (RN-C05); nulo em vendas anteriores à regra ou importadas.';

-- Limite de desconto sem aprovação; nulo = o cliente ainda não definiu (sem limite).
create function privado.limite_desconto(p_tenant uuid, p_empreendimento uuid, p_data date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select (public.parametro_vigente('comercial.desconto_maximo_sem_aprovacao', p_data, p_tenant, 'empreendimento', p_empreendimento) #>> array[]::text[])::numeric
$$;
revoke execute on function privado.limite_desconto(uuid, uuid, date) from public, anon;
grant execute on function privado.limite_desconto(uuid, uuid, date) to authenticated, service_role;

create function privado.percentual(p numeric)
returns text
language sql
immutable
set search_path = ''
as $$ select replace(trim(to_char(round(p * 100, 2), 'FM990D00')), '.', ',') || '%' $$;
grant execute on function privado.percentual(numeric) to authenticated, service_role;

create function public.solicitar_aprovacao_desconto(
  p_lote uuid,
  p_preco bigint,
  p_data date,
  p_justificativa text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lotes;
  v_tabela bigint;
  v_limite numeric;
  v_desconto numeric;
  v_id uuid;
begin
  select * into l from public.lotes where id = p_lote for update;
  if l.id is null or not privado.pode('venda.registrar', l.tenant_id, 'empreendimento', l.empreendimento_id) then
    raise exception 'Sem permissão para pedir aprovação de desconto.' using errcode = 'insufficient_privilege';
  end if;
  if l.status not in ('disponivel', 'reservado') then
    raise exception 'O lote não está disponível para venda.' using errcode = 'check_violation', hint = 'lote_indisponivel';
  end if;
  v_tabela := public.preco_tabela(l.id, coalesce(p_data, current_date));
  if v_tabela is null then
    raise exception 'O lote não tem preço de tabela.' using errcode = 'check_violation';
  end if;
  if p_preco is null or p_preco <= 0 then
    raise exception 'Informe o preço pedido.' using errcode = 'check_violation', hint = 'preco';
  end if;
  v_limite := privado.limite_desconto(l.tenant_id, l.empreendimento_id, coalesce(p_data, current_date));
  v_desconto := round(1 - p_preco::numeric / v_tabela, 6);
  if v_limite is null or v_desconto <= v_limite then
    raise exception 'Este preço está dentro do limite de desconto e não precisa de aprovação.'
      using errcode = 'check_violation', hint = 'preco';
  end if;
  if length(trim(coalesce(p_justificativa, ''))) < 10 then
    raise exception 'Explique o motivo do desconto (ao menos 10 caracteres).'
      using errcode = 'check_violation', hint = 'justificativa_desconto';
  end if;
  update public.aprovacoes_desconto set situacao = 'cancelada', motivo_decisao = 'Substituída por novo pedido'
   where lote_id = l.id and situacao in ('pendente', 'aprovada');
  insert into public.aprovacoes_desconto (
    tenant_id, empreendimento_id, lote_id, preco_tabela_centavos, preco_centavos, desconto, limite, justificativa
  ) values (
    l.tenant_id, l.empreendimento_id, l.id, v_tabela, p_preco, v_desconto, v_limite, trim(p_justificativa)
  ) returning id into v_id;
  return v_id;
end;
$$;

create function public.decidir_aprovacao_desconto(p_aprovacao uuid, p_aprovar boolean, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.aprovacoes_desconto;
  v_dias integer;
begin
  select * into a from public.aprovacoes_desconto where id = p_aprovacao for update;
  if a.id is null or not privado.pode('venda.aprovar_desconto', a.tenant_id, 'empreendimento', a.empreendimento_id) then
    raise exception 'Sem permissão para decidir descontos.' using errcode = 'insufficient_privilege';
  end if;
  if a.situacao <> 'pendente' then
    raise exception 'Este pedido já foi decidido.' using errcode = 'check_violation';
  end if;
  if not p_aprovar and length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo da recusa.' using errcode = 'check_violation', hint = 'motivo';
  end if;
  v_dias := coalesce(
    (public.parametro_vigente('comercial.validade_aprovacao_desconto_dias', current_date, a.tenant_id, 'empreendimento', a.empreendimento_id) #>> array[]::text[])::integer,
    7
  );
  update public.aprovacoes_desconto
     set situacao = case when p_aprovar then 'aprovada' else 'recusada' end,
         valida_ate = case when p_aprovar then current_date + v_dias end,
         decidido_por = auth.uid(),
         decidido_em = now(),
         motivo_decisao = nullif(trim(coalesce(p_motivo, '')), '')
   where id = a.id;
end;
$$;

revoke execute on function public.solicitar_aprovacao_desconto(uuid, bigint, date, text) from public, anon;
revoke execute on function public.decidir_aprovacao_desconto(uuid, boolean, text) from public, anon;
grant execute on function public.solicitar_aprovacao_desconto(uuid, bigint, date, text) to authenticated;
grant execute on function public.decidir_aprovacao_desconto(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Venda com preço de tabela e limite de desconto (RN-C05)
-- ---------------------------------------------------------------------------

create or replace function public.vender_lote(p_lote uuid, p_venda jsonb, p_justificativa text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lotes;
  e public.empreendimentos;
  r public.reservas;
  a public.aprovacoes_desconto;
  v_id uuid;
  v_permite boolean;
  v_data date := coalesce((p_venda ->> 'data_venda')::date, current_date);
  v_preco bigint := (p_venda ->> 'preco_centavos')::bigint;
  v_tabela bigint;
  v_limite numeric;
  v_desconto numeric;
  v_aprovador uuid;
begin
  select * into l from public.lotes where id = p_lote for update;
  if l.id is null or not privado.pode('venda.registrar', l.tenant_id, 'empreendimento', l.empreendimento_id) then
    raise exception 'Sem permissão para registrar a venda.' using errcode = 'insufficient_privilege';
  end if;
  select * into e from public.empreendimentos where id = l.empreendimento_id;

  -- RN-C01 // VALIDAR COM ADVOGADO (PL-01)
  if e.data_registro is null then
    v_permite := coalesce(
      (public.parametro_vigente('comercial.permite_venda_sem_registro', current_date, l.tenant_id, 'empreendimento', e.id) #>> array[]::text[])::boolean,
      false
    );
    if not v_permite then
      raise exception 'Venda bloqueada: o loteamento ainda não foi registrado em cartório (Lei 6.766).'
        using errcode = 'check_violation', hint = 'sem_registro';
    end if;
    if length(trim(coalesce(p_justificativa, ''))) < 10 then
      raise exception 'Informe a justificativa para vender antes do registro.' using errcode = 'check_violation', hint = 'sem_registro';
    end if;
  end if;

  perform public.expirar_reservas();
  select * into l from public.lotes where id = p_lote;
  if l.status not in ('disponivel', 'reservado') then
    raise exception 'O lote não está disponível para venda (situação: %).', l.status
      using errcode = 'check_violation', hint = 'lote_indisponivel';
  end if;
  select * into r from public.reservas where lote_id = l.id and situacao = 'ativa';

  -- RN-C05: preço da tabela vigente na data e limite de desconto.
  v_tabela := public.preco_tabela(l.id, v_data);
  if v_tabela is not null and v_preco is not null and v_preco < v_tabela then
    v_limite := privado.limite_desconto(l.tenant_id, e.id, v_data);
    v_desconto := round(1 - v_preco::numeric / v_tabela, 6);
    if v_limite is not null and v_desconto > v_limite then
      if privado.pode('venda.aprovar_desconto', l.tenant_id, 'empreendimento', e.id) then
        v_aprovador := auth.uid();
      else
        select * into a from public.aprovacoes_desconto
         where lote_id = l.id and situacao = 'aprovada' and valida_ate >= current_date
           and preco_tabela_centavos = v_tabela and preco_centavos <= v_preco
         order by decidido_em desc
         limit 1
         for update;
        if a.id is null then
          raise exception 'Desconto de % sobre a tabela (%) passa do limite de %: peça a aprovação do desconto.',
            privado.percentual(v_desconto),
            'R$ ' || replace(replace(replace(to_char(v_tabela / 100.0, 'FM999G999G999G990D00'), '.', '#'), ',', '.'), '#', ','),
            privado.percentual(v_limite)
            using errcode = 'check_violation', hint = 'desconto_acima_limite';
        end if;
        v_aprovador := a.decidido_por;
      end if;
    end if;
  end if;

  perform set_config('app.transicao_lote', 'on', true);
  if p_justificativa is not null then
    perform set_config('app.motivo', p_justificativa, true);
  end if;
  insert into public.vendas (
    tenant_id, empreendimento_id, lote_id, comprador_id, corretor_id, reserva_id, data_venda,
    preco_centavos, entrada_centavos, parcelas, juros_mensal, sistema, primeira_parcela_em,
    comissao_percentual, comissao_modo, justificativa_sem_registro,
    preco_tabela_centavos, desconto_aprovado_por, aprovacao_desconto_id
  ) values (
    l.tenant_id, l.empreendimento_id, l.id,
    (p_venda ->> 'comprador_id')::uuid,
    coalesce((p_venda ->> 'corretor_id')::uuid, r.corretor_id),
    r.id,
    v_data,
    v_preco,
    (p_venda ->> 'entrada_centavos')::bigint,
    (p_venda ->> 'parcelas')::integer,
    (p_venda ->> 'juros_mensal')::numeric,
    p_venda ->> 'sistema',
    (p_venda ->> 'primeira_parcela_em')::date,
    coalesce((p_venda ->> 'comissao_percentual')::numeric, 0),
    coalesce(p_venda ->> 'comissao_modo', 'ato'),
    case when e.data_registro is null then trim(p_justificativa) end,
    v_tabela,
    v_aprovador,
    a.id
  ) returning id into v_id;
  if a.id is not null then
    update public.aprovacoes_desconto set situacao = 'utilizada', venda_id = v_id where id = a.id;
  end if;
  -- Pedidos que sobraram para o lote perdem o sentido com a venda.
  update public.aprovacoes_desconto set situacao = 'cancelada', motivo_decisao = 'Lote vendido'
   where lote_id = l.id and situacao in ('pendente', 'aprovada');
  if r.id is not null then
    update public.reservas set situacao = 'convertida', motivo_encerramento = 'Venda registrada' where id = r.id;
  end if;
  update public.lotes set status = 'vendido' where id = l.id;
  perform set_config('app.transicao_lote', '', true);
  return v_id;
end;
$$;
