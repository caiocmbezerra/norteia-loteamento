-- Fase 6b: permutas física e financeira (RN-T01 a RN-T05).
begin;
\ir ../auxiliares/testes.psql
select plan(11);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));
select testes.guardar('pedro', testes.criar_usuario('pedro@terreno.com.br', 'Pedro (permutante)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300"},{"quadra":"A","numero":"2","area_m2":"300"},{"quadra":"A","numero":"3","area_m2":"300"}]'::jsonb));
select testes.guardar('l1', (select id from public.lotes where numero = '1' and empreendimento_id = testes.id('emp')));
select testes.guardar('l2', (select id from public.lotes where numero = '2' and empreendimento_id = testes.id('emp')));
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
insert into public.permutantes (tenant_id, nome, documento, usuario_id) values (testes.id('tenant'), 'Pedro Dono do Terreno', '52998224725', testes.id('pedro'));
select testes.guardar('perm', (select id from public.permutantes where tenant_id = testes.id('tenant')));

select throws_ok($$ select public.criar_permuta(testes.id('emp'), testes.id('perm'), '{"tipo":"fisica"}', '{}') $$,
  '23514', 'Escolha os lotes entregues ao permutante.', 'permuta física exige lotes');
select testes.guardar('fisica', public.criar_permuta(testes.id('emp'), testes.id('perm'),
  '{"tipo":"fisica","valor_economico_centavos":18000000}', array[testes.id('l1'), testes.id('l2')]));
select is((select string_agg(status::text, ',' order by numero) from public.lotes where empreendimento_id = testes.id('emp')),
  'permuta,permuta,disponivel', 'lotes da permuta física saem do estoque (RN-T01)');
select throws_ok($$ select public.reservar_lote(testes.id('l1'), 'Interessado') $$, '23514', null, 'lote de permuta não é reservado');
select throws_ok($$ select public.criar_permuta(testes.id('emp'), testes.id('perm'), '{"tipo":"fisica"}', array[testes.id('l1')]) $$,
  '23514', 'Só lotes disponíveis deste empreendimento entram na permuta.', 'lote não entra em duas permutas');

select throws_ok($$ select public.criar_permuta(testes.id('emp'), testes.id('perm'), '{"tipo":"financeira","percentual":0.1}') $$,
  '23514', null, 'financeira exige percentual, base e regra de distrato');
select testes.guardar('fin', public.criar_permuta(testes.id('emp'), testes.id('perm'),
  '{"tipo":"financeira","inicio":"2026-01-01","percentual":0.1,"base":"recebido","abate_distrato":true}'));
select throws_ok($$ select public.registrar_repasse(testes.id('fisica'), current_date, 100) $$, '23514', null, 'física não tem repasse');
select testes.guardar('rep', public.registrar_repasse(testes.id('fin'), current_date, 5000, 'Repasse de março'));
select lives_ok($$ select public.estornar_repasse(testes.id('rep'), 'valor errado') $$, 'repasse estornado com motivo');
select throws_ok($$ update public.permutas set percentual = 0.5 $$, '42501', null, 'permuta não é alterada diretamente');

-- Corretor não vê; permutante vê só o que é dele (RN-T05)
select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.cc'));
select is_empty($$ select 1 from public.permutas $$, 'corretor não vê permutas');
select testes.entrar(testes.id('pedro'));
select is((select count(*) from public.permutas), 2::bigint, 'permutante vê as próprias permutas');
select is((select count(*) from public.repasses_permuta), 1::bigint, 'e os repasses delas');

select * from finish();
rollback;
