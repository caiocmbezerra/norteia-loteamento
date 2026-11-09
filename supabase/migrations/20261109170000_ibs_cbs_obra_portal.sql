-- Fase 7d · Reforma tributária (IBS/CBS, LC 214/2025) como parâmetros com vigência, e andamento
-- da obra (avanço financeiro da infraestrutura) no portal do comprador.

-- Alíquotas de teste de 2026 (CBS 0,9% e IBS 0,1%, compensáveis com PIS/Cofins); de 2027 em diante
-- dependem das alíquotas de referência ainda não fixadas: ficam sem valor até a definição.
-- Redução de 50% nas operações com imóveis e redutor social de R$ 30 mil por lote residencial.
-- // VALIDAR COM CONTADOR (PL-22): conferir artigos, vigências e aplicação a cada operação.
insert into public.parametros (chave, descricao, tipo, unidade, pendencia_legal) values
  ('tributario.cbs_aliquota', 'CBS: alíquota (reforma tributária)', 'decimal', 'fração', 'PL-22'),
  ('tributario.ibs_aliquota', 'IBS: alíquota (estadual + municipal)', 'decimal', 'fração', 'PL-22'),
  ('tributario.ibs_cbs_reducao_imoveis', 'IBS/CBS: redução de alíquota nas operações com imóveis', 'decimal', 'fração', 'PL-22'),
  ('tributario.ibs_cbs_redutor_social_lote', 'IBS/CBS: redutor social por lote residencial', 'centavos', null, 'PL-22'),
  ('tributario.ibs_cbs_no_fluxo', 'IBS/CBS: considerar no fluxo de caixa projetado', 'booleano', null, 'PL-22');
insert into public.parametro_valores (tenant_id, chave, escopo, escopo_id, valor, vigencia, motivo) values
  (null, 'tributario.cbs_aliquota', 'plataforma', null, '0.009', daterange('2026-01-01', '2027-01-01'), 'Ano de teste (LC 214/2025)'),
  (null, 'tributario.ibs_aliquota', 'plataforma', null, '0.001', daterange('2026-01-01', '2027-01-01'), 'Ano de teste (LC 214/2025)'),
  (null, 'tributario.ibs_cbs_reducao_imoveis', 'plataforma', null, '0.5', daterange('2026-01-01', null), 'Regime de bens imóveis (LC 214/2025)'),
  (null, 'tributario.ibs_cbs_redutor_social_lote', 'plataforma', null, '3000000', daterange('2026-01-01', null), 'Redutor social de lote residencial (LC 214/2025)'),
  (null, 'tributario.ibs_cbs_no_fluxo', 'plataforma', null, 'false', daterange('2026-01-01', null), 'Desligado até a validação do contador');

-- Andamento da obra para o comprador: orçado × pago por etapa da infraestrutura.
create function public.obra_portal(p_contrato uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.contratos;
begin
  select * into c from public.contratos where id = p_contrato;
  if c.id is null or not (
    privado.pode('carteira.ler', c.tenant_id, 'empreendimento', c.empreendimento_id)
    or privado.e_comprador(c.comprador_id)
  ) then
    raise exception 'Contrato não encontrado.' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('etapa', cc.nome, 'orcado', o.orcado, 'pago', coalesce(p.pago, 0)) order by cc.ordem, cc.nome)
      from public.centros_custo cc
      join (select centro_codigo,
                   sum(case when tipo = 'mensal' then valor_centavos * (mes_fim - mes_inicio + 1) else valor_centavos end) as orcado
              from public.orcamento_itens
             where empreendimento_id = c.empreendimento_id
             group by centro_codigo) o on o.centro_codigo = cc.codigo
      left join (select cp.centro_codigo, sum(pg.valor_centavos) as pago
                   from public.pagamentos pg join public.contas_pagar cp on cp.id = pg.conta_id
                  where cp.empreendimento_id = c.empreendimento_id and pg.estornado_em is null and cp.cancelada_em is null
                  group by cp.centro_codigo) p on p.centro_codigo = cc.codigo
     where cc.tenant_id = c.tenant_id and cc.codigo like 'infraestrutura%' and o.orcado > 0
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.obra_portal(uuid) from public, anon;
grant execute on function public.obra_portal(uuid) to authenticated;
