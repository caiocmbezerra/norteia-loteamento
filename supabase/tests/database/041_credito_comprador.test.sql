-- Crédito por pagamento a maior: a loteadora registra, aplica em parcela ou devolve; o saldo
-- volta com o estorno da aplicação; o comprador vê o próprio crédito.
begin;
\ir ../auxiliares/testes.psql
select plan(17);

select testes.guardar('ana', testes.criar_usuario('ana@credito.com.br', 'Ana (dona)'));
select testes.guardar('joana', testes.criar_usuario('joana@credito.com.br', 'Joana (compradora)'));
select testes.guardar('ciro', testes.criar_usuario('ciro@credito.com.br', 'Ciro (contador)'));
select testes.guardar('intrusa', testes.criar_usuario('intrusa@credito.com.br', 'Intrusa'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora Crédito'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Jardim Crédito', 'Goiânia', 'GO', '2025-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2025-01-02' where id = testes.id('emp');
insert into public.compradores (tenant_id, nome, cpf) values (testes.id('tenant'), 'Joana Compradora', '52998224725');
select testes.guardar('venda', public.vender_lote((select id from public.lotes where empreendimento_id = testes.id('emp')),
  json_build_object('comprador_id', (select id from public.compradores where tenant_id = testes.id('tenant')), 'data_venda', current_date - 10,
    'preco_centavos', 100000, 'entrada_centavos', 10000, 'parcelas', 2, 'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', current_date + 20)::jsonb));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), json_build_array(
  json_build_object('numero', 0, 'vencimento', current_date - 10, 'valor_centavos', 10000, 'amortizacao_centavos', 10000, 'juros_centavos', 0),
  json_build_object('numero', 1, 'vencimento', current_date + 20, 'valor_centavos', 45000, 'amortizacao_centavos', 45000, 'juros_centavos', 0),
  json_build_object('numero', 2, 'vencimento', current_date + 50, 'valor_centavos', 45000, 'amortizacao_centavos', 45000, 'juros_centavos', 0))::jsonb));
select testes.guardar('p1', (select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 1));
select set_config('teste.convite', public.criar_convite_portal(testes.id('tenant'), 'comprador', (select id from public.compradores where tenant_id = testes.id('tenant')), 'joana@credito.com.br'), true);
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'ciro@credito.com.br', 'contador'), true);

-- Registro
select throws_ok($$ select public.registrar_credito(testes.id('contrato'), current_date - 5, 30000, '') $$, '23514', null, 'origem do crédito é obrigatória');
select throws_ok($$ select public.registrar_credito(testes.id('contrato'), current_date + 1, 30000, 'Pago em dobro') $$, '23514', null, 'data no futuro é recusada');
select testes.guardar('cr', public.registrar_credito(testes.id('contrato'), current_date - 5, 30000, 'Entrada paga em dobro'));
select is(privado.saldo_credito(testes.id('cr')), 30000::bigint, 'crédito nasce com o valor pago a mais');
select is((select count(*) from public.recebimentos r join public.parcelas p on p.id = r.parcela_id where p.contrato_id = testes.id('contrato')),
  0::bigint, 'crédito não usado não entra nos recebimentos');

-- Aplicação em parcela
select throws_ok($$ select public.aplicar_credito(testes.id('cr'), testes.id('p1'), 30001) $$, '23514', null, 'não aplica mais que o saldo');
select testes.guardar('rec', public.aplicar_credito(testes.id('cr'), testes.id('p1'), 20000));
select results_eq($$ select origem, data_pagamento, principal_centavos from public.recebimentos where id = testes.id('rec') $$,
  $$ values ('credito'::text, current_date - 5, 20000::bigint) $$, 'aplicação vira recebimento na data em que o dinheiro entrou');
select is((select pago_centavos from public.parcelas where id = testes.id('p1')), 20000::bigint, 'parcela abatida');
select is(privado.saldo_credito(testes.id('cr')), 10000::bigint, 'saldo diminui');
select throws_ok($$ select public.cancelar_credito(testes.id('cr'), 'engano') $$, '23514', null, 'crédito usado não se cancela');

-- Estorno da aplicação devolve o saldo
select public.estornar_recebimento(testes.id('rec'), 'Aplicado na parcela errada');
select is(privado.saldo_credito(testes.id('cr')), 30000::bigint, 'estorno da aplicação devolve o saldo');

-- Devolução
select throws_ok($$ select public.devolver_credito(testes.id('cr'), current_date - 6, 1000) $$, '23514', null, 'devolução não antes do crédito');
select lives_ok($$ select public.devolver_credito(testes.id('cr'), current_date, 30000, 'Pix ao comprador') $$, 'devolve o saldo');
select is(privado.saldo_credito(testes.id('cr')), 0::bigint, 'crédito zerado');

select is((public.dados_titular_do_contrato(testes.id('contrato')) #> '{contratos,0,creditos,0,usos}') -> 1 ->> 'tipo', 'devolucao',
  'exportação LGPD inclui o crédito e os usos');

-- Leitura
select testes.entrar(testes.id('joana'));
select public.aceitar_convite_portal(current_setting('teste.convite'));
select is((select count(*) from public.usos_credito), 2::bigint, 'compradora vê os usos do próprio crédito');
select testes.entrar(testes.id('ciro'));
select public.aceitar_convite(current_setting('teste.cc'));
select throws_ok($$ select public.registrar_credito(testes.id('contrato'), current_date, 100, 'Teste de contador') $$, '42501', null, 'contador não registra crédito');
select testes.entrar(testes.id('intrusa'));
select is_empty($$ select 1 from public.creditos_comprador $$, 'outra pessoa não vê créditos');

select * from finish();
rollback;
