-- Fase 5a · Contratos e carteira: contrato gerado a partir da venda, parcelas calculadas
-- pelo motor (RN-K01, RN-K02), recebimento manual com multa e juros de mora (RN-K04),
-- baixa parcial (RN-K06), idempotência por referência externa (RN-K05) e quitação (RN-K09).

insert into public.papel_permissoes (papel, permissao) values
  ('dono', 'carteira.ler'),
  ('financeiro', 'carteira.ler'),
  ('contador', 'carteira.ler'),
  ('comercial_gestor', 'carteira.ler'),
  ('socio_leitura', 'carteira.ler'),
  ('engenharia', 'carteira.ler'),
  ('dono', 'carteira.receber'),
  ('financeiro', 'carteira.receber');

-- Encargos de mora: padrão provisório da plataforma até a validação jurídica (PL-04).
insert into public.parametros (chave, descricao, tipo, unidade, pendencia_legal) values
  ('carteira.multa_atraso', 'Multa única sobre a parcela paga em atraso', 'decimal', 'fração', 'PL-04'),
  ('carteira.juros_mora_mensal', 'Juros de mora ao mês, pro rata die, sobre a parcela em atraso', 'decimal', 'fração ao mês', 'PL-04');

insert into public.parametro_valores (tenant_id, chave, escopo, escopo_id, valor, vigencia, motivo) values
  (null, 'carteira.multa_atraso', 'plataforma', null, '0.02', daterange('2026-01-01', null), 'Padrão provisório — VALIDAR COM ADVOGADO (PL-04)'),
  (null, 'carteira.juros_mora_mensal', 'plataforma', null, '0.01', daterange('2026-01-01', null), 'Padrão provisório — VALIDAR COM ADVOGADO (PL-04)');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  empreendimento_id uuid not null,
  venda_id uuid not null,
  lote_id uuid not null,
  comprador_id uuid not null,
  -- Índice de reajuste (RN-K03, aplicado na Fase 5b). Nulo = sem reajuste.
  indice_reajuste text references public.indices_economicos (codigo),
  -- Encargos fixados no contrato a partir dos parâmetros vigentes na data da venda (RN-K04).
  multa_atraso numeric(8, 6) not null check (multa_atraso between 0 and 1),
  juros_mora_mensal numeric(8, 6) not null check (juros_mora_mensal between 0 and 1),
  situacao text not null default 'vigente' check (situacao in ('vigente', 'quitado', 'distratado', 'cedido')),
  quitado_em date,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  unique (venda_id),
  check ((situacao = 'quitado') = (quitado_em is not null)),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict,
  foreign key (tenant_id, venda_id) references public.vendas (tenant_id, id) on delete restrict,
  foreign key (tenant_id, lote_id) references public.lotes (tenant_id, id) on delete restrict,
  foreign key (tenant_id, comprador_id) references public.compradores (tenant_id, id) on delete restrict
);

create index contratos_empreendimento_idx on public.contratos (tenant_id, empreendimento_id);
create index contratos_venda_idx on public.contratos (tenant_id, venda_id);
create index contratos_lote_idx on public.contratos (tenant_id, lote_id);
create index contratos_comprador_idx on public.contratos (tenant_id, comprador_id);
create index contratos_indice_idx on public.contratos (indice_reajuste) where indice_reajuste is not null;

create table public.parcelas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contrato_id uuid not null,
  -- 0 = entrada.
  numero integer not null check (numero >= 0),
  vencimento date not null,
  valor_centavos bigint not null check (valor_centavos > 0),
  amortizacao_centavos bigint not null check (amortizacao_centavos >= 0),
  juros_centavos bigint not null check (juros_centavos >= 0),
  -- Principal já recebido (soma dos recebimentos não estornados), mantido pelas funções.
  pago_centavos bigint not null default 0 check (pago_centavos between 0 and valor_centavos),
  situacao text not null default 'aberta' check (situacao in ('aberta', 'paga', 'cancelada')),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  unique (contrato_id, numero),
  check (valor_centavos = amortizacao_centavos + juros_centavos),
  check ((situacao = 'paga') = (pago_centavos = valor_centavos)),
  foreign key (tenant_id, contrato_id) references public.contratos (tenant_id, id) on delete restrict
);

create index parcelas_contrato_idx on public.parcelas (tenant_id, contrato_id);
create index parcelas_abertas_idx on public.parcelas (tenant_id, vencimento) where situacao = 'aberta';

create table public.recebimentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  parcela_id uuid not null,
  data_pagamento date not null,
  -- Valor efetivamente recebido = principal + multa + juros de mora − desconto.
  valor_centavos bigint not null check (valor_centavos > 0),
  principal_centavos bigint not null check (principal_centavos > 0),
  multa_centavos bigint not null default 0 check (multa_centavos >= 0),
  juros_mora_centavos bigint not null default 0 check (juros_mora_centavos >= 0),
  desconto_centavos bigint not null default 0 check (desconto_centavos >= 0),
  origem text not null default 'manual' check (origem in ('manual', 'asaas')),
  -- Identificador do aviso de pagamento (RN-K05): o mesmo aviso não baixa duas vezes.
  referencia_externa text,
  observacao text,
  estornado_em timestamptz,
  estornado_por uuid,
  motivo_estorno text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  check (valor_centavos = principal_centavos + multa_centavos + juros_mora_centavos - desconto_centavos),
  check ((estornado_em is null) = (motivo_estorno is null)),
  foreign key (tenant_id, parcela_id) references public.parcelas (tenant_id, id) on delete restrict
);

create unique index recebimentos_referencia_idx on public.recebimentos (tenant_id, origem, referencia_externa)
  where referencia_externa is not null;
create index recebimentos_parcela_idx on public.recebimentos (tenant_id, parcela_id);

-- Parcelas e recebimentos só mudam pelas funções; contrato só muda pelas funções.
create function privado.carteira_somente_por_funcao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.carteira', true) = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'Contratos, parcelas e recebimentos mudam apenas pelas funções da carteira.'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger contratos_por_funcao before update or delete on public.contratos
  for each row execute function privado.carteira_somente_por_funcao();
create trigger parcelas_por_funcao before update or delete on public.parcelas
  for each row execute function privado.carteira_somente_por_funcao();
create trigger recebimentos_por_funcao before update or delete on public.recebimentos
  for each row execute function privado.carteira_somente_por_funcao();

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------

-- Gera o contrato da venda com as parcelas calculadas pelo motor (o banco confere a
-- consistência: numeração, soma das amortizações = preço, entrada e quantidade).
-- p_parcelas: [{numero, vencimento, valor_centavos, amortizacao_centavos, juros_centavos}]
create function public.criar_contrato(p_venda uuid, p_parcelas jsonb, p_indice text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.vendas;
  v_id uuid;
  v_multa numeric;
  v_juros numeric;
  v_qtd integer;
  v_soma bigint;
  v_entrada bigint;
begin
  select * into v from public.vendas where id = p_venda for update;
  if v.id is null or not (
    privado.pode('venda.registrar', v.tenant_id, 'empreendimento', v.empreendimento_id)
    or privado.pode('carteira.receber', v.tenant_id, 'empreendimento', v.empreendimento_id)
  ) then
    raise exception 'Sem permissão para gerar o contrato.' using errcode = 'insufficient_privilege';
  end if;
  if v.situacao <> 'ativa' then
    raise exception 'A venda não está ativa.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.contratos where venda_id = v.id) then
    raise exception 'Esta venda já tem contrato.' using errcode = 'unique_violation', hint = 'contrato_existente';
  end if;
  if jsonb_typeof(p_parcelas) <> 'array' then
    raise exception 'Parcelas inválidas.' using errcode = 'check_violation';
  end if;

  select count(*), coalesce(sum((p ->> 'amortizacao_centavos')::bigint), 0),
         coalesce(sum((p ->> 'valor_centavos')::bigint) filter (where (p ->> 'numero')::integer = 0), 0)
    into v_qtd, v_soma, v_entrada
    from jsonb_array_elements(p_parcelas) p;
  if v_soma <> v.preco_centavos
     or v_entrada <> v.entrada_centavos
     or v_qtd <> v.parcelas + (case when v.entrada_centavos > 0 then 1 else 0 end)
     or exists (
       select 1 from jsonb_array_elements(p_parcelas) p
        where (p ->> 'numero')::integer not between (case when v.entrada_centavos > 0 then 0 else 1 end) and v.parcelas
     ) then
    raise exception 'As parcelas não conferem com as condições da venda.' using errcode = 'check_violation', hint = 'parcelas_inconsistentes';
  end if;

  v_multa := coalesce(
    (public.parametro_vigente('carteira.multa_atraso', v.data_venda, v.tenant_id, 'empreendimento', v.empreendimento_id) #>> array[]::text[])::numeric,
    0);
  v_juros := coalesce(
    (public.parametro_vigente('carteira.juros_mora_mensal', v.data_venda, v.tenant_id, 'empreendimento', v.empreendimento_id) #>> array[]::text[])::numeric,
    0);

  insert into public.contratos (tenant_id, empreendimento_id, venda_id, lote_id, comprador_id, indice_reajuste, multa_atraso, juros_mora_mensal)
  values (v.tenant_id, v.empreendimento_id, v.id, v.lote_id, v.comprador_id, p_indice, v_multa, v_juros)
  returning id into v_id;

  insert into public.parcelas (tenant_id, contrato_id, numero, vencimento, valor_centavos, amortizacao_centavos, juros_centavos)
  select v.tenant_id, v_id, (p ->> 'numero')::integer, (p ->> 'vencimento')::date,
         (p ->> 'valor_centavos')::bigint, (p ->> 'amortizacao_centavos')::bigint, (p ->> 'juros_centavos')::bigint
    from jsonb_array_elements(p_parcelas) p;
  return v_id;
end;
$$;

-- Atualiza a situação do contrato conforme as parcelas em aberto (RN-K09).
create function privado.atualizar_situacao_contrato(p_contrato uuid, p_data date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_abertas boolean;
begin
  select exists (select 1 from public.parcelas where contrato_id = p_contrato and situacao = 'aberta') into v_abertas;
  update public.contratos
     set situacao = case when v_abertas then 'vigente' else 'quitado' end,
         quitado_em = case when v_abertas then null else p_data end
   where id = p_contrato and situacao in ('vigente', 'quitado')
     and situacao <> case when v_abertas then 'vigente' else 'quitado' end;
end;
$$;

-- Recebimento de parcela (manual ou conciliado). Encargos são calculados pelo motor na
-- aplicação; o banco confere os limites. Repetir a mesma referência devolve o mesmo
-- recebimento (RN-K05). Pagamento a menor baixa parcialmente (RN-K06).
create function public.registrar_recebimento(
  p_parcela uuid,
  p_data date,
  p_principal bigint,
  p_multa bigint default 0,
  p_juros_mora bigint default 0,
  p_desconto bigint default 0,
  p_origem text default 'manual',
  p_referencia text default null,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pa public.parcelas;
  c public.contratos;
  v_id uuid;
begin
  select * into pa from public.parcelas where id = p_parcela for update;
  select * into c from public.contratos where id = pa.contrato_id for update;
  if pa.id is null or not privado.pode('carteira.receber', c.tenant_id, 'empreendimento', c.empreendimento_id) then
    raise exception 'Sem permissão para registrar recebimentos.' using errcode = 'insufficient_privilege';
  end if;

  if p_referencia is not null then
    select id into v_id from public.recebimentos
     where tenant_id = pa.tenant_id and origem = p_origem and referencia_externa = p_referencia;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if c.situacao <> 'vigente' or pa.situacao <> 'aberta' then
    raise exception 'A parcela não está em aberto.' using errcode = 'check_violation', hint = 'parcela_fechada';
  end if;
  if p_principal is null or p_principal <= 0 or p_principal > pa.valor_centavos - pa.pago_centavos then
    raise exception 'O principal deve ser positivo e no máximo o saldo da parcela.' using errcode = 'check_violation', hint = 'principal_invalido';
  end if;
  if p_desconto > p_principal + p_multa + p_juros_mora then
    raise exception 'O desconto não pode superar o valor devido.' using errcode = 'check_violation';
  end if;
  if p_data is null or p_data > current_date then
    raise exception 'A data do pagamento não pode estar no futuro.' using errcode = 'check_violation';
  end if;

  perform set_config('app.carteira', 'on', true);
  insert into public.recebimentos (
    tenant_id, parcela_id, data_pagamento, valor_centavos, principal_centavos, multa_centavos,
    juros_mora_centavos, desconto_centavos, origem, referencia_externa, observacao
  ) values (
    pa.tenant_id, pa.id, p_data, p_principal + p_multa + p_juros_mora - p_desconto, p_principal, p_multa,
    p_juros_mora, p_desconto, p_origem, p_referencia, nullif(trim(coalesce(p_observacao, '')), '')
  ) returning id into v_id;
  update public.parcelas
     set pago_centavos = pago_centavos + p_principal,
         situacao = case when pago_centavos + p_principal = valor_centavos then 'paga' else 'aberta' end
   where id = pa.id;
  perform privado.atualizar_situacao_contrato(c.id, p_data);
  perform set_config('app.carteira', '', true);
  return v_id;
end;
$$;

-- Estorno lógico: o recebimento fica no histórico e a parcela volta a ter saldo.
create function public.estornar_recebimento(p_recebimento uuid, p_motivo text)
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
  perform privado.atualizar_situacao_contrato(c.id, null);
  perform set_config('app.carteira', '', true);
end;
$$;

revoke execute on function public.criar_contrato(uuid, jsonb, text) from public, anon;
revoke execute on function public.registrar_recebimento(uuid, date, bigint, bigint, bigint, bigint, text, text, text) from public, anon;
revoke execute on function public.estornar_recebimento(uuid, text) from public, anon;
grant execute on function public.criar_contrato(uuid, jsonb, text) to authenticated;
grant execute on function public.registrar_recebimento(uuid, date, bigint, bigint, bigint, bigint, text, text, text) to authenticated, service_role;
grant execute on function public.estornar_recebimento(uuid, text) to authenticated;
grant execute on all functions in schema privado to authenticated, service_role;
revoke execute on all functions in schema privado from public, anon;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.contratos enable row level security;
alter table public.parcelas enable row level security;
alter table public.recebimentos enable row level security;

create policy "ler contratos" on public.contratos for select to authenticated
  using (privado.pode('carteira.ler', tenant_id, 'empreendimento', empreendimento_id));

create policy "ler parcelas" on public.parcelas for select to authenticated
  using (exists (
    select 1 from public.contratos c
     where c.id = contrato_id and privado.pode('carteira.ler', c.tenant_id, 'empreendimento', c.empreendimento_id)
  ));

create policy "ler recebimentos" on public.recebimentos for select to authenticated
  using (exists (
    select 1 from public.parcelas p join public.contratos c on c.id = p.contrato_id
     where p.id = parcela_id and privado.pode('carteira.ler', c.tenant_id, 'empreendimento', c.empreendimento_id)
  ));

revoke insert, update, delete, truncate on public.contratos, public.parcelas, public.recebimentos from authenticated, anon;

select privado.instrumentar('public.contratos');
select privado.instrumentar('public.parcelas');
select privado.instrumentar('public.recebimentos');
