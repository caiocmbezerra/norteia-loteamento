-- RN-G03: toda alteração gera trilha com quem, quando, antes, depois e motivo; a trilha é imutável.
begin;
\ir ../auxiliares/testes.psql
select plan(10);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora-a.com.br', 'Ana'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora A'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
insert into public.empreendimentos (tenant_id, spe_id, nome, data_base)
  values (testes.id('tenant'), testes.id('spe'), 'Residencial A', '2026-01-01');
select testes.guardar('emp', (select id from public.empreendimentos where tenant_id = testes.id('tenant')));
insert into public.quadras (tenant_id, empreendimento_id, codigo) values (testes.id('tenant'), testes.id('emp'), 'A');
insert into public.lotes (tenant_id, empreendimento_id, quadra_id, numero, area_m2, preco_base_centavos)
  select testes.id('tenant'), testes.id('emp'), id, '1', 300, 9000000 from public.quadras where tenant_id = testes.id('tenant');
select testes.guardar('lote', (select id from public.lotes where tenant_id = testes.id('tenant')));

select set_config('app.motivo', 'Ajuste após levantamento topográfico', true);
update public.lotes set area_m2 = 312.5 where id = testes.id('lote');

select is(
  (select campos_alterados from public.auditoria where tabela = 'lotes' and operacao = 'UPDATE'),
  array['area_m2'], 'registra somente o campo alterado');
select is(
  (select (antes ->> 'area_m2')::numeric || ' → ' || (depois ->> 'area_m2')::numeric
     from public.auditoria where tabela = 'lotes' and operacao = 'UPDATE'),
  '300.00 → 312.50', 'registra o valor antes e depois');
select is(
  (select usuario_id from public.auditoria where tabela = 'lotes' and operacao = 'UPDATE'),
  testes.id('ana'), 'registra quem alterou');
select is(
  (select motivo from public.auditoria where tabela = 'lotes' and operacao = 'UPDATE'),
  'Ajuste após levantamento topográfico', 'registra o motivo informado na transação');
select is(
  (select tenant_id from public.auditoria where tabela = 'lotes' and operacao = 'INSERT'),
  testes.id('tenant'), 'registra o cliente dono do dado');

select is(
  testes.linhas_afetadas($$ update public.lotes set area_m2 = 312.5 where id = testes.id('lote') $$),
  1::bigint, 'atualização sem mudança real é aceita');
select is(
  (select count(*) from public.auditoria where tabela = 'lotes' and operacao = 'UPDATE'),
  1::bigint, '...mas não gera registro de auditoria vazio');

select throws_ok($$ delete from public.auditoria $$, '42501', null, 'usuário não apaga a auditoria');
select throws_ok($$ update public.auditoria set motivo = 'x' $$, '42501', null, 'usuário não altera a auditoria');

reset role;
select throws_ok($$ delete from public.auditoria $$, '42501', null,
  'nem o dono do banco apaga a auditoria');

select * from finish();
rollback;
