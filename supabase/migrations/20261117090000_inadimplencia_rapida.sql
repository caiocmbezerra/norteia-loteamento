-- Inadimplência histórica mais rápida (sobra do achado A-12 da auditoria de QA): com 3.000
-- contratos, 12 datas levavam ≈ 4,4 s mesmo com o índice de recebimentos por parcela, porque o
-- pago de cada parcela era somado de novo para cada data (201 mil × 12 subconsultas).
-- Agora os recebimentos são somados uma vez por (data, parcela) e cruzados por hash.
-- Mesma regra de antes: saldo e vencido de cada data consideram as vendas até a data, parcelas
-- de aditivo só a partir do aditivo, parcelas canceladas por aditivo até o aditivo, e os
-- recebimentos não estornados pagos antes da data.
create or replace function public.inadimplencia_historico(p_empreendimento uuid, p_datas date[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.empreendimentos;
begin
  select * into e from public.empreendimentos where id = p_empreendimento;
  if e.id is null or not privado.pode('carteira.ler', e.tenant_id, 'empreendimento', e.id) then
    raise exception 'Sem permissão para a carteira deste empreendimento.' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    with datas as (
      select distinct dia from unnest(p_datas) dia where dia is not null
    ),
    parc as (
      select p.id, p.valor_centavos, p.vencimento, p.situacao, v.data_venda,
             ao.id as ao_id, ao.data as ao_data, ac.id as ac_id, ac.data as ac_data
        from public.parcelas p
        join public.contratos c on c.id = p.contrato_id
        join public.vendas v on v.id = c.venda_id
        left join public.aditivos ao on ao.id = p.aditivo_origem_id
        left join public.aditivos ac on ac.id = p.aditivo_cancelamento_id
       where c.empreendimento_id = e.id
    ),
    pago as (
      select d.dia, r.parcela_id, sum(r.principal_centavos) as pago
        from datas d
        join public.recebimentos r on r.data_pagamento < d.dia and r.estornado_em is null
        join parc on parc.id = r.parcela_id
       group by d.dia, r.parcela_id
    ),
    por_data as (
      select d.dia,
             sum(greatest(parc.valor_centavos - coalesce(pago.pago, 0), 0)) filter (where parc.vencimento < d.dia) as vencido,
             sum(greatest(parc.valor_centavos - coalesce(pago.pago, 0), 0)) as saldo
        from datas d
        join parc on parc.data_venda <= d.dia
                 and (parc.ao_id is null or parc.ao_data <= d.dia)
                 and (parc.situacao <> 'cancelada' or (parc.ac_id is not null and parc.ac_data > d.dia))
        left join pago on pago.dia = d.dia and pago.parcela_id = parc.id
       group by d.dia
    )
    select jsonb_agg(jsonb_build_object('data', x.dia, 'vencido', coalesce(pd.vencido, 0), 'saldo', coalesce(pd.saldo, 0))
                     order by x.dia)
      from unnest(p_datas) x(dia)
      left join por_data pd on pd.dia = x.dia
  ), '[]'::jsonb);
end;
$$;
