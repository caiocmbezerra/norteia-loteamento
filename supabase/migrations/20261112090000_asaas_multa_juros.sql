-- Pagamento em atraso pelo Asaas: separa multa e juros de mora (o Asaas manda os dois somados
-- em interestValue). Validado no sandbox em 12/11/2026 (pendência VALIDAR NO SANDBOX da Fase 5).

create or replace function privado.conciliar_cobranca(p_cobranca uuid, p_pagamento jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  co public.cobrancas;
  pa public.parcelas;
  v_status text := p_pagamento ->> 'status';
  v_pago bigint;
  v_dif bigint;
  v_data date;
  v_rec uuid;
  v_multa_pct numeric;
  v_multa bigint := 0;
begin
  select * into co from public.cobrancas where id = p_cobranca for update;
  perform set_config('app.carteira', 'on', true);
  update public.cobrancas set retorno = p_pagamento, verificado_em = now() where id = co.id;
  if co.situacao <> 'pendente' then
    perform set_config('app.carteira', '', true);
    return 'ja_processada';
  end if;

  if v_status in ('DELETED', 'REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED') or coalesce((p_pagamento ->> 'deleted')::boolean, false) then
    update public.cobrancas set situacao = 'cancelada', motivo = 'Cancelada ou estornada no Asaas (' || coalesce(v_status, 'removida') || ')' where id = co.id;
    perform set_config('app.carteira', '', true);
    return 'cancelada';
  end if;
  if v_status not in ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH') then
    perform set_config('app.carteira', '', true);
    return 'pendente';
  end if;

  select * into pa from public.parcelas where id = co.parcela_id;
  -- Conferido no sandbox em 12/11/2026: com pagamento em atraso, "value" traz o valor pago,
  -- "originalValue" o original e "interestValue" multa + juros somados.
  v_pago := round(((p_pagamento ->> 'value')::numeric
                   + case when p_pagamento ? 'originalValue' and p_pagamento ->> 'originalValue' is not null then 0
                          else coalesce((p_pagamento ->> 'interestValue')::numeric, 0) end) * 100);
  v_data := coalesce(p_pagamento ->> 'clientPaymentDate', p_pagamento ->> 'paymentDate', p_pagamento ->> 'confirmedDate')::date;
  if pa.situacao <> 'aberta' or pa.valor_centavos - pa.pago_centavos <> co.valor_centavos or v_data is null then
    update public.cobrancas set situacao = 'divergente', motivo = 'Parcela alterada desde a emissão; conferir e baixar manualmente.' where id = co.id;
    perform set_config('app.carteira', '', true);
    return 'divergente';
  end if;
  v_dif := v_pago - co.valor_centavos;
  -- O Asaas soma multa e juros; a multa do contrato (cobrada só após o vencimento da cobrança)
  -- sai primeiro e o resto é juros de mora.
  if v_dif > 0 and v_data > co.vencimento then
    select c.multa_atraso into v_multa_pct from public.contratos c where c.id = pa.contrato_id;
    v_multa := least(v_dif, round(co.valor_centavos * coalesce(v_multa_pct, 0))::bigint);
  end if;
  v_rec := privado.baixar_parcela(
    pa.id, least(v_data, current_date), co.valor_centavos, v_multa, greatest(v_dif, 0) - v_multa, greatest(-v_dif, 0),
    'asaas', co.asaas_id, 'Pago no Asaas (' || coalesce(p_pagamento ->> 'billingType', '?') || ')');
  perform set_config('app.carteira', 'on', true);
  update public.cobrancas set situacao = 'paga', recebimento_id = v_rec where id = co.id;
  perform set_config('app.carteira', '', true);
  return 'paga';
end;
$$;
