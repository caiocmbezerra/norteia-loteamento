-- Desempenho da carteira (A-11…A-13): a nova política de recebimentos e cobranças
-- (privado.pode_ler_parcela) mantém exatamente a regra anterior — carteira.ler no
-- empreendimento do contrato — e os índices de recebimentos existem.
begin;
\ir ../auxiliares/testes.psql
\ir ../auxiliares/qa_cenario.psql
select plan(9);

select testes.guardar('dona_a', testes.criar_usuario('dona.a@exemplo.test', 'Dona A'));
select testes.guardar('dona_b', testes.criar_usuario('dona.b@exemplo.test', 'Dona B'));
select testes.guardar('fin_outro', testes.criar_usuario('fin.outro@exemplo.test', 'Financeiro de outro empreendimento'));
select testes.guardar('fin_emp', testes.criar_usuario('fin.emp@exemplo.test', 'Financeiro do empreendimento'));
select testes.guardar('corretor', testes.criar_usuario('corretor@exemplo.test', 'Corretor'));
select testes.entrar(testes.id('dona_a'));
select testes.qa_cenario('a');
select testes.guardar('emp2', public.criar_empreendimento_com_lotes(testes.id('a_tenant'), testes.id('a_spe'), 'Segundo QA', 'Goiânia', 'GO',
  '2026-01-01', '[{"quadra":"B","numero":"1","area_m2":"300","preco_base_centavos":100}]'));
select set_config('teste.c1', public.criar_convite(testes.id('a_tenant'), 'fin.outro@exemplo.test', 'financeiro', 'empreendimento', testes.id('emp2')), true);
select set_config('teste.c2', public.criar_convite(testes.id('a_tenant'), 'fin.emp@exemplo.test', 'financeiro', 'empreendimento', testes.id('a_emp')), true);
select set_config('teste.c3', public.criar_convite(testes.id('a_tenant'), 'corretor@exemplo.test', 'corretor'), true);
select testes.entrar(testes.id('dona_b'));
select testes.qa_cenario('b');

select testes.entrar(testes.id('dona_a'));
select is((select count(*) from public.recebimentos), 2::bigint, 'dona lê os recebimentos da loteadora');

select testes.entrar(testes.id('fin_emp'));
select public.aceitar_convite(current_setting('teste.c2'));
select is((select count(*) from public.recebimentos), 2::bigint, 'financeiro do empreendimento lê os recebimentos dele');

select testes.entrar(testes.id('fin_outro'));
select public.aceitar_convite(current_setting('teste.c1'));
select is_empty($$ select 1 from public.recebimentos $$, 'financeiro de outro empreendimento não lê estes recebimentos');
select is_empty($$ select 1 from public.cobrancas $$, 'nem as cobranças');

select testes.entrar(testes.id('corretor'));
select public.aceitar_convite(current_setting('teste.c3'));
select is_empty($$ select 1 from public.recebimentos $$, 'corretor não lê recebimentos (RN-C07)');

select testes.entrar(testes.id('dona_b'));
select is((select count(*) from public.recebimentos where tenant_id = testes.id('a_tenant')), 0::bigint,
  'outra loteadora não lê recebimentos de A');
select is((select count(*) from public.recebimentos), 2::bigint, 'e lê só os próprios');

reset role;
select has_index('public', 'recebimentos', 'recebimentos_parcela_ativos_idx', 'índice de recebimentos por parcela');
select has_index('public', 'recebimentos', 'recebimentos_data_idx', 'índice de recebimentos por data');

select * from finish();
rollback;
