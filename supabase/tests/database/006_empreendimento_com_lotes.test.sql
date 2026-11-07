-- Criação de empreendimento com grade de lotes: tudo ou nada, respeitando RLS e plano.
begin;
\ir ../auxiliares/testes.psql
select plan(5);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana'));
select testes.guardar('bia', testes.criar_usuario('bia@outra.com.br', 'Bia'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));

select testes.guardar('emp', public.criar_empreendimento_com_lotes(
  testes.id('tenant'), testes.id('spe'), 'Residencial Bela Vista', 'Uberlândia', 'MG', '2026-11-01',
  '[{"quadra":"A","numero":"1","area_m2":"300.00","preco_base_centavos":9000000},
    {"quadra":"A","numero":"2","area_m2":"300.00","preco_base_centavos":9000000},
    {"quadra":"B","numero":"1","area_m2":"312.50","preco_base_centavos":null}]'::jsonb));

select is((select count(*) from public.quadras where empreendimento_id = testes.id('emp')), 2::bigint,
  'cria uma quadra por código distinto');
select is((select count(*) from public.lotes where empreendimento_id = testes.id('emp')), 3::bigint,
  'cria todos os lotes');

-- Tudo ou nada: lote repetido derruba a operação inteira.
select throws_ok(
  $$ select public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Duplicado', 'X', 'MG', '2026-11-01',
     '[{"quadra":"A","numero":"1","area_m2":"300"},{"quadra":"A","numero":"1","area_m2":"300"}]'::jsonb) $$,
  '23505', null, 'lote repetido é recusado');
select is((select count(*) from public.empreendimentos where nome = 'Duplicado'), 0::bigint,
  '...e nada fica gravado pela metade');

select testes.entrar(testes.id('bia'));
select throws_ok(
  $$ select public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Intruso', 'X', 'MG', '2026-11-01',
     '[{"quadra":"A","numero":"1","area_m2":"300"}]'::jsonb) $$,
  '42501', null, 'outro cliente não cria empreendimento');

select * from finish();
rollback;
