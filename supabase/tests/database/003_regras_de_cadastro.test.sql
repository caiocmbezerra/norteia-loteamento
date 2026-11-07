-- Regras de cadastro: status de lote (RN-C04), registro do loteamento (RN-C01),
-- CNPJ, mês 0 (RN-F04), cliente imutável e limite do plano (RN-G07).
begin;
\ir ../auxiliares/testes.psql
select plan(13);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora-a.com.br', 'Ana'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora A'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
insert into public.empreendimentos (tenant_id, spe_id, nome, data_base)
  values (testes.id('tenant'), testes.id('spe'), 'Residencial A', '2026-01-01');
select testes.guardar('emp', (select id from public.empreendimentos where tenant_id = testes.id('tenant')));
insert into public.quadras (tenant_id, empreendimento_id, codigo) values (testes.id('tenant'), testes.id('emp'), 'A');
select testes.guardar('quadra', (select id from public.quadras where tenant_id = testes.id('tenant')));
insert into public.lotes (tenant_id, empreendimento_id, quadra_id, numero, area_m2)
  values (testes.id('tenant'), testes.id('emp'), testes.id('quadra'), '1', 300);
select testes.guardar('lote', (select id from public.lotes where numero = '1'));

-- RN-G02
select is((select count(*) from public.empresas where tenant_id = testes.id('tenant')), 1::bigint,
  'novo cliente já nasce com uma empresa');

-- RN-C04
select throws_ok(
  $$ insert into public.lotes (tenant_id, empreendimento_id, quadra_id, numero, area_m2, status)
     values (testes.id('tenant'), testes.id('emp'), testes.id('quadra'), '2', 300, 'vendido') $$,
  '23514', null, 'lote não nasce vendido');
select throws_ok(
  $$ update public.lotes set status = 'reservado' where id = testes.id('lote') $$,
  '23514', null, 'cadastro não reserva lote (só o fluxo comercial)');
select lives_ok(
  $$ update public.lotes set status = 'bloqueado' where id = testes.id('lote') $$,
  'cadastro bloqueia lote');
select lives_ok(
  $$ select set_config('app.transicao_lote', 'on', true);
     update public.lotes set status = 'reservado' where id = testes.id('lote') $$,
  'fluxo comercial (com a transição autorizada) reserva o lote');
select set_config('app.transicao_lote', '', true);
select throws_ok(
  $$ update public.lotes set status = 'disponivel' where id = testes.id('lote') $$,
  '23514', null, 'reservado só volta a disponível pelo fluxo comercial');

-- RN-C01
select throws_ok(
  $$ update public.empreendimentos set situacao = 'em_vendas' where id = testes.id('emp') $$,
  '23514', null, 'empreendimento não entra em vendas sem data de registro');
select lives_ok(
  $$ update public.empreendimentos set situacao = 'em_vendas', data_registro = '2026-06-10' where id = testes.id('emp') $$,
  'com a data de registro, entra em vendas');

-- Documentos e datas
select throws_ok(
  $$ insert into public.empresas (tenant_id, razao_social, cnpj) values (testes.id('tenant'), 'Empresa X', '11222333000182') $$,
  '23514', null, 'CNPJ com dígito verificador errado é recusado');
select lives_ok(
  $$ insert into public.empresas (tenant_id, razao_social, cnpj) values (testes.id('tenant'), 'Empresa Y', '11222333000181') $$,
  'CNPJ válido é aceito');
select throws_ok(
  $$ insert into public.empreendimentos (tenant_id, spe_id, nome, data_base) values (testes.id('tenant'), testes.id('spe'), 'Mês quebrado', '2026-01-15') $$,
  '23514', null, 'o mês 0 sempre começa no dia 1');

-- Limite do plano
reset role;
insert into public.planos (id, nome, max_lotes) values ('teste_limite', 'Teste', 2);
update public.tenants set plano_id = 'teste_limite' where id = testes.id('tenant');
select testes.entrar(testes.id('ana'));
select lives_ok(
  $$ insert into public.lotes (tenant_id, empreendimento_id, quadra_id, numero, area_m2)
     values (testes.id('tenant'), testes.id('emp'), testes.id('quadra'), '2', 300) $$,
  'dentro do limite do plano');
select throws_ok(
  $$ insert into public.lotes (tenant_id, empreendimento_id, quadra_id, numero, area_m2)
     values (testes.id('tenant'), testes.id('emp'), testes.id('quadra'), '3', 300) $$,
  '23514', 'O plano contratado permite até 2 lotes sob gestão.', 'acima do limite do plano é recusado');

select * from finish();
rollback;
