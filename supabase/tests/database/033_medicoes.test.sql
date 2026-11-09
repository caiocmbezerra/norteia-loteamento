-- Fase 3: medições por percentual acumulado geram a conta a pagar com o valor da diferença.
begin;
\ir ../auxiliares/testes.psql
select plan(10);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300"}]'::jsonb));
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
insert into public.fornecedores (tenant_id, nome) values (testes.id('tenant'), 'Terraplenagem Silva');
insert into public.contratos_fornecedor (tenant_id, empreendimento_id, fornecedor_id, centro_codigo, descricao, valor_centavos, data_inicio, data_fim_prevista)
  values (testes.id('tenant'), testes.id('emp'), (select id from public.fornecedores where tenant_id = testes.id('tenant')),
          (select codigo from public.centros_custo where tenant_id = testes.id('tenant') order by codigo limit 1),
          'Terraplenagem', 33333333, '2026-11-01', '2027-06-30');
select testes.guardar('contrato', (select id from public.contratos_fornecedor where tenant_id = testes.id('tenant')));

select testes.guardar('m1', public.registrar_medicao(testes.id('contrato'), '2026-11-30', 0.333, '2026-12-10', 'NF 10'));
select results_eq($$ select m.numero, m.valor_centavos, cp.valor_centavos, cp.descricao, cp.documento_numero
                       from public.medicoes m join public.contas_pagar cp on cp.id = m.conta_id where m.id = testes.id('m1') $$,
  $$ values (1, 11100000::bigint, 11100000::bigint, 'Medição 1 — 33,30% executado'::text, 'NF 10'::text) $$,
  'medição gera a conta com o valor do percentual');
select throws_ok($$ select public.registrar_medicao(testes.id('contrato'), '2026-12-30', 0.2, '2027-01-10') $$,
  '23514', null, 'percentual acumulado não volta');
select throws_ok($$ select public.registrar_medicao(testes.id('contrato'), '2026-12-30', 1.1, '2027-01-10') $$,
  '23514', null, 'percentual acima de 100% é recusado');
select throws_ok($$ select public.registrar_medicao(testes.id('contrato'), '2026-10-30', 0.5, '2027-01-10') $$,
  '23514', null, 'medição antes do início do contrato é recusada');
select testes.guardar('m2', public.registrar_medicao(testes.id('contrato'), '2026-12-30', 0.666667, '2027-01-10'));
select testes.guardar('m3', public.registrar_medicao(testes.id('contrato'), '2027-01-30', 1, '2027-02-10'));
select is((select sum(valor_centavos) from public.medicoes where contrato_id = testes.id('contrato')), 33333333::numeric,
  'as medições somam exatamente o valor do contrato');
select is((select numero from public.medicoes where id = testes.id('m3')), 3, 'medições numeradas em sequência');
select throws_ok($$ select public.registrar_medicao(testes.id('contrato'), '2027-02-28', 1, '2027-03-10') $$,
  '23514', null, 'contrato 100% medido não aceita nova medição');

-- Conta cancelada libera o percentual daquela medição
update public.contas_pagar set cancelada_em = now(), motivo_cancelamento = 'Medição refeita'
 where id = (select conta_id from public.medicoes where id = testes.id('m3'));
select testes.guardar('m4', public.registrar_medicao(testes.id('contrato'), '2027-01-31', 1, '2027-02-15'));
select results_eq($$ select numero, valor_centavos from public.medicoes where id = testes.id('m4') $$,
  $$ values (4, (select valor_centavos from public.medicoes where id = testes.id('m3'))) $$, 'medição refeita depois de cancelar a conta');

select throws_ok($$ insert into public.medicoes (tenant_id, empreendimento_id, contrato_id, numero, data, percentual_acumulado, valor_centavos, conta_id)
  values (testes.id('tenant'), testes.id('emp'), testes.id('contrato'), 9, current_date, 0.1, 1, gen_random_uuid()) $$,
  '42501', null, 'medição só pela função');

select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.cc'));
select throws_ok($$ select public.registrar_medicao(testes.id('contrato'), '2027-01-31', 1, '2027-02-15') $$,
  '42501', null, 'corretor não registra medição');

select * from finish();
rollback;
