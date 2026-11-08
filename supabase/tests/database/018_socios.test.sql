-- Fase 6c: sócios, participações com vigência e movimentos (RN-S01 a RN-S03).
begin;
\ir ../auxiliares/testes.psql
select plan(10);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('fabi', testes.criar_usuario('fabi@loteadora.com.br', 'Fabi (financeiro)'));
select testes.guardar('beto', testes.criar_usuario('beto@socio.com.br', 'Beto (sócio)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select set_config('teste.cf', public.criar_convite(testes.id('tenant'), 'fabi@loteadora.com.br', 'financeiro'), true);
insert into public.socios (tenant_id, nome, usuario_id) values (testes.id('tenant'), 'Ana Sócia', null), (testes.id('tenant'), 'Beto Sócio', testes.id('beto'));
select testes.guardar('s_ana', (select id from public.socios where nome = 'Ana Sócia'));
select testes.guardar('s_beto', (select id from public.socios where nome = 'Beto Sócio'));

select lives_ok($$ select public.definir_participacao(testes.id('spe'), testes.id('s_ana'), 0.6, '2026-01-01', 'Constituição') $$, 'participação da Ana');
select lives_ok($$ select public.definir_participacao(testes.id('spe'), testes.id('s_beto'), 0.4, '2026-01-01', 'Constituição') $$, 'participação do Beto');
select throws_ok($$ select public.definir_participacao(testes.id('spe'), testes.id('s_beto'), 0.5, '2026-07-01', 'Aumento') $$,
  '23514', 'As participações da SPE passariam de 100%.', 'soma das participações não passa de 100%');
select lives_ok($$ select public.definir_participacao(testes.id('spe'), testes.id('s_ana'), 0.5, '2026-07-01', 'Venda de cotas') $$, 'Ana reduz para 50% em julho');
select lives_ok($$ select public.definir_participacao(testes.id('spe'), testes.id('s_beto'), 0.5, '2026-07-01', 'Compra de cotas') $$, 'Beto sobe para 50% em julho');
select is((select string_agg(percentual::text || '@' || lower(vigencia) || '-' || coalesce(upper(vigencia)::text, '∞'), ' ' order by percentual, lower(vigencia))
  from public.participacoes where socio_id = testes.id('s_ana')), '0.500000@2026-07-01-∞ 0.600000@2026-01-01-2026-07-01',
  'vigência anterior encerrada na véspera, sem sobreposição');

select testes.guardar('mov', public.registrar_movimento_socio(testes.id('spe'), testes.id('s_ana'), 'aporte', '2026-02-01', 100000000));
select public.registrar_movimento_socio(testes.id('spe'), testes.id('s_beto'), 'aporte', '2026-02-01', 50000000);
select testes.entrar(testes.id('fabi'));
select public.aceitar_convite(current_setting('teste.cf'));
select throws_ok($$ select public.registrar_movimento_socio(testes.id('spe'), testes.id('s_ana'), 'aporte', current_date, 1) $$,
  '42501', null, 'financeiro não registra movimentos de sócio');
select is((select count(*) from public.movimentos_socio), 2::bigint, 'financeiro vê os movimentos');

-- Sócio com acesso vê só os próprios (RN-S03)
select testes.entrar(testes.id('beto'));
select is((select count(*) || ' ' || sum(valor_centavos) from public.movimentos_socio), '1 50000000', 'sócio vê só os próprios movimentos');
select throws_ok($$ update public.movimentos_socio set valor_centavos = 1 $$, '42501', null, 'movimento não é alterado diretamente');

select * from finish();
rollback;
