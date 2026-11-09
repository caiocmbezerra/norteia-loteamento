-- Fase 3 · Medições de contrato por percentual executado. Cada medição informa o percentual
-- acumulado da obra contratada; o valor a pagar é a diferença para o acumulado anterior, calculada
-- no banco (o acumulado sempre fecha com o valor do contrato), e vira a conta a pagar da medição.

create table public.medicoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  empreendimento_id uuid not null,
  contrato_id uuid not null,
  numero integer not null check (numero > 0),
  data date not null,
  percentual_acumulado numeric(9, 6) not null check (percentual_acumulado > 0 and percentual_acumulado <= 1),
  valor_centavos bigint not null check (valor_centavos > 0),
  conta_id uuid not null unique,
  observacao text check (observacao is null or length(observacao) <= 500),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (contrato_id, numero),
  foreign key (tenant_id, empreendimento_id, contrato_id)
    references public.contratos_fornecedor (tenant_id, empreendimento_id, id) on delete restrict,
  foreign key (tenant_id, conta_id) references public.contas_pagar (tenant_id, id) on delete restrict
);
create index medicoes_contrato_idx on public.medicoes (tenant_id, empreendimento_id, contrato_id);

comment on table public.medicoes is
  'Medição por percentual acumulado do contrato; o valor e a conta a pagar são gerados por registrar_medicao.';

alter table public.medicoes enable row level security;
create policy "ler medições" on public.medicoes for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id, 'empreendimento', empreendimento_id));
revoke insert, update, delete, truncate on public.medicoes from authenticated, anon;
select privado.instrumentar('public.medicoes');

-- Medições que valem: as de contas não canceladas.
create function public.registrar_medicao(
  p_contrato uuid,
  p_data date,
  p_percentual_acumulado numeric,
  p_vencimento date,
  p_documento text default null,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contratos_fornecedor;
  v_anterior numeric;
  v_medido bigint;
  v_numero integer;
  v_valor bigint;
  v_conta uuid;
  v_id uuid;
begin
  select * into c from public.contratos_fornecedor where id = p_contrato for update;
  if c.id is null or not privado.pode('custos.editar', c.tenant_id, 'empreendimento', c.empreendimento_id) then
    raise exception 'Sem permissão para medir este contrato.' using errcode = 'insufficient_privilege';
  end if;
  if c.situacao <> 'vigente' then
    raise exception 'O contrato não está vigente.' using errcode = 'check_violation';
  end if;
  if p_data is null or p_vencimento is null then
    raise exception 'Informe a data da medição e o vencimento.' using errcode = 'check_violation';
  end if;
  if p_data < c.data_inicio then
    raise exception 'A medição não pode ser anterior ao início do contrato.' using errcode = 'check_violation', hint = 'data';
  end if;

  select coalesce(max(m.percentual_acumulado), 0), coalesce(sum(m.valor_centavos), 0)
    into v_anterior, v_medido
    from public.medicoes m
    join public.contas_pagar cp on cp.id = m.conta_id
   where m.contrato_id = c.id and cp.cancelada_em is null;
  select coalesce(max(numero), 0) + 1 into v_numero from public.medicoes where contrato_id = c.id;

  if p_percentual_acumulado is null or p_percentual_acumulado <= v_anterior or p_percentual_acumulado > 1 then
    raise exception 'O percentual acumulado deve passar de % e ir até 100%%.', privado.percentual(v_anterior)
      using errcode = 'check_violation', hint = 'percentual';
  end if;
  -- O acumulado em reais acompanha o percentual; o arredondamento não se acumula.
  v_valor := round(c.valor_centavos * p_percentual_acumulado)::bigint - v_medido;
  if v_valor <= 0 then
    raise exception 'O percentual informado não gera valor a pagar.' using errcode = 'check_violation', hint = 'percentual';
  end if;

  insert into public.contas_pagar (
    tenant_id, empreendimento_id, centro_codigo, contrato_id, descricao, valor_centavos, vencimento, documento_numero
  ) values (
    c.tenant_id, c.empreendimento_id, c.centro_codigo, c.id,
    format('Medição %s — %s executado', v_numero, privado.percentual(p_percentual_acumulado)),
    v_valor, p_vencimento, nullif(trim(coalesce(p_documento, '')), '')
  ) returning id into v_conta;

  insert into public.medicoes (
    tenant_id, empreendimento_id, contrato_id, numero, data, percentual_acumulado, valor_centavos, conta_id, observacao
  ) values (
    c.tenant_id, c.empreendimento_id, c.id, v_numero, p_data, p_percentual_acumulado, v_valor, v_conta,
    nullif(trim(coalesce(p_observacao, '')), '')
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.registrar_medicao(uuid, date, numeric, date, text, text) from public, anon;
grant execute on function public.registrar_medicao(uuid, date, numeric, date, text, text) to authenticated;
