-- Fase 3: plano de contas, contratos, contas a pagar e pagamentos (RN-G04, RN-C07).
begin;
\ir ../auxiliares/testes.psql
select plan(14);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
insert into public.empreendimentos (tenant_id, spe_id, nome, data_base)
  values (testes.id('tenant'), testes.id('spe'), 'Residencial', '2026-01-01');
select testes.guardar('emp', (select id from public.empreendimentos where tenant_id = testes.id('tenant')));
select set_config('teste.c', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);

select is((select count(*) from public.centros_custo where tenant_id = testes.id('tenant')), 16::bigint,
  'novo cliente recebe o plano de contas padrão');

insert into public.fornecedores (tenant_id, nome, documento) values (testes.id('tenant'), 'Terraplenagem Silva', '11222333000181');
select testes.guardar('forn', (select id from public.fornecedores where tenant_id = testes.id('tenant')));
insert into public.contratos_fornecedor
  (tenant_id, empreendimento_id, fornecedor_id, centro_codigo, descricao, valor_centavos, data_inicio, data_fim_prevista)
values (testes.id('tenant'), testes.id('emp'), testes.id('forn'), 'infraestrutura.terraplenagem', 'Terraplenagem completa', 50000000, '2026-03-01', '2026-08-31');
select testes.guardar('contrato', (select id from public.contratos_fornecedor where tenant_id = testes.id('tenant')));

select throws_ok(
  $$ insert into public.contas_pagar (tenant_id, empreendimento_id, centro_codigo, contrato_id, descricao, valor_centavos, vencimento)
     values (testes.id('tenant'), testes.id('emp'), 'infraestrutura.drenagem', testes.id('contrato'), 'Medição 1', 10000000, '2026-04-10') $$,
  '23514', null, 'conta de contrato não pode usar outro centro de custo');

insert into public.contas_pagar (tenant_id, empreendimento_id, centro_codigo, contrato_id, descricao, valor_centavos, vencimento)
  values (testes.id('tenant'), testes.id('emp'), 'infraestrutura.terraplenagem', testes.id('contrato'), 'Medição 1', 10000000, '2026-04-10');
select testes.guardar('conta', (select id from public.contas_pagar where descricao = 'Medição 1'));
select is((select fornecedor_id from public.contas_pagar where id = testes.id('conta')), testes.id('forn'),
  'conta herda o fornecedor do contrato');

select lives_ok(
  $$ insert into public.pagamentos (tenant_id, conta_id, data_pagamento, valor_centavos) values (testes.id('tenant'), testes.id('conta'), '2026-04-10', 6000000) $$,
  'pagamento parcial');
select throws_ok(
  $$ insert into public.pagamentos (tenant_id, conta_id, data_pagamento, valor_centavos) values (testes.id('tenant'), testes.id('conta'), '2026-04-11', 5000000) $$,
  '23514', 'O pagamento ultrapassa o saldo da conta.', 'pagamento acima do saldo é recusado');
select throws_ok($$ update public.pagamentos set valor_centavos = 1 $$, '23514', null, 'pagamento registrado não muda');
select throws_ok($$ delete from public.pagamentos $$, '42501', null, 'pagamento não é apagado (RN-G04)');
select throws_ok($$ delete from public.contas_pagar $$, '42501', null, 'conta a pagar não é apagada (RN-G04)');
select throws_ok(
  $$ update public.contas_pagar set cancelada_em = now(), motivo_cancelamento = 'erro' where id = testes.id('conta') $$,
  '23514', 'Estorne os pagamentos antes de cancelar a conta.', 'conta com pagamento ativo não é cancelada');
select lives_ok(
  $$ update public.pagamentos set estornado_em = now(), motivo_estorno = 'Pago em duplicidade' where conta_id = testes.id('conta') $$,
  'estorno com motivo');
select lives_ok(
  $$ insert into public.pagamentos (tenant_id, conta_id, data_pagamento, valor_centavos) values (testes.id('tenant'), testes.id('conta'), '2026-04-12', 10000000) $$,
  'depois do estorno o saldo volta a ficar disponível');
select is(
  (select count(*) from public.auditoria where tabela = 'pagamentos' and operacao = 'UPDATE'), 1::bigint,
  'estorno fica na auditoria');

select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.c'));
select is_empty($$ select 1 from public.contas_pagar union all select 1 from public.pagamentos $$,
  'corretor não vê contas nem pagamentos');
select is_empty($$ select 1 from public.contratos_fornecedor $$, 'corretor não vê contratos');

select * from finish();
rollback;
