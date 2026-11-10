-- Distrato: itens de desconto por cliente e teto como parâmetro (decisão de 10/11/2026).
begin;
\ir ../auxiliares/testes.psql
select plan(6);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));
select testes.guardar('bia', testes.criar_usuario('bia@outra.com.br', 'Bia (outra loteadora)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);

select is((public.parametro_vigente('distrato.limite_penal', current_date, testes.id('tenant')) #>> array[]::text[]), '0.10',
  'teto padrão de 10% (art. 32-A, II), ajustável por cliente');
select lives_ok($$ insert into public.itens_desconto_distrato (tenant_id, nome, dentro_do_limite, valor_padrao_centavos)
  values (testes.id('tenant'), 'Documentação', true, 80000), (testes.id('tenant'), 'Taxa de associação em aberto', false, null) $$,
  'dona cadastra itens de desconto');
select throws_ok($$ delete from public.itens_desconto_distrato where tenant_id = testes.id('tenant') $$,
  '42501', null, 'item não é apagado (só desativado)');

select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.cc'));
select is_empty($$ select 1 from public.itens_desconto_distrato $$, 'corretor não vê os itens de desconto');
select throws_ok($$ insert into public.itens_desconto_distrato (tenant_id, nome) values (testes.id('tenant'), 'x y') $$,
  '42501', null, 'corretor não cadastra itens');

select testes.entrar(testes.id('bia'));
select is_empty($$ select 1 from public.itens_desconto_distrato $$, 'outra loteadora não vê os itens');

select * from finish();
rollback;
