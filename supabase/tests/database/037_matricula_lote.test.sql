-- L3: matrícula do lote guardada no cadastro, com a mesma permissão de editar o lote.
begin;
\ir ../auxiliares/testes.psql
select plan(4);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300"}]'::jsonb));
select testes.guardar('l1', (select id from public.lotes where empreendimento_id = testes.id('emp')));
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);

select lives_ok($$ update public.lotes set matricula = '123.456', matricula_aberta_em = '2026-11-01' where id = testes.id('l1') $$,
  'dona guarda a matrícula do lote');
select throws_ok($$ update public.lotes set matricula = null where id = testes.id('l1') $$,
  '23514', null, 'data de abertura sem número de matrícula é recusada');
select is((select count(*) from public.auditoria where tabela = 'lotes' and registro_id = testes.id('l1')::text and 'matricula' = any (campos_alterados)), 1::bigint,
  'a matrícula fica na trilha de auditoria');

select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.cc'));
select is(testes.linhas_afetadas($$ update public.lotes set matricula = '999' where id = testes.id('l1') $$), 0::bigint,
  'corretor não altera a matrícula');

select * from finish();
rollback;
