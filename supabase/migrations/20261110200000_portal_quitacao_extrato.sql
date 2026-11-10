-- Portal do adquirente: dados para o extrato em PDF e para a simulação de quitação antecipada
-- (item 5 do plano aprovado em 10/11/2026). O comprador passa a receber as condições do próprio
-- contrato (taxa, multa e juros de mora) e a identificação para o extrato; os cálculos são do motor.
create or replace function public.portal_contrato(p_contrato uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.contratos;
  v jsonb;
begin
  select * into c from public.contratos where id = p_contrato;
  if c.id is null or not privado.e_comprador(c.comprador_id) then
    raise exception 'Contrato não encontrado.' using errcode = 'insufficient_privilege';
  end if;
  select jsonb_build_object(
    'id', c.id, 'situacao', c.situacao, 'indice', c.indice_reajuste, 'quitado_em', c.quitado_em,
    'numero', c.numero,
    'comprador', (select nome from public.compradores where id = c.comprador_id),
    'vendedora', (select s.razao_social from public.empreendimentos e join public.spes s on s.id = e.spe_id where e.id = c.empreendimento_id),
    'juros_mensal', (select v.juros_mensal from public.vendas v where v.id = c.venda_id),
    'multa_atraso', c.multa_atraso,
    'juros_mora_mensal', c.juros_mora_mensal,
    'loteadora', (select nome from public.tenants where id = c.tenant_id),
    'empreendimento', (select nome from public.empreendimentos where id = c.empreendimento_id),
    'lote', (select 'Quadra ' || q.codigo || ' · Lote ' || l.numero from public.lotes l join public.quadras q on q.id = l.quadra_id where l.id = c.lote_id),
    'boleto_disponivel', exists (select 1 from public.integracoes_asaas where tenant_id = c.tenant_id and ativo),
    'parcelas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'numero', p.numero, 'vencimento', p.vencimento, 'valor', p.valor_centavos, 'pago', p.pago_centavos,
        'situacao', p.situacao,
        'link', (select link_fatura from public.cobrancas co where co.parcela_id = p.id and co.situacao = 'pendente' limit 1)
      ) order by p.numero) from public.parcelas p where p.contrato_id = c.id and p.situacao <> 'cancelada'), '[]'::jsonb),
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('data', r.data_pagamento, 'valor', r.valor_centavos, 'parcela', p.numero) order by r.data_pagamento)
      from public.recebimentos r join public.parcelas p on p.id = r.parcela_id
      where p.contrato_id = c.id and r.estornado_em is null), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
