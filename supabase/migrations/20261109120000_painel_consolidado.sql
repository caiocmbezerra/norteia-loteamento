-- Fase 6d · Painel consolidado da loteadora: agregados operacionais por empreendimento em uma
-- só consulta (meta: 10 empreendimentos e 3.000 lotes em menos de 2 s). Os indicadores de
-- plano vêm da foto aprovada (plano_versoes); TIR e exposição atuais ficam no painel de cada
-- empreendimento, que roda a projeção completa.

create function public.painel_consolidado(p_tenant uuid, p_hoje date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if not privado.pode('financeiro.ler', p_tenant) then
    raise exception 'Sem permissão para o painel consolidado.' using errcode = 'insufficient_privilege';
  end if;

  with
  emp as (
    select e.id, e.nome, e.situacao, e.spe_id, s.razao_social as spe
      from public.empreendimentos e join public.spes s on s.id = e.spe_id
     where e.tenant_id = p_tenant
  ),
  lotes as (
    select empreendimento_id,
           count(*) as total,
           count(*) filter (where status = 'vendido') as vendidos,
           count(*) filter (where status = 'disponivel') as disponiveis,
           count(*) filter (where status = 'reservado') as reservados,
           count(*) filter (where status = 'permuta') as permuta,
           coalesce(sum(preco_base_centavos) filter (where status in ('disponivel', 'reservado')), 0) as estoque_centavos
      from public.lotes where tenant_id = p_tenant group by empreendimento_id
  ),
  vendas as (
    select empreendimento_id, coalesce(sum(preco_centavos), 0) as vgv_vendido
      from public.vendas where tenant_id = p_tenant and situacao = 'ativa' group by empreendimento_id
  ),
  parcelas as (
    select c.empreendimento_id,
           coalesce(sum(p.valor_centavos - p.pago_centavos), 0) as saldo,
           coalesce(sum(p.valor_centavos - p.pago_centavos) filter (where p.vencimento < p_hoje), 0) as vencido,
           count(distinct c.id) filter (where p.vencimento < p_hoje) as inadimplentes
      from public.parcelas p join public.contratos c on c.id = p.contrato_id
     where p.tenant_id = p_tenant and p.situacao = 'aberta'
     group by c.empreendimento_id
  ),
  recebidos as (
    select c.empreendimento_id,
           coalesce(sum(r.valor_centavos), 0) as recebido,
           coalesce(sum(r.valor_centavos) filter (where r.data_pagamento >= date_trunc('month', p_hoje)::date), 0) as recebido_mes
      from public.recebimentos r
      join public.parcelas p on p.id = r.parcela_id
      join public.contratos c on c.id = p.contrato_id
     where r.tenant_id = p_tenant and r.estornado_em is null
     group by c.empreendimento_id
  ),
  pagos as (
    select k.empreendimento_id, coalesce(sum(g.valor_centavos), 0) as pago
      from public.pagamentos g join public.contas_pagar k on k.id = g.conta_id
     where k.tenant_id = p_tenant and g.estornado_em is null
     group by k.empreendimento_id
  ),
  a_pagar as (
    select k.empreendimento_id,
           coalesce(sum(k.valor_centavos - coalesce(pg.pago, 0)), 0) as a_pagar
      from public.contas_pagar k
      left join (
        select conta_id, sum(valor_centavos) as pago from public.pagamentos where estornado_em is null group by conta_id
      ) pg on pg.conta_id = k.id
     where k.tenant_id = p_tenant and k.cancelada_em is null
     group by k.empreendimento_id
  ),
  devolucoes as (
    select c.empreendimento_id, coalesce(sum(d.valor_centavos) filter (where d.pago_em is null), 0) as a_devolver
      from public.devolucoes d
      join public.distratos t on t.id = d.distrato_id
      join public.contratos c on c.id = t.contrato_id
     where d.tenant_id = p_tenant
     group by c.empreendimento_id
  ),
  plano as (
    select distinct on (empreendimento_id) empreendimento_id, versao, resumo
      from public.plano_versoes where tenant_id = p_tenant
     order by empreendimento_id, versao desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', emp.id, 'nome', emp.nome, 'situacao', emp.situacao, 'spe_id', emp.spe_id, 'spe', emp.spe,
           'lotes', coalesce(lotes.total, 0), 'vendidos', coalesce(lotes.vendidos, 0),
           'disponiveis', coalesce(lotes.disponiveis, 0), 'reservados', coalesce(lotes.reservados, 0),
           'permuta', coalesce(lotes.permuta, 0), 'estoque_centavos', coalesce(lotes.estoque_centavos, 0),
           'vgv_vendido', coalesce(vendas.vgv_vendido, 0),
           'recebido', coalesce(recebidos.recebido, 0), 'recebido_mes', coalesce(recebidos.recebido_mes, 0),
           'saldo_carteira', coalesce(parcelas.saldo, 0), 'vencido', coalesce(parcelas.vencido, 0),
           'inadimplentes', coalesce(parcelas.inadimplentes, 0),
           'custos_pagos', coalesce(pagos.pago, 0), 'a_pagar', coalesce(a_pagar.a_pagar, 0),
           'a_devolver', coalesce(devolucoes.a_devolver, 0),
           'plano', case when plano.empreendimento_id is null then null else jsonb_build_object(
             'versao', plano.versao, 'tir_anual', plano.resumo ->> 'tirAnual', 'vpl', plano.resumo ->> 'vpl',
             'lucro', plano.resumo ->> 'lucroNominal', 'exposicao', plano.resumo #>> '{exposicaoMaxima,valor}') end
         ) order by emp.spe, emp.nome), '[]'::jsonb)
    into v_resultado
    from emp
    left join lotes on lotes.empreendimento_id = emp.id
    left join vendas on vendas.empreendimento_id = emp.id
    left join parcelas on parcelas.empreendimento_id = emp.id
    left join recebidos on recebidos.empreendimento_id = emp.id
    left join pagos on pagos.empreendimento_id = emp.id
    left join a_pagar on a_pagar.empreendimento_id = emp.id
    left join devolucoes on devolucoes.empreendimento_id = emp.id
    left join plano on plano.empreendimento_id = emp.id;
  return v_resultado;
end;
$$;

-- Índices para as agregações por loteadora.
create index if not exists parcelas_tenant_abertas_idx on public.parcelas (tenant_id, contrato_id) where situacao = 'aberta';
create index if not exists recebimentos_tenant_ativos_idx on public.recebimentos (tenant_id, parcela_id) where estornado_em is null;

revoke execute on function public.painel_consolidado(uuid, date) from public, anon;
grant execute on function public.painel_consolidado(uuid, date) to authenticated;
