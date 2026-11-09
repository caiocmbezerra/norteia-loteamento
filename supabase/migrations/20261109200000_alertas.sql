-- Fase 8c · Alertas de risco: limites por cliente (parâmetros com vigência) e a inadimplência da
-- carteira em datas passadas, reconstruída das parcelas e dos pagamentos, para medir se cresce.

insert into public.parametros (chave, descricao, tipo, unidade, pendencia_legal) values
  ('alertas.horizonte_aporte_meses', 'Alertas: meses à frente para avisar de aporte', 'inteiro', 'meses', null),
  ('alertas.desvio_plano', 'Alertas: quanto acima do plano (custos e exposição) vira alerta', 'decimal', 'fração', null),
  ('alertas.inadimplencia_alta', 'Alertas: vencido sobre o saldo da carteira considerado alto', 'decimal', 'fração', null),
  ('alertas.crescimento_inadimplencia', 'Alertas: aumento da inadimplência em 60 dias que vira alerta', 'decimal', 'fração', null);
insert into public.parametro_valores (tenant_id, chave, escopo, escopo_id, valor, vigencia, motivo) values
  (null, 'alertas.horizonte_aporte_meses', 'plataforma', null, '3', daterange('2026-01-01', null), 'Sugestão da plataforma'),
  (null, 'alertas.desvio_plano', 'plataforma', null, '0.05', daterange('2026-01-01', null), 'Sugestão da plataforma'),
  (null, 'alertas.inadimplencia_alta', 'plataforma', null, '0.05', daterange('2026-01-01', null), 'Sugestão da plataforma'),
  (null, 'alertas.crescimento_inadimplencia', 'plataforma', null, '0.2', daterange('2026-01-01', null), 'Sugestão da plataforma');

-- Vencido e saldo da carteira em cada data: parcelas que existiam na data (vendidas até ela, não
-- criadas por aditivo posterior, não canceladas por aditivo anterior), menos o pago antes da data.
create function public.inadimplencia_historico(p_empreendimento uuid, p_datas date[])
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
    select jsonb_agg(jsonb_build_object('data', d.dia, 'vencido', coalesce(x.vencido, 0), 'saldo', coalesce(x.saldo, 0)) order by d.dia)
      from unnest(p_datas) d(dia)
      left join lateral (
        select sum(greatest(p.valor_centavos - coalesce(pg.pago, 0), 0)) filter (where p.vencimento < d.dia) as vencido,
               sum(greatest(p.valor_centavos - coalesce(pg.pago, 0), 0)) as saldo
          from public.parcelas p
          join public.contratos c on c.id = p.contrato_id
          join public.vendas v on v.id = c.venda_id
          left join public.aditivos ao on ao.id = p.aditivo_origem_id
          left join public.aditivos ac on ac.id = p.aditivo_cancelamento_id
          left join lateral (
            select sum(r.principal_centavos) as pago from public.recebimentos r
             where r.parcela_id = p.id and r.estornado_em is null and r.data_pagamento < d.dia
          ) pg on true
         where c.empreendimento_id = e.id
           and v.data_venda <= d.dia
           and (ao.id is null or ao.data <= d.dia)
           and (p.situacao <> 'cancelada' or (ac.id is not null and ac.data > d.dia))
      ) x on true
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.inadimplencia_historico(uuid, date[]) from public, anon;
grant execute on function public.inadimplencia_historico(uuid, date[]) to authenticated;
