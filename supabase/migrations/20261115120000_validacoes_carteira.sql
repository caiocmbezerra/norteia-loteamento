-- Validações da carteira (achados da auditoria de QA, docs/qa-norteia-loteamento/07):
--   A-01: criar_contrato confere o plano inteiro com o motor (RN-K01, RN-K02): mesmas parcelas,
--         vencimentos, juros, amortizações e valores, em centavos, para Price e SAC.
--   A-10: nova baixa com a referência de um recebimento estornado é recusada com mensagem clara
--         (antes devolvia o id do estornado, sem baixar).
-- Regras que dependem de decisão do dono do produto (A-02, A-03, A-04, A-05) não entram aqui: A-03
-- pode recusar caso legítimo (sinal pago antes da data formal da venda).

-- Arredondamento meio-para-par, o mesmo do motor (decimal.js ROUND_HALF_EVEN).
create function privado.arredondar_par(p numeric)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when p - floor(p) = 0.5 then (floor(p) + (floor(p)::bigint % 2))::bigint else round(p)::bigint end
$$;

-- Plano de pagamento da venda, idêntico ao de gerarParcelasContrato (packages/motor-financeiro/src/contrato.ts):
-- entrada como parcela 0 na data da venda; Price com prestação arredondada uma vez ou SAC com
-- amortização arredondada; juros de cada mês arredondados; a última parcela fecha o saldo (RN-K02);
-- vencimentos mensais a partir da 1ª parcela, no último dia do mês quando o dia não existe.
create function privado.plano_pagamento(
  p_preco bigint, p_entrada bigint, p_data_venda date, p_parcelas integer,
  p_juros numeric, p_sistema text, p_primeira date)
returns table (numero integer, vencimento date, valor bigint, amortizacao bigint, juros bigint)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_principal numeric := p_preco - p_entrada;
  v_prestacao bigint;
  v_amort_sac bigint;
  v_saldo bigint;
  v_juros bigint;
  v_amort bigint;
begin
  if p_entrada > 0 then
    numero := 0; vencimento := p_data_venda; valor := p_entrada; amortizacao := p_entrada; juros := 0;
    return next;
  end if;
  if coalesce(p_parcelas, 0) = 0 then
    return;
  end if;
  v_prestacao := privado.arredondar_par(case when p_juros = 0 then v_principal / p_parcelas
    else v_principal * p_juros / (1 - 1 / power(1 + p_juros, p_parcelas)) end);
  v_amort_sac := privado.arredondar_par(v_principal / p_parcelas);
  v_saldo := v_principal;
  for k in 1..p_parcelas loop
    v_juros := privado.arredondar_par(v_saldo * p_juros);
    v_amort := case when k = p_parcelas then v_saldo
                    when p_sistema = 'price' then v_prestacao - v_juros
                    else v_amort_sac end;
    v_saldo := v_saldo - v_amort;
    numero := k;
    vencimento := (p_primeira + make_interval(months => k - 1))::date;
    valor := v_amort + v_juros; amortizacao := v_amort; juros := v_juros;
    return next;
  end loop;
end;
$$;

create function privado.plano_da_venda(p_venda uuid)
returns table (numero integer, vencimento date, valor bigint, amortizacao bigint, juros bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select pl.* from public.vendas v,
    lateral privado.plano_pagamento(v.preco_centavos, v.entrada_centavos, v.data_venda, v.parcelas,
                                    v.juros_mensal, v.sistema, v.primeira_parcela_em) pl
   where v.id = p_venda
$$;
revoke execute on function privado.plano_da_venda(uuid) from public, anon;
revoke execute on function privado.arredondar_par(numeric) from public, anon;
revoke execute on function privado.plano_pagamento(bigint, bigint, date, integer, numeric, text, date) from public, anon;

create or replace function public.criar_contrato(p_venda uuid, p_parcelas jsonb, p_indice text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- RN-K01 (achado A-01): o plano é exatamente o do motor para as condições da venda.
  if exists (
    select 1
      from privado.plano_da_venda(v.id) e
      full join (select (p ->> 'numero')::integer as numero, (p ->> 'vencimento')::date as vencimento,
                        (p ->> 'valor_centavos')::bigint as valor, (p ->> 'amortizacao_centavos')::bigint as amortizacao,
                        (p ->> 'juros_centavos')::bigint as juros
                   from jsonb_array_elements(p_parcelas) p) r using (numero)
     where e.numero is null or r.numero is null
        or (e.vencimento, e.valor, e.amortizacao, e.juros) is distinct from (r.vencimento, r.valor, r.amortizacao, r.juros)
  ) then
    raise exception 'As parcelas não conferem com o plano da venda (sistema, juros, prazo e vencimentos).'
      using errcode = 'check_violation', hint = 'plano_divergente';
  end if;

  v_multa := coalesce(
    (public.parametro_vigente('carteira.multa_atraso', v.data_venda, v.tenant_id, 'empreendimento', v.empreendimento_id) #>> array[]::text[])::numeric,
    0);
  v_juros := coalesce(
    (public.parametro_vigente('carteira.juros_mora_mensal', v.data_venda, v.tenant_id, 'empreendimento', v.empreendimento_id) #>> array[]::text[])::numeric,
    0);

  insert into public.contratos (
    tenant_id, empreendimento_id, venda_id, lote_id, comprador_id, indice_reajuste, multa_atraso, juros_mora_mensal,
    reajuste_periodicidade_meses, reajuste_defasagem_meses, reajuste_negativo
  ) values (
    v.tenant_id, v.empreendimento_id, v.id, v.lote_id, v.comprador_id, p_indice, v_multa, v_juros,
    coalesce((public.parametro_vigente('carteira.reajuste_periodicidade_meses', v.data_venda, v.tenant_id, 'empreendimento', v.empreendimento_id) #>> array[]::text[])::integer, 12),
    coalesce((public.parametro_vigente('carteira.reajuste_defasagem_meses', v.data_venda, v.tenant_id, 'empreendimento', v.empreendimento_id) #>> array[]::text[])::integer, 2),
    coalesce(public.parametro_vigente('carteira.reajuste_negativo', v.data_venda, v.tenant_id, 'empreendimento', v.empreendimento_id) #>> array[]::text[], 'ignorar')
  ) returning id into v_id;

  insert into public.parcelas (tenant_id, contrato_id, numero, vencimento, valor_centavos, amortizacao_centavos, juros_centavos)
  select v.tenant_id, v_id, (p ->> 'numero')::integer, (p ->> 'vencimento')::date,
         (p ->> 'valor_centavos')::bigint, (p ->> 'amortizacao_centavos')::bigint, (p ->> 'juros_centavos')::bigint
    from jsonb_array_elements(p_parcelas) p;
  return v_id;
end;
$function$;

create or replace function privado.baixar_parcela(p_parcela uuid, p_data date, p_principal bigint, p_multa bigint, p_juros_mora bigint, p_desconto bigint, p_origem text, p_referencia text, p_observacao text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  pa public.parcelas;
  c public.contratos;
  v_id uuid;
begin
  select * into pa from public.parcelas where id = p_parcela for update;
  select * into c from public.contratos where id = pa.contrato_id for update;
  if pa.id is null then
    raise exception 'Parcela não encontrada.' using errcode = 'no_data_found';
  end if;

  if p_referencia is not null then
    select id into v_id from public.recebimentos
     where tenant_id = pa.tenant_id and origem = p_origem and referencia_externa = p_referencia;
    if v_id is not null then
      -- Achado A-10: o aviso já registrado e depois estornado não volta como se tivesse baixado.
      if exists (select 1 from public.recebimentos where id = v_id and estornado_em is not null) then
        raise exception 'Este aviso de pagamento já foi registrado e estornado; registre o novo pagamento com outra referência.'
          using errcode = 'check_violation', hint = 'referencia_estornada';
      end if;
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
$function$;
