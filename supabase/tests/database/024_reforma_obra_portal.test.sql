-- Fase 7d: parâmetros IBS/CBS com vigência e andamento da obra no portal.
begin;
\ir ../auxiliares/testes.psql
select plan(6);

select is(public.parametro_vigente('tributario.cbs_aliquota', '2026-06-01', null) #>> '{}', '0.009', 'CBS de 2026 (teste)');
select is(public.parametro_vigente('tributario.cbs_aliquota', '2027-06-01', null), null, 'CBS de 2027 ainda sem valor');
select is(public.parametro_vigente('tributario.ibs_cbs_redutor_social_lote', '2030-01-01', null) #>> '{}', '3000000', 'redutor social vigente');

select testes.guardar('ana', testes.criar_usuario('ana@obra.com.br', 'Ana (dona)'));
select testes.guardar('joana', testes.criar_usuario('joana@obra.com.br', 'Joana (compradora)'));
select testes.guardar('intrusa', testes.criar_usuario('intrusa@obra.com.br', 'Intrusa'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora Obra'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Jardim Obra', 'Goiânia', 'GO', '2025-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2025-01-02' where id = testes.id('emp');
insert into public.orcamento_itens (tenant_id, empreendimento_id, centro_codigo, descricao, tipo, valor_centavos, mes_inicio, mes_fim) values
  (testes.id('tenant'), testes.id('emp'), 'infraestrutura.drenagem', 'Drenagem', 'total', 200000, 0, 3),
  (testes.id('tenant'), testes.id('emp'), 'infraestrutura.agua', 'Água', 'mensal', 10000, 0, 9),
  (testes.id('tenant'), testes.id('emp'), 'comercial.marketing', 'Stand', 'total', 50000, 0, 3);
insert into public.contas_pagar (tenant_id, empreendimento_id, centro_codigo, descricao, valor_centavos, vencimento)
  values (testes.id('tenant'), testes.id('emp'), 'infraestrutura.drenagem', 'Medição 1', 50000, current_date - 1);
insert into public.pagamentos (tenant_id, conta_id, data_pagamento, valor_centavos)
  values (testes.id('tenant'), (select id from public.contas_pagar where descricao = 'Medição 1' and tenant_id = testes.id('tenant')), current_date - 1, 50000);
insert into public.compradores (tenant_id, nome, cpf) values (testes.id('tenant'), 'Joana Compradora', '52998224725');
select testes.guardar('venda', public.vender_lote((select id from public.lotes where empreendimento_id = testes.id('emp')),
  json_build_object('comprador_id', (select id from public.compradores where tenant_id = testes.id('tenant')), 'data_venda', current_date - 1,
    'preco_centavos', 100000, 'entrada_centavos', 100000, 'parcelas', 0, 'juros_mensal', 0, 'sistema', 'sac')::jsonb));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), json_build_array(
  json_build_object('numero', 0, 'vencimento', current_date - 1, 'valor_centavos', 100000, 'amortizacao_centavos', 100000, 'juros_centavos', 0))::jsonb));
select set_config('teste.convite', public.criar_convite_portal(testes.id('tenant'), 'comprador', (select id from public.compradores where tenant_id = testes.id('tenant')), 'joana@obra.com.br'), true);

select testes.entrar(testes.id('joana'));
select public.aceitar_convite_portal(current_setting('teste.convite'));
select is((select string_agg((e ->> 'etapa') || '=' || (e ->> 'pago') || '/' || (e ->> 'orcado'), ', ' order by e ->> 'etapa')
             from jsonb_array_elements(public.obra_portal(testes.id('contrato'))) e),
  'Drenagem=50000/200000, Rede de água=0/100000', 'compradora vê só a infraestrutura: pago sobre orçado (mensal vezes os meses)');
select is_empty($$ select 1 from public.orcamento_itens $$, 'e não lê o orçamento interno');

select testes.entrar(testes.id('intrusa'));
select throws_ok($$ select public.obra_portal(testes.id('contrato')) $$, '42501', null, 'outra pessoa não vê a obra');

select * from finish();
rollback;
