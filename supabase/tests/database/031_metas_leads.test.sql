-- Fase 4b: leads (corretor vê só os seus) e metas comerciais (gestão define).
begin;
\ir ../auxiliares/testes.psql
select plan(10);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));
select testes.guardar('dani', testes.criar_usuario('dani@corretora.com.br', 'Dani (corretora)'));

select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300"}]'::jsonb));
select set_config('teste.c1', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
select set_config('teste.c2', public.criar_convite(testes.id('tenant'), 'dani@corretora.com.br', 'corretor'), true);
insert into public.corretores (tenant_id, nome, usuario_id) values
  (testes.id('tenant'), 'Caio', testes.id('caio')), (testes.id('tenant'), 'Dani', testes.id('dani'));
select testes.guardar('cdani', (select id from public.corretores where usuario_id = testes.id('dani')));

-- Corretor cadastra lead: fica em seu nome mesmo que tente outro
select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.c1'));
insert into public.leads (tenant_id, empreendimento_id, nome, origem, corretor_id)
  values (testes.id('tenant'), testes.id('emp'), 'Marcos Interessado', 'placa', testes.id('cdani'));
select is((select corretor_id from public.leads where nome = 'Marcos Interessado'),
  (select id from public.corretores where usuario_id = testes.id('caio')), 'lead do corretor fica em nome dele');
select throws_ok($$ update public.leads set situacao = 'perdido' where nome = 'Marcos Interessado' $$,
  '23514', null, 'lead perdido exige motivo');
select lives_ok($$ update public.leads set situacao = 'em_contato', proximo_contato = current_date + 2 where nome = 'Marcos Interessado' $$,
  'corretor atualiza o próprio lead');
select throws_ok($$ insert into public.metas_comerciais (tenant_id, empreendimento_id, mes, vendas, vgv_centavos) values (testes.id('tenant'), testes.id('emp'), '2026-11-01', 5, 1) $$,
  '42501', null, 'corretor não define metas');

select testes.entrar(testes.id('dani'));
select public.aceitar_convite(current_setting('teste.c2'));
select is_empty($$ select 1 from public.leads $$, 'corretora não vê lead de outro corretor');
select is((select count(*) from public.leads where nome = 'x'), 0::bigint, 'nada vaza por filtro');

-- Gestão vê todos e define metas
select testes.entrar(testes.id('ana'));
select is((select count(*) from public.leads), 1::bigint, 'dona vê os leads');
select lives_ok($$ insert into public.metas_comerciais (tenant_id, empreendimento_id, corretor_id, mes, vendas, vgv_centavos) values
  (testes.id('tenant'), testes.id('emp'), null, '2026-11-01', 10, 90000000),
  (testes.id('tenant'), testes.id('emp'), testes.id('cdani'), '2026-11-01', 3, 27000000) $$, 'dona define metas do mês');
select throws_ok($$ insert into public.metas_comerciais (tenant_id, empreendimento_id, mes, vendas, vgv_centavos) values (testes.id('tenant'), testes.id('emp'), '2026-11-01', 1, 1) $$,
  '23505', null, 'uma meta por empreendimento, mês e corretor');

select testes.entrar(testes.id('dani'));
select is((select count(*) from public.metas_comerciais), 1::bigint, 'corretora vê só a própria meta');

select * from finish();
rollback;
