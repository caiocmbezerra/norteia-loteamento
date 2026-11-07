-- RN-G06: parâmetros com vigência e escopo; alterar cria nova vigência, nunca sobrescreve.
begin;
\ir ../auxiliares/testes.psql
select plan(12);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
insert into public.empreendimentos (tenant_id, spe_id, nome, data_base)
  values (testes.id('tenant'), testes.id('spe'), 'Residencial', '2026-01-01');
select testes.guardar('emp', (select id from public.empreendimentos where tenant_id = testes.id('tenant')));

select public.definir_parametro(testes.id('tenant'), 'financeiro.tma_mensal', '0.012', '2026-01-01', 'TMA inicial');
select public.definir_parametro(testes.id('tenant'), 'financeiro.tma_mensal', '0.010', '2026-07-01', 'Queda da Selic');

select is(public.parametro_vigente('financeiro.tma_mensal', '2026-03-15', testes.id('tenant')), '0.012'::jsonb,
  'valor antigo continua valendo no seu período');
select is(public.parametro_vigente('financeiro.tma_mensal', '2026-07-01', testes.id('tenant')), '0.010'::jsonb,
  'valor novo vale a partir do início');
select is(
  (select upper(vigencia) from public.parametro_valores where valor = '0.012'::jsonb and tenant_id = testes.id('tenant')),
  '2026-07-01'::date, 'a vigência anterior é encerrada, não apagada');
select is(public.parametro_vigente('financeiro.tma_mensal', '2025-12-31', testes.id('tenant')), null,
  'antes da primeira vigência não há valor');

-- Escopo mais específico prevalece
select public.definir_parametro(testes.id('tenant'), 'financeiro.tma_mensal', '0.015', '2026-01-01',
  'Projeto de maior risco', 'empreendimento', testes.id('emp'));
select is(public.parametro_vigente('financeiro.tma_mensal', '2026-08-01', testes.id('tenant'), 'empreendimento', testes.id('emp')),
  '0.015'::jsonb, 'empreendimento prevalece sobre o tenant');
select is(public.parametro_vigente('financeiro.tma_mensal', '2026-08-01', testes.id('tenant'), 'spe', testes.id('spe')),
  '0.010'::jsonb, 'a SPE herda do tenant');
select is(public.parametro_vigente('comercial.prazo_reserva_horas', '2026-08-01', testes.id('tenant')),
  '48'::jsonb, 'sem valor do cliente, vale o padrão da plataforma');

-- Validações
select throws_ok(
  $$ select public.definir_parametro(testes.id('tenant'), 'financeiro.tma_mensal', '"alta"', '2026-09-01', 'x') $$,
  '23514', null, 'valor incompatível com o tipo é recusado');
select throws_ok(
  $$ select public.definir_parametro(testes.id('tenant'), 'tributario.regime', '"lucro_inventado"', '2026-01-01', 'x', 'spe', testes.id('spe')) $$,
  '23514', null, 'valor fora da lista permitida é recusado');
select throws_ok(
  $$ select public.definir_parametro(testes.id('tenant'), 'financeiro.tma_mensal', '0.011', '2026-09-01', '  ') $$,
  '23514', null, 'alteração sem motivo é recusada');
select throws_ok(
  $$ insert into public.parametro_valores (tenant_id, chave, escopo, valor, vigencia)
     values (testes.id('tenant'), 'financeiro.tma_mensal', 'tenant', '0.5', daterange('2027-01-01', null)) $$,
  '42501', null, 'parâmetros não são gravados diretamente, só pela função');
select is(
  (select motivo from public.auditoria where tabela = 'parametro_valores' and operacao = 'INSERT'
     and depois ->> 'valor' = '0.010'),
  'Queda da Selic', 'a alteração de parâmetro fica na auditoria com o motivo');

select * from finish();
rollback;
