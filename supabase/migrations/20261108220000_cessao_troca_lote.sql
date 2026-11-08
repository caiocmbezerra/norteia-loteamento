-- Fase 5c-3a · Cessão de contrato e troca de lote por aditivo (RN-K07).
-- Cessão: o contrato passa a outro comprador (cessionário), sem mudar as parcelas.
-- Troca de lote: o contrato passa a outro lote disponível; a diferença de preço entra no
-- saldo, que vira um novo plano do motor (como na renegociação).

alter table public.aditivos drop constraint aditivos_tipo_check;
alter table public.aditivos add constraint aditivos_tipo_check check (tipo in ('renegociacao', 'cessao', 'troca_lote'));

-- Cessão só com o contrato em dia: parâmetro de cada cliente (D-059). // VALIDAR COM ADVOGADO
insert into public.parametros (chave, descricao, tipo, unidade, pendencia_legal) values
  ('carteira.cessao_exige_adimplencia', 'Cessão do contrato só com todas as parcelas vencidas pagas', 'booleano', null, 'PL-18');
insert into public.parametro_valores (tenant_id, chave, escopo, escopo_id, valor, vigencia, motivo) values
  (null, 'carteira.cessao_exige_adimplencia', 'plataforma', null, 'true', daterange('2026-01-01', null), 'Sugestão da plataforma');

create function privado.saldo_aberto(p_contrato uuid)
returns bigint
language sql
stable
set search_path = ''
as $$ select coalesce(sum(valor_centavos - pago_centavos), 0)::bigint from public.parcelas where contrato_id = p_contrato and situacao = 'aberta' $$;

-- ---------------------------------------------------------------------------
-- Cessão
-- ---------------------------------------------------------------------------

create function public.ceder_contrato(p_contrato uuid, p_cessionario uuid, p_data date, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contratos;
  v_saldo bigint;
  v_exige boolean;
  v_id uuid;
begin
  select * into c from public.contratos where id = p_contrato for update;
  if c.id is null or not (
    privado.pode('venda.registrar', c.tenant_id, 'empreendimento', c.empreendimento_id)
    or privado.pode('carteira.receber', c.tenant_id, 'empreendimento', c.empreendimento_id)
  ) then
    raise exception 'Sem permissão para ceder o contrato.' using errcode = 'insufficient_privilege';
  end if;
  if c.situacao <> 'vigente' then
    raise exception 'Só contratos vigentes são cedidos.' using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da cessão.' using errcode = 'check_violation', hint = 'motivo';
  end if;
  if p_data is null or p_data > current_date then
    raise exception 'A data do aditivo não pode estar no futuro.' using errcode = 'check_violation';
  end if;
  if p_cessionario = c.comprador_id or not exists (
    select 1 from public.compradores where id = p_cessionario and tenant_id = c.tenant_id
  ) then
    raise exception 'Escolha um cessionário diferente do comprador atual.' using errcode = 'check_violation', hint = 'cessionario';
  end if;
  v_exige := coalesce(
    (public.parametro_vigente('carteira.cessao_exige_adimplencia', p_data, c.tenant_id, 'empreendimento', c.empreendimento_id) #>> array[]::text[])::boolean,
    true);
  if v_exige and exists (
    select 1 from public.parcelas where contrato_id = c.id and situacao = 'aberta' and vencimento < p_data
  ) then
    raise exception 'O contrato tem parcelas vencidas: regularize antes da cessão.' using errcode = 'check_violation', hint = 'inadimplente';
  end if;
  if exists (
    select 1 from public.cobrancas co join public.parcelas pa on pa.id = co.parcela_id
     where pa.contrato_id = c.id and co.situacao = 'pendente'
  ) then
    raise exception 'Cancele as cobranças pendentes no Asaas antes da cessão.' using errcode = 'check_violation', hint = 'cobranca_pendente';
  end if;
  v_saldo := privado.saldo_aberto(c.id);
  if v_saldo <= 0 then
    raise exception 'O contrato não tem saldo em aberto.' using errcode = 'check_violation';
  end if;

  perform set_config('app.carteira', 'on', true);
  perform set_config('app.motivo', p_motivo, true);
  insert into public.aditivos (
    tenant_id, contrato_id, tipo, data, motivo, saldo_anterior_centavos, novo_saldo_centavos, condicoes, parcelas_anteriores
  ) values (
    c.tenant_id, c.id, 'cessao', p_data, trim(p_motivo), v_saldo, v_saldo,
    jsonb_build_object('cedente_id', c.comprador_id, 'cessionario_id', p_cessionario), '[]'::jsonb
  ) returning id into v_id;
  update public.contratos set comprador_id = p_cessionario where id = c.id;
  perform set_config('app.carteira', '', true);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Troca de lote
-- ---------------------------------------------------------------------------

-- p_parcelas: novo plano do motor para o saldo + (preço novo − preço atual), numerado a partir
-- da última parcela. O lote antigo volta a ficar disponível.
create function public.trocar_lote(
  p_contrato uuid,
  p_lote_novo uuid,
  p_data date,
  p_motivo text,
  p_preco_novo bigint,
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
  v public.vendas;
  l public.lotes;
  v_saldo bigint;
  v_novo bigint;
  v_ultimo integer;
  v_qtd integer;
  v_soma bigint;
  v_id uuid;
begin
  select * into c from public.contratos where id = p_contrato for update;
  if c.id is null or not privado.pode('venda.registrar', c.tenant_id, 'empreendimento', c.empreendimento_id) then
    raise exception 'Sem permissão para trocar o lote.' using errcode = 'insufficient_privilege';
  end if;
  if c.situacao <> 'vigente' then
    raise exception 'Só contratos vigentes trocam de lote.' using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da troca.' using errcode = 'check_violation', hint = 'motivo';
  end if;
  if p_data is null or p_data > current_date then
    raise exception 'A data do aditivo não pode estar no futuro.' using errcode = 'check_violation';
  end if;
  select * into l from public.lotes where id = p_lote_novo for update;
  if l.id is null or l.empreendimento_id <> c.empreendimento_id or l.id = c.lote_id then
    raise exception 'Escolha outro lote do mesmo empreendimento.' using errcode = 'check_violation', hint = 'lote';
  end if;
  if l.status <> 'disponivel' then
    raise exception 'O lote escolhido não está disponível (situação: %).', l.status using errcode = 'check_violation', hint = 'lote_indisponivel';
  end if;
  if exists (
    select 1 from public.cobrancas co join public.parcelas pa on pa.id = co.parcela_id
     where pa.contrato_id = c.id and pa.situacao = 'aberta' and co.situacao = 'pendente'
  ) then
    raise exception 'Cancele as cobranças pendentes no Asaas antes da troca.' using errcode = 'check_violation', hint = 'cobranca_pendente';
  end if;
  select * into v from public.vendas where id = c.venda_id for update;
  if p_preco_novo is null or p_preco_novo <= v.entrada_centavos then
    raise exception 'O preço do novo lote precisa ser maior que a entrada já paga.' using errcode = 'check_violation', hint = 'preco';
  end if;

  v_saldo := privado.saldo_aberto(c.id);
  v_novo := v_saldo + p_preco_novo - v.preco_centavos;
  if v_novo <= 0 then
    raise exception 'Com esse preço não resta saldo: trate a diferença como devolução (distrato).' using errcode = 'check_violation', hint = 'preco';
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
    raise exception 'O novo plano não confere com o saldo após a troca.' using errcode = 'check_violation', hint = 'parcelas_inconsistentes';
  end if;

  perform set_config('app.carteira', 'on', true);
  perform set_config('app.transicao_lote', 'on', true);
  perform set_config('app.motivo', p_motivo, true);
  insert into public.aditivos (
    tenant_id, contrato_id, tipo, data, motivo, saldo_anterior_centavos, encargos_incorporados_centavos,
    desconto_centavos, novo_saldo_centavos, condicoes, parcelas_anteriores
  ) values (
    c.tenant_id, c.id, 'troca_lote', p_data, trim(p_motivo), v_saldo,
    greatest(p_preco_novo - v.preco_centavos, 0), greatest(v.preco_centavos - p_preco_novo, 0), v_novo,
    coalesce(p_condicoes, '{}'::jsonb) || jsonb_build_object(
      'lote_anterior_id', c.lote_id, 'lote_novo_id', l.id,
      'preco_anterior_centavos', v.preco_centavos, 'preco_novo_centavos', p_preco_novo),
    (select coalesce(jsonb_agg(jsonb_build_object('numero', numero, 'vencimento', vencimento, 'valor_centavos', valor_centavos,
                                                  'pago_centavos', pago_centavos) order by numero), '[]'::jsonb)
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

  update public.lotes set status = 'disponivel' where id = c.lote_id;
  update public.lotes set status = 'vendido' where id = l.id;
  update public.vendas set lote_id = l.id, preco_centavos = p_preco_novo where id = v.id;
  update public.contratos set lote_id = l.id where id = c.id;
  perform set_config('app.transicao_lote', '', true);
  perform set_config('app.carteira', '', true);
  return v_id;
end;
$$;

revoke execute on function public.ceder_contrato(uuid, uuid, date, text) from public, anon;
revoke execute on function public.trocar_lote(uuid, uuid, date, text, bigint, jsonb, jsonb) from public, anon;
grant execute on function public.ceder_contrato(uuid, uuid, date, text) to authenticated;
grant execute on function public.trocar_lote(uuid, uuid, date, text, bigint, jsonb, jsonb) to authenticated;
revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to authenticated, service_role;
revoke execute on function privado.baixar_parcela(uuid, date, bigint, bigint, bigint, bigint, text, text, text) from authenticated, service_role;
revoke execute on function privado.asaas_chamar(text, text, text, text, jsonb) from authenticated, service_role;
revoke execute on function privado.asaas_requisicao(uuid, text, text, jsonb) from authenticated, service_role;
revoke execute on function privado.conciliar_cobranca(uuid, jsonb) from authenticated, service_role;
revoke execute on function privado.reajustar_contrato(uuid, date) from authenticated;
revoke execute on function privado.gravar_serie_indice(text, jsonb) from authenticated;
