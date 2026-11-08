-- Fase 5a: contrato, parcelas e recebimentos (RN-K01, RN-K04, RN-K05, RN-K06, RN-K09).
begin;
\ir ../auxiliares/testes.psql
select plan(22);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('fabi', testes.criar_usuario('fabi@loteadora.com.br', 'Fabi (financeiro)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));

select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
select testes.guardar('l1', (select id from public.lotes where empreendimento_id = testes.id('emp')));
select set_config('teste.cf', public.criar_convite(testes.id('tenant'), 'fabi@loteadora.com.br', 'financeiro'), true);
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
insert into public.compradores (tenant_id, nome) values (testes.id('tenant'), 'Joana Compradora');
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2026-10-01' where id = testes.id('emp');
-- R$ 1.000,00: entrada 100,00 + 2 parcelas de 450,00 sem juros
select testes.guardar('venda', public.vender_lote(testes.id('l1'), json_build_object(
  'comprador_id', (select id from public.compradores where tenant_id = testes.id('tenant')),
  'data_venda', '2026-02-01', 'preco_centavos', 100000, 'entrada_centavos', 10000, 'parcelas', 2,
  'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', '2026-03-01')::jsonb));

select throws_ok($$ select public.criar_contrato(testes.id('venda'), '[
  {"numero":0,"vencimento":"2026-02-01","valor_centavos":10000,"amortizacao_centavos":10000,"juros_centavos":0},
  {"numero":1,"vencimento":"2026-03-01","valor_centavos":45000,"amortizacao_centavos":45000,"juros_centavos":0},
  {"numero":2,"vencimento":"2026-04-01","valor_centavos":44999,"amortizacao_centavos":44999,"juros_centavos":0}]'::jsonb) $$,
  '23514', 'As parcelas não conferem com as condições da venda.', 'amortizações devem somar o preço (RN-K02)');
select throws_ok($$ select public.criar_contrato(testes.id('venda'), '[
  {"numero":1,"vencimento":"2026-03-01","valor_centavos":55000,"amortizacao_centavos":55000,"juros_centavos":0},
  {"numero":2,"vencimento":"2026-04-01","valor_centavos":45000,"amortizacao_centavos":45000,"juros_centavos":0}]'::jsonb) $$,
  '23514', null, 'a entrada precisa constar como parcela 0');

select set_config('teste.parcelas', '[
  {"numero":0,"vencimento":"2026-02-01","valor_centavos":10000,"amortizacao_centavos":10000,"juros_centavos":0},
  {"numero":1,"vencimento":"2026-03-01","valor_centavos":45000,"amortizacao_centavos":45000,"juros_centavos":0},
  {"numero":2,"vencimento":"2026-04-01","valor_centavos":45000,"amortizacao_centavos":45000,"juros_centavos":0}]', true);

-- Corretor não gera contrato nem enxerga a carteira
select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.cc'));
select throws_ok($$ select public.criar_contrato(testes.id('venda'), current_setting('teste.parcelas')::jsonb) $$,
  '42501', null, 'corretor não gera contrato');

select testes.entrar(testes.id('ana'));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), current_setting('teste.parcelas')::jsonb, 'IPCA'));
select is((select count(*) from public.parcelas where contrato_id = testes.id('contrato')), 3::bigint, 'contrato com entrada e duas parcelas');
select is((select multa_atraso::text || '/' || juros_mora_mensal::text from public.contratos where id = testes.id('contrato')),
  '0.020000/0.010000', 'encargos vêm dos parâmetros vigentes (RN-K04)');
select throws_ok($$ select public.criar_contrato(testes.id('venda'), current_setting('teste.parcelas')::jsonb) $$,
  '23505', null, 'uma venda tem um único contrato');
select throws_ok($$ update public.parcelas set pago_centavos = 1 where contrato_id = testes.id('contrato') $$,
  '42501', null, 'parcela não é alterada diretamente');

select testes.entrar(testes.id('caio'));
select is_empty($$ select 1 from public.contratos $$, 'corretor não vê contratos');
select is_empty($$ select 1 from public.parcelas $$, 'corretor não vê parcelas');

-- Financeiro recebe
select testes.entrar(testes.id('fabi'));
select public.aceitar_convite(current_setting('teste.cf'));
select testes.guardar('p0', (select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 0));
select testes.guardar('p1', (select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 1));
select testes.guardar('p2', (select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 2));

select testes.guardar('r0', public.registrar_recebimento(testes.id('p0'), '2026-02-01', 10000, p_referencia => 'aviso-1'));
select is((select situacao from public.parcelas where id = testes.id('p0')), 'paga', 'entrada paga integralmente');
select is(public.registrar_recebimento(testes.id('p0'), '2026-02-01', 10000, p_referencia => 'aviso-1'), testes.id('r0'),
  'o mesmo aviso devolve o mesmo recebimento (RN-K05)');
select is((select count(*) from public.recebimentos), 1::bigint, 'e não baixa duas vezes');

-- Pagamento parcial com encargos
select lives_ok($$ select public.registrar_recebimento(testes.id('p1'), '2026-03-16', 20000, 900, 225) $$, 'pagamento a menor com encargos');
select is((select pago_centavos || '/' || situacao from public.parcelas where id = testes.id('p1')), '20000/aberta',
  'baixa parcial mantém o saldo em aberto (RN-K06)');
select is((select valor_centavos from public.recebimentos where parcela_id = testes.id('p1')), 21125::bigint,
  'valor recebido = principal + multa + juros');
select throws_ok($$ select public.registrar_recebimento(testes.id('p1'), '2026-03-20', 25001) $$,
  '23514', null, 'principal acima do saldo é recusado');
select throws_ok($$ select public.registrar_recebimento(testes.id('p1'), current_date + 1, 100) $$,
  '23514', null, 'pagamento no futuro é recusado');

select public.registrar_recebimento(testes.id('p1'), '2026-03-20', 25000);
select testes.guardar('r2', public.registrar_recebimento(testes.id('p2'), '2026-04-01', 45000));
select is((select situacao || ' ' || quitado_em from public.contratos where id = testes.id('contrato')), 'quitado 2026-04-01',
  'sem parcelas em aberto, o contrato fica quitado (RN-K09)');

-- Estorno
select throws_ok($$ select public.estornar_recebimento(testes.id('r2'), '') $$, '23514', null, 'estorno exige motivo');
select lives_ok($$ select public.estornar_recebimento(testes.id('r2'), 'cheque devolvido') $$, 'estorno registrado');
select is((select situacao from public.contratos where id = testes.id('contrato')), 'vigente', 'estorno reabre o contrato');
select is((select pago_centavos || '/' || situacao from public.parcelas where id = testes.id('p2')), '0/aberta',
  'e devolve o saldo da parcela');

select * from finish();
rollback;
