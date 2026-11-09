-- Fase 8a · Importação de carteira de outro sistema (planilha padrão + mapeamento de colunas).
-- Cada linha é uma parcela; as linhas do mesmo contrato de origem viram uma venda, um contrato,
-- as parcelas e os recebimentos já pagos. Tudo ou nada, e só com o saldo em aberto conciliado
-- com o informado pelo sistema de origem (critério da fase).

alter table public.recebimentos drop constraint recebimentos_origem_check;
alter table public.recebimentos add constraint recebimentos_origem_check check (origem in ('manual', 'asaas', 'importacao'));

create table public.importacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  empreendimento_id uuid not null,
  origem text not null check (length(trim(origem)) between 2 and 80),
  arquivo text,
  contratos integer not null,
  parcelas integer not null,
  saldo_aberto_centavos bigint not null,
  saldo_origem_centavos bigint not null,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict
);
alter table public.importacoes enable row level security;
create policy "ler importações" on public.importacoes for select to authenticated
  using (privado.pode('carteira.ler', tenant_id, 'empreendimento', empreendimento_id));
revoke insert, update, delete, truncate on public.importacoes from authenticated, anon;
select privado.instrumentar('public.importacoes');

alter table public.vendas add column importacao_id uuid references public.importacoes (id) on delete restrict;

-- Mapeamento de colunas salvo por loteadora, para reaproveitar na próxima importação.
create table public.mapeamentos_importacao (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 80),
  colunas jsonb not null,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (tenant_id, nome)
);
alter table public.mapeamentos_importacao enable row level security;
create policy "ler mapeamentos" on public.mapeamentos_importacao for select to authenticated
  using (privado.pode('venda.registrar', tenant_id));
create policy "incluir mapeamentos" on public.mapeamentos_importacao for insert to authenticated
  with check (privado.pode('venda.registrar', tenant_id));
create policy "alterar mapeamentos" on public.mapeamentos_importacao for update to authenticated
  using (privado.pode('venda.registrar', tenant_id)) with check (privado.pode('venda.registrar', tenant_id));
select privado.instrumentar('public.mapeamentos_importacao');

-- p_contratos: [{ref, quadra, lote, comprador:{nome, cpf, email, telefone}, data_venda, preco, indice,
--   parcelas:[{numero, vencimento, valor, pago, data_pagamento}]}]
create function public.importar_carteira(
  p_empreendimento uuid,
  p_origem text,
  p_arquivo text,
  p_saldo_origem bigint,
  p_contratos jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.empreendimentos;
  k jsonb;
  l public.lotes;
  v_comprador uuid;
  v_venda uuid;
  v_contrato uuid;
  v_importacao uuid;
  v_saldo bigint;
  v_qtd_parcelas integer;
  v_multa numeric;
  v_juros numeric;
begin
  select * into e from public.empreendimentos where id = p_empreendimento;
  if e.id is null or not privado.pode('venda.registrar', e.tenant_id, 'empreendimento', e.id) then
    raise exception 'Sem permissão para importar a carteira.' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_contratos) <> 'array' or jsonb_array_length(p_contratos) = 0 then
    raise exception 'Nenhum contrato para importar.' using errcode = 'check_violation';
  end if;

  select coalesce(sum(greatest((x ->> 'valor')::bigint - least(coalesce((x ->> 'pago')::bigint, 0), (x ->> 'valor')::bigint), 0)), 0),
         count(*)
    into v_saldo, v_qtd_parcelas
    from jsonb_array_elements(p_contratos) c, jsonb_array_elements(c -> 'parcelas') x;
  if v_saldo <> p_saldo_origem then
    raise exception 'O saldo em aberto da planilha (%) não confere com o do sistema de origem (%).', v_saldo, p_saldo_origem
      using errcode = 'check_violation', hint = 'conciliacao';
  end if;

  insert into public.importacoes (tenant_id, empreendimento_id, origem, arquivo, contratos, parcelas, saldo_aberto_centavos, saldo_origem_centavos)
  values (e.tenant_id, e.id, trim(p_origem), p_arquivo, jsonb_array_length(p_contratos), v_qtd_parcelas, v_saldo, p_saldo_origem)
  returning id into v_importacao;

  perform set_config('app.carteira', 'on', true);
  perform set_config('app.transicao_lote', 'on', true);
  perform set_config('app.motivo', 'Importação de carteira: ' || trim(p_origem), true);

  for k in select * from jsonb_array_elements(p_contratos) loop
    select lo.* into l from public.lotes lo join public.quadras q on q.id = lo.quadra_id
     where lo.empreendimento_id = e.id and q.codigo = k ->> 'quadra' and lo.numero = k ->> 'lote'
     for update of lo;
    if l.id is null then
      raise exception 'Contrato %: lote % da quadra % não existe neste empreendimento.', k ->> 'ref', k ->> 'lote', k ->> 'quadra'
        using errcode = 'check_violation', hint = 'lote';
    end if;
    if l.status not in ('disponivel', 'reservado') then
      raise exception 'Contrato %: o lote % da quadra % já está %.', k ->> 'ref', k ->> 'lote', k ->> 'quadra', l.status
        using errcode = 'check_violation', hint = 'lote_indisponivel';
    end if;

    select id into v_comprador from public.compradores
     where tenant_id = e.tenant_id and cpf is not null and cpf = nullif(k #>> '{comprador,cpf}', '');
    if v_comprador is null then
      insert into public.compradores (tenant_id, nome, cpf, email, telefone)
      values (e.tenant_id, k #>> '{comprador,nome}', nullif(k #>> '{comprador,cpf}', ''),
              nullif(k #>> '{comprador,email}', ''), nullif(k #>> '{comprador,telefone}', ''))
      returning id into v_comprador;
    end if;

    insert into public.vendas (
      tenant_id, empreendimento_id, lote_id, comprador_id, data_venda, preco_centavos, entrada_centavos,
      parcelas, juros_mensal, sistema, primeira_parcela_em, justificativa_sem_registro, importacao_id
    )
    select e.tenant_id, e.id, l.id, v_comprador, (k ->> 'data_venda')::date, (k ->> 'preco')::bigint,
           least(coalesce((select (x ->> 'valor')::bigint from jsonb_array_elements(k -> 'parcelas') x where (x ->> 'numero')::integer = 0), 0), (k ->> 'preco')::bigint),
           (select count(*) from jsonb_array_elements(k -> 'parcelas') x where (x ->> 'numero')::integer > 0),
           0, 'price',
           (select min((x ->> 'vencimento')::date) from jsonb_array_elements(k -> 'parcelas') x where (x ->> 'numero')::integer > 0),
           case when e.data_registro is null then 'Importada de ' || trim(p_origem) end,
           v_importacao
    returning id into v_venda;
    update public.reservas set situacao = 'convertida', motivo_encerramento = 'Carteira importada'
     where lote_id = l.id and situacao = 'ativa';
    update public.lotes set status = 'vendido' where id = l.id;

    v_multa := coalesce((public.parametro_vigente('carteira.multa_atraso', (k ->> 'data_venda')::date, e.tenant_id, 'empreendimento', e.id) #>> array[]::text[])::numeric, 0);
    v_juros := coalesce((public.parametro_vigente('carteira.juros_mora_mensal', (k ->> 'data_venda')::date, e.tenant_id, 'empreendimento', e.id) #>> array[]::text[])::numeric, 0);
    if nullif(k ->> 'indice', '') is not null and not exists (select 1 from public.indices_economicos where codigo = k ->> 'indice') then
      raise exception 'Contrato %: índice de reajuste % desconhecido.', k ->> 'ref', k ->> 'indice'
        using errcode = 'check_violation', hint = 'indice';
    end if;
    insert into public.contratos (
      tenant_id, empreendimento_id, venda_id, lote_id, comprador_id, indice_reajuste, multa_atraso, juros_mora_mensal,
      reajuste_periodicidade_meses, reajuste_defasagem_meses, reajuste_negativo
    ) values (
      e.tenant_id, e.id, v_venda, l.id, v_comprador, nullif(k ->> 'indice', ''), v_multa, v_juros,
      coalesce((public.parametro_vigente('carteira.reajuste_periodicidade_meses', (k ->> 'data_venda')::date, e.tenant_id, 'empreendimento', e.id) #>> array[]::text[])::integer, 12),
      coalesce((public.parametro_vigente('carteira.reajuste_defasagem_meses', (k ->> 'data_venda')::date, e.tenant_id, 'empreendimento', e.id) #>> array[]::text[])::integer, 2),
      coalesce(public.parametro_vigente('carteira.reajuste_negativo', (k ->> 'data_venda')::date, e.tenant_id, 'empreendimento', e.id) #>> array[]::text[], 'ignorar')
    ) returning id into v_contrato;

    with novas as (
      insert into public.parcelas (tenant_id, contrato_id, numero, vencimento, valor_centavos, amortizacao_centavos, juros_centavos, pago_centavos, situacao)
      select e.tenant_id, v_contrato, (x ->> 'numero')::integer, (x ->> 'vencimento')::date, (x ->> 'valor')::bigint, (x ->> 'valor')::bigint, 0,
             least(coalesce((x ->> 'pago')::bigint, 0), (x ->> 'valor')::bigint),
             case when coalesce((x ->> 'pago')::bigint, 0) >= (x ->> 'valor')::bigint then 'paga' else 'aberta' end
        from jsonb_array_elements(k -> 'parcelas') x
      returning id, numero, valor_centavos
    )
    -- Pago acima do valor da parcela entra como juros de mora (encargos do sistema de origem).
    insert into public.recebimentos (tenant_id, parcela_id, data_pagamento, valor_centavos, principal_centavos,
                                     juros_mora_centavos, origem, referencia_externa, observacao)
    select e.tenant_id, n.id, coalesce((x ->> 'data_pagamento')::date, (x ->> 'vencimento')::date), (x ->> 'pago')::bigint,
           least((x ->> 'pago')::bigint, n.valor_centavos), greatest((x ->> 'pago')::bigint - n.valor_centavos, 0), 'importacao',
           v_importacao::text || ':' || (k ->> 'ref') || ':' || n.numero, 'Importado de ' || trim(p_origem)
      from novas n
      join jsonb_array_elements(k -> 'parcelas') x on (x ->> 'numero')::integer = n.numero
     where coalesce((x ->> 'pago')::bigint, 0) > 0;
    -- Aniversários já passados: a correção está embutida nos valores da origem (fator 1),
    -- para o reajuste automático não aplicar de novo.
    insert into public.reajustes (tenant_id, contrato_id, aniversario, indice, competencia_inicial, competencia_final,
                                  fator, fator_aplicado, parcelas, diferenca_centavos)
    select e.tenant_id, c.id, a.aniv, c.indice_reajuste,
           ((date_trunc('month', a.aniv) - make_interval(months => c.reajuste_defasagem_meses)) - make_interval(months => c.reajuste_periodicidade_meses - 1))::date,
           (date_trunc('month', a.aniv) - make_interval(months => c.reajuste_defasagem_meses))::date,
           1, 1, 0, 0
      from public.contratos c
      cross join lateral (
        select ((k ->> 'data_venda')::date + make_interval(months => n * c.reajuste_periodicidade_meses))::date as aniv
          from generate_series(1, 100) n
      ) a
     where c.id = v_contrato and c.indice_reajuste is not null and a.aniv <= current_date;
    perform privado.atualizar_situacao_contrato(v_contrato, current_date);
  end loop;

  perform set_config('app.transicao_lote', '', true);
  perform set_config('app.carteira', '', true);
  return v_importacao;
end;
$$;

revoke execute on function public.importar_carteira(uuid, text, text, bigint, jsonb) from public, anon;
grant execute on function public.importar_carteira(uuid, text, text, bigint, jsonb) to authenticated;
