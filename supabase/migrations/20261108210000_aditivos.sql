-- Fase 5c-1 · Aditivos e antecipação.
-- Renegociação por aditivo (RN-K07): as parcelas em aberto são canceladas (preservadas no
-- histórico, com foto no aditivo) e substituídas por um novo plano calculado pelo motor.
-- Antecipação (RN-K08): baixa de parcelas a vencer com desconto dos juros não decorridos.

create table public.aditivos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contrato_id uuid not null,
  tipo text not null check (tipo in ('renegociacao')),
  data date not null,
  motivo text not null check (length(trim(motivo)) >= 5),
  saldo_anterior_centavos bigint not null check (saldo_anterior_centavos > 0),
  encargos_incorporados_centavos bigint not null default 0 check (encargos_incorporados_centavos >= 0),
  desconto_centavos bigint not null default 0 check (desconto_centavos >= 0),
  novo_saldo_centavos bigint not null check (novo_saldo_centavos > 0),
  -- Condições do novo plano (parcelas, juros, sistema, 1ª parcela) e foto das parcelas substituídas.
  condicoes jsonb not null,
  parcelas_anteriores jsonb not null,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  check (novo_saldo_centavos = saldo_anterior_centavos + encargos_incorporados_centavos - desconto_centavos),
  foreign key (tenant_id, contrato_id) references public.contratos (tenant_id, id) on delete restrict
);

create index aditivos_contrato_idx on public.aditivos (tenant_id, contrato_id);

create trigger aditivos_por_funcao before update or delete on public.aditivos
  for each row execute function privado.carteira_somente_por_funcao();

alter table public.parcelas
  add column aditivo_origem_id uuid,
  add column aditivo_cancelamento_id uuid,
  add constraint parcelas_aditivo_origem_fk foreign key (tenant_id, aditivo_origem_id) references public.aditivos (tenant_id, id) on delete restrict,
  add constraint parcelas_aditivo_cancelamento_fk foreign key (tenant_id, aditivo_cancelamento_id) references public.aditivos (tenant_id, id) on delete restrict;

create index parcelas_aditivo_origem_idx on public.parcelas (tenant_id, aditivo_origem_id) where aditivo_origem_id is not null;
create index parcelas_aditivo_cancelamento_idx on public.parcelas (tenant_id, aditivo_cancelamento_id) where aditivo_cancelamento_id is not null;

alter table public.aditivos enable row level security;
create policy "ler aditivos" on public.aditivos for select to authenticated
  using (exists (
    select 1 from public.contratos c
     where c.id = contrato_id and privado.pode('carteira.ler', c.tenant_id, 'empreendimento', c.empreendimento_id)
  ));
revoke insert, update, delete, truncate on public.aditivos from authenticated, anon;
select privado.instrumentar('public.aditivos');

-- ---------------------------------------------------------------------------
-- Renegociação
-- ---------------------------------------------------------------------------

-- p_condicoes: {parcelas, juros_mensal, sistema, primeira_parcela_em} (registro).
-- p_parcelas: novo plano do motor [{numero, vencimento, valor_centavos, amortizacao_centavos, juros_centavos}],
-- numerado a partir da última parcela do contrato.
create function public.renegociar_contrato(
  p_contrato uuid,
  p_data date,
  p_motivo text,
  p_encargos bigint,
  p_desconto bigint,
  p_condicoes jsonb,
  p_parcelas jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contratos;
  v_saldo bigint;
  v_novo bigint;
  v_ultimo integer;
  v_qtd integer;
  v_soma bigint;
  v_id uuid;
begin
  select * into c from public.contratos where id = p_contrato for update;
  if c.id is null or not privado.pode('carteira.receber', c.tenant_id, 'empreendimento', c.empreendimento_id) then
    raise exception 'Sem permissão para renegociar o contrato.' using errcode = 'insufficient_privilege';
  end if;
  if c.situacao <> 'vigente' then
    raise exception 'Só contratos vigentes são renegociados.' using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da renegociação.' using errcode = 'check_violation', hint = 'motivo';
  end if;
  if p_data is null or p_data > current_date then
    raise exception 'A data do aditivo não pode estar no futuro.' using errcode = 'check_violation';
  end if;
  if coalesce(p_encargos, -1) < 0 or coalesce(p_desconto, -1) < 0 then
    raise exception 'Encargos e desconto não podem ser negativos.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.cobrancas co join public.parcelas pa on pa.id = co.parcela_id
     where pa.contrato_id = c.id and pa.situacao = 'aberta' and co.situacao = 'pendente'
  ) then
    raise exception 'Cancele as cobranças pendentes no Asaas antes de renegociar.' using errcode = 'check_violation', hint = 'cobranca_pendente';
  end if;

  select coalesce(sum(valor_centavos - pago_centavos), 0) into v_saldo
    from public.parcelas where contrato_id = c.id and situacao = 'aberta';
  if v_saldo <= 0 then
    raise exception 'O contrato não tem saldo em aberto.' using errcode = 'check_violation';
  end if;
  v_novo := v_saldo + p_encargos - p_desconto;
  if v_novo <= 0 then
    raise exception 'O desconto não pode zerar o saldo; para quitar, registre o recebimento.' using errcode = 'check_violation', hint = 'desconto';
  end if;

  select max(numero) into v_ultimo from public.parcelas where contrato_id = c.id;
  select count(*), coalesce(sum((p ->> 'amortizacao_centavos')::bigint), 0) into v_qtd, v_soma
    from jsonb_array_elements(p_parcelas) p;
  if jsonb_typeof(p_parcelas) <> 'array' or v_qtd not between 1 and 480 or v_soma <> v_novo
     or exists (
       select 1 from jsonb_array_elements(p_parcelas) p
        where (p ->> 'numero')::integer not between v_ultimo + 1 and v_ultimo + v_qtd
           or (p ->> 'vencimento')::date < p_data
     )
     or (select count(distinct (p ->> 'numero')::integer) from jsonb_array_elements(p_parcelas) p) <> v_qtd then
    raise exception 'O novo plano não confere com o saldo renegociado.' using errcode = 'check_violation', hint = 'parcelas_inconsistentes';
  end if;

  perform set_config('app.carteira', 'on', true);
  perform set_config('app.motivo', p_motivo, true);
  insert into public.aditivos (
    tenant_id, contrato_id, tipo, data, motivo, saldo_anterior_centavos, encargos_incorporados_centavos,
    desconto_centavos, novo_saldo_centavos, condicoes, parcelas_anteriores
  ) values (
    c.tenant_id, c.id, 'renegociacao', p_data, trim(p_motivo), v_saldo, p_encargos, p_desconto, v_novo,
    coalesce(p_condicoes, '{}'::jsonb),
    (select jsonb_agg(jsonb_build_object('numero', numero, 'vencimento', vencimento, 'valor_centavos', valor_centavos,
                                         'pago_centavos', pago_centavos) order by numero)
       from public.parcelas where contrato_id = c.id and situacao = 'aberta')
  ) returning id into v_id;

  update public.parcelas set situacao = 'cancelada', aditivo_cancelamento_id = v_id
   where contrato_id = c.id and situacao = 'aberta';

  insert into public.parcelas (
    tenant_id, contrato_id, numero, vencimento, valor_centavos, amortizacao_centavos, juros_centavos, aditivo_origem_id
  )
  select c.tenant_id, c.id, (p ->> 'numero')::integer, (p ->> 'vencimento')::date, (p ->> 'valor_centavos')::bigint,
         (p ->> 'amortizacao_centavos')::bigint, (p ->> 'juros_centavos')::bigint, v_id
    from jsonb_array_elements(p_parcelas) p;
  perform set_config('app.carteira', '', true);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Antecipação
-- ---------------------------------------------------------------------------

-- p_itens: [{parcela, desconto_centavos}] — desconto calculado pelo motor (RN-K08).
-- Só parcelas a vencer; tudo na mesma transação.
create function public.antecipar_parcelas(p_contrato uuid, p_data date, p_itens jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contratos;
  pa public.parcelas;
  r record;
  v_n integer := 0;
begin
  select * into c from public.contratos where id = p_contrato for update;
  if c.id is null or not privado.pode('carteira.receber', c.tenant_id, 'empreendimento', c.empreendimento_id) then
    raise exception 'Sem permissão para registrar antecipação.' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Escolha as parcelas a antecipar.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.cobrancas co
     where co.situacao = 'pendente' and co.parcela_id in (select (i ->> 'parcela')::uuid from jsonb_array_elements(p_itens) i)
  ) then
    raise exception 'Cancele as cobranças pendentes no Asaas dessas parcelas antes de antecipar.' using errcode = 'check_violation', hint = 'cobranca_pendente';
  end if;
  for r in select (i ->> 'parcela')::uuid as parcela, (i ->> 'desconto_centavos')::bigint as desconto from jsonb_array_elements(p_itens) i loop
    select * into pa from public.parcelas where id = r.parcela;
    if pa.contrato_id is distinct from c.id then
      raise exception 'Parcela de outro contrato.' using errcode = 'check_violation';
    end if;
    if pa.vencimento <= p_data then
      raise exception 'Só parcelas a vencer são antecipadas; receba as vencidas com encargos.' using errcode = 'check_violation', hint = 'parcela_vencida';
    end if;
    if r.desconto is null or r.desconto < 0 or r.desconto >= pa.valor_centavos - pa.pago_centavos then
      raise exception 'Desconto de antecipação inválido.' using errcode = 'check_violation';
    end if;
    perform privado.baixar_parcela(pa.id, p_data, pa.valor_centavos - pa.pago_centavos, 0, 0, r.desconto,
                                   'manual', null, 'Antecipação (juros não decorridos descontados)');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Estorno: recebimento de parcela substituída por aditivo não volta a abrir a parcela.
create or replace function public.estornar_recebimento(p_recebimento uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.recebimentos;
  pa public.parcelas;
  c public.contratos;
begin
  select * into r from public.recebimentos where id = p_recebimento for update;
  select * into pa from public.parcelas where id = r.parcela_id for update;
  select * into c from public.contratos where id = pa.contrato_id for update;
  if r.id is null or not privado.pode('carteira.receber', c.tenant_id, 'empreendimento', c.empreendimento_id) then
    raise exception 'Sem permissão para estornar recebimentos.' using errcode = 'insufficient_privilege';
  end if;
  if r.estornado_em is not null then
    raise exception 'O recebimento já foi estornado.' using errcode = 'check_violation';
  end if;
  if pa.situacao = 'cancelada' then
    raise exception 'A parcela foi substituída por aditivo; o estorno exige um novo aditivo.' using errcode = 'check_violation', hint = 'parcela_renegociada';
  end if;
  if c.situacao not in ('vigente', 'quitado') then
    raise exception 'O contrato não aceita estorno nesta situação.' using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo do estorno.' using errcode = 'check_violation';
  end if;

  perform set_config('app.carteira', 'on', true);
  perform set_config('app.motivo', p_motivo, true);
  update public.recebimentos
     set estornado_em = now(), estornado_por = auth.uid(), motivo_estorno = trim(p_motivo)
   where id = r.id;
  update public.parcelas
     set pago_centavos = pago_centavos - r.principal_centavos, situacao = 'aberta'
   where id = pa.id;
  -- Cobrança paga no Asaas cujo recebimento foi estornado não volta a ser baixada sozinha.
  update public.cobrancas set situacao = 'divergente', motivo = 'Recebimento estornado: ' || trim(p_motivo)
   where recebimento_id = r.id;
  perform privado.atualizar_situacao_contrato(c.id, null);
  perform set_config('app.carteira', '', true);
end;
$$;

revoke execute on function public.renegociar_contrato(uuid, date, text, bigint, bigint, jsonb, jsonb) from public, anon;
revoke execute on function public.antecipar_parcelas(uuid, date, jsonb) from public, anon;
grant execute on function public.renegociar_contrato(uuid, date, text, bigint, bigint, jsonb, jsonb) to authenticated;
grant execute on function public.antecipar_parcelas(uuid, date, jsonb) to authenticated;
