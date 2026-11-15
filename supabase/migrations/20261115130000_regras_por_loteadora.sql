-- Regras de cada loteadora para recebimento e venda (achados A-02 a A-05 da auditoria de QA;
-- decisão do dono do produto em 15/11/2026: "cada loteadora tem suas regras", D-122, D-059).
-- Viram parâmetros com vigência e escopo (loteadora, empresa, SPE, empreendimento), editáveis em
-- Configurações → Parâmetros. Sem valor da loteadora vale a sugestão da plataforma, que mantém o
-- comportamento anterior — nada muda até a loteadora definir a regra dela:
--   carteira.encargos_recebimento ........ 'informado' ('contrato' confere multa e juros com o contrato, RN-K04)
--   carteira.pagamento_antes_venda_dias .. sem limite
--   carteira.desconto_recebimento_maximo . sem limite
--   comercial.juros_mensal_maximo ........ sem limite
--   comercial.venda_dias_futuro_maximo ... sem limite
--   comercial.primeira_parcela_antes_venda permitido
-- As regras valem na baixa manual e na venda; Asaas e importação seguem os valores da origem.

insert into public.parametros (chave, descricao, tipo, unidade, valores_permitidos, pendencia_legal) values
  ('carteira.encargos_recebimento', 'Multa e juros de mora no recebimento manual: conferidos com o contrato ou informados pela equipe', 'texto', null, '{contrato,informado}', 'PL-04'),
  ('carteira.pagamento_antes_venda_dias', 'Até quantos dias antes da data da venda um pagamento pode ser registrado (ex.: sinal na reserva); vazio = sem limite', 'inteiro', 'dias', null, null),
  ('carteira.desconto_recebimento_maximo', 'Desconto máximo no recebimento, como fração do valor devido, sem o dono; vazio = sem limite', 'decimal', 'fração', null, null),
  ('comercial.juros_mensal_maximo', 'Taxa de juros máxima do financiamento ao comprador, ao mês; vazio = sem limite', 'decimal', 'fração ao mês', null, 'PL-05'),
  ('comercial.venda_dias_futuro_maximo', 'Até quantos dias à frente a data da venda pode ser registrada; vazio = sem limite', 'inteiro', 'dias', null, null),
  ('comercial.primeira_parcela_antes_venda', 'Permite que a 1ª parcela vença antes da data da venda', 'booleano', null, null, null);
insert into public.parametro_valores (tenant_id, chave, escopo, escopo_id, valor, vigencia, motivo) values
  (null, 'carteira.encargos_recebimento', 'plataforma', null, '"informado"', daterange('2020-01-01', null), 'Sugestão da plataforma: mantém o comportamento anterior'),
  (null, 'comercial.primeira_parcela_antes_venda', 'plataforma', null, 'true', daterange('2020-01-01', null), 'Sugestão da plataforma');

create or replace function public.vender_lote(p_lote uuid, p_venda jsonb, p_justificativa text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Regras de cada loteadora para as condições da venda (achado A-05, D-122). Sem valor
  -- definido pela loteadora, não há limite (sugestão da plataforma).
  v_limite := (public.parametro_vigente('comercial.juros_mensal_maximo', v_data, l.tenant_id, 'empreendimento', e.id) #>> array[]::text[])::numeric;
  if v_limite is not null and coalesce((p_venda ->> 'juros_mensal')::numeric, 0) > v_limite then
    raise exception 'Juros de % ao mês passam do limite da loteadora (%).',
      privado.percentual((p_venda ->> 'juros_mensal')::numeric), privado.percentual(v_limite)
      using errcode = 'check_violation', hint = 'juros_acima_do_limite';
  end if;
  v_limite := (public.parametro_vigente('comercial.venda_dias_futuro_maximo', current_date, l.tenant_id, 'empreendimento', e.id) #>> array[]::text[])::numeric;
  if v_limite is not null and v_data > current_date + v_limite::integer then
    raise exception 'A data da venda passa do limite da loteadora (até % dias à frente).', v_limite::integer
      using errcode = 'check_violation', hint = 'data_venda_futura';
  end if;
  if (p_venda ->> 'primeira_parcela_em') is not null and (p_venda ->> 'primeira_parcela_em')::date < v_data
     and not coalesce((public.parametro_vigente('comercial.primeira_parcela_antes_venda', v_data, l.tenant_id, 'empreendimento', e.id) #>> array[]::text[])::boolean, true) then
    raise exception 'A primeira parcela não pode vencer antes da venda (regra da loteadora).'
      using errcode = 'check_violation', hint = 'primeira_parcela_antes_venda';
  end if;
  v_limite := null;

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
  v_venda public.vendas;
  v_dias integer;
  v_regra text;
  v_multa bigint;
  v_juros bigint;
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

  -- Regras de cada loteadora para o recebimento manual (achados A-02, A-03, A-04; D-122). Valem para
  -- a baixa manual; Asaas e importação seguem os valores conferidos na origem.
  if p_origem = 'manual' then
    select * into v_venda from public.vendas where id = c.venda_id;
    -- A-03: até quantos dias antes da venda um pagamento (ex.: sinal na reserva) pode ser datado.
    v_dias := (public.parametro_vigente('carteira.pagamento_antes_venda_dias', p_data, pa.tenant_id, 'empreendimento', c.empreendimento_id) #>> array[]::text[])::integer;
    if v_dias is not null and p_data < v_venda.data_venda - v_dias then
      raise exception 'O pagamento não pode ser anterior a % dias da venda (regra da loteadora).', v_dias
        using errcode = 'check_violation', hint = 'data_anterior_venda';
    end if;
    -- A-02: encargos conferidos com o contrato (multa única + juros simples pro rata, mês de 30
    -- dias, sobre o principal pago), como o motor calcula na tela; dispensa vai como desconto.
    v_regra := coalesce(public.parametro_vigente('carteira.encargos_recebimento', p_data, pa.tenant_id, 'empreendimento', c.empreendimento_id) #>> array[]::text[], 'informado');
    if v_regra = 'contrato' then
      v_dias := greatest(p_data - pa.vencimento, 0);
      v_multa := case when v_dias > 0 then privado.arredondar_par(p_principal * c.multa_atraso) else 0 end;
      v_juros := case when v_dias > 0 then privado.arredondar_par(p_principal * c.juros_mora_mensal * v_dias / 30) else 0 end;
      if coalesce(p_multa, 0) <> v_multa or coalesce(p_juros_mora, 0) <> v_juros then
        raise exception 'Multa e juros de mora devem seguir o contrato (multa %, juros %); para dispensar, use o desconto.',
          privado.moeda(v_multa), privado.moeda(v_juros)
          using errcode = 'check_violation', hint = 'encargos_fora_do_contrato';
      end if;
    end if;
    -- A-04: desconto acima do limite da loteadora só pelo dono.
    v_dias := null;
    if coalesce(p_desconto, 0) > 0 then
      declare
        v_max numeric := (public.parametro_vigente('carteira.desconto_recebimento_maximo', p_data, pa.tenant_id, 'empreendimento', c.empreendimento_id) #>> array[]::text[])::numeric;
      begin
        if v_max is not null and p_desconto > round((p_principal + p_multa + p_juros_mora) * v_max)
           and not privado.pode('tenant.administrar', pa.tenant_id) then
          raise exception 'Desconto acima de % do valor devido exige o dono da loteadora.', privado.percentual(v_max)
            using errcode = 'check_violation', hint = 'desconto_acima_do_limite';
        end if;
      end;
    end if;
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
