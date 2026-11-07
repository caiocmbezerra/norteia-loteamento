-- RN-F16: plano original imutável; revisões só pelo dono, com motivo. RN-C07: corretor não vê números.
begin;
\ir ../auxiliares/testes.psql
select plan(14);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('fabi', testes.criar_usuario('fabi@loteadora.com.br', 'Fabi (financeiro)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));

select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
insert into public.empreendimentos (tenant_id, spe_id, nome, data_base)
  values (testes.id('tenant'), testes.id('spe'), 'Residencial', '2026-01-01');
select testes.guardar('emp', (select id from public.empreendimentos where tenant_id = testes.id('tenant')));
select set_config('teste.c_fabi', public.criar_convite(testes.id('tenant'), 'fabi@loteadora.com.br', 'financeiro'), true);
select set_config('teste.c_caio', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
select testes.entrar(testes.id('fabi'));
select public.aceitar_convite(current_setting('teste.c_fabi'));
select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.c_caio'));

-- Financeiro cria e edita o estudo
select testes.entrar(testes.id('fabi'));
insert into public.viabilidades (tenant_id, empreendimento_id, nome, premissas, tma_mensal)
  values (testes.id('tenant'), testes.id('emp'), 'Estudo base', '{"lotesVendaveis": 102}', 0.012);
select testes.guardar('v1', (select id from public.viabilidades where nome = 'Estudo base'));
select is(testes.linhas_afetadas($$ update public.viabilidades set nome = 'Estudo base 2' where id = testes.id('v1') $$),
  1::bigint, 'financeiro edita estudo em rascunho');
select throws_ok($$ select public.aprovar_viabilidade(testes.id('v1'), '{"tir": "0.0148"}') $$,
  '42501', null, 'financeiro não aprova o plano');

-- Dona aprova o plano original
select testes.entrar(testes.id('ana'));
select is(public.aprovar_viabilidade(testes.id('v1'), '{"tir": "0.0148"}'), 1, 'dona aprova: versão 1 (plano original)');
select is((select situacao::text from public.viabilidades where id = testes.id('v1')), 'aprovada', 'estudo fica aprovado');
select is(testes.linhas_afetadas($$ update public.viabilidades set nome = 'x' where id = testes.id('v1') $$),
  0::bigint, 'estudo aprovado não é alterado');

-- Plano imutável
select throws_ok($$ update public.plano_versoes set resumo = '{}' $$, '42501', null, 'usuário não altera o plano');
reset role;
select throws_ok($$ delete from public.plano_versoes $$, '42501', null, 'nem o dono do banco apaga o plano');
select testes.entrar(testes.id('ana'));

-- Revisão
insert into public.viabilidades (tenant_id, empreendimento_id, nome, premissas, tma_mensal)
  values (testes.id('tenant'), testes.id('emp'), 'Revisão obra', '{"lotesVendaveis": 102}', 0.012);
select testes.guardar('v2', (select id from public.viabilidades where nome = 'Revisão obra'));
select throws_ok($$ select public.aprovar_viabilidade(testes.id('v2'), '{}') $$,
  '23514', null, 'revisão sem motivo é recusada');
select is(public.aprovar_viabilidade(testes.id('v2'), '{"tir": "0.0130"}', 'Infraestrutura 15% mais cara'), 2,
  'revisão com motivo vira versão 2');
select is((select situacao::text from public.viabilidades where id = testes.id('v1')), 'arquivada',
  'estudo anterior é arquivado');
select is((select count(*) from public.plano_versoes where empreendimento_id = testes.id('emp')), 2::bigint,
  'o plano original continua guardado');
select is((select motivo from public.auditoria where tabela = 'plano_versoes' order by id desc limit 1),
  'Infraestrutura 15% mais cara', 'auditoria registra o motivo da revisão');

-- Corretor não vê números (RN-C07)
select testes.entrar(testes.id('caio'));
select is_empty($$ select 1 from public.viabilidades $$, 'corretor não vê estudos de viabilidade');
select is_empty($$ select 1 from public.plano_versoes $$, 'corretor não vê o plano');

select * from finish();
rollback;
