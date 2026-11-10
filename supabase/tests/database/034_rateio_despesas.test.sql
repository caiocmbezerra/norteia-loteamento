-- Fase 3: rateio de despesa comum entre empreendimentos, sem perder nem sobrar centavos.
begin;
\ir ../auxiliares/testes.psql
select plan(10);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('edu', testes.criar_usuario('edu@loteadora.com.br', 'Edu (engenharia só do A)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('a', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'A Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":9000000}]'::jsonb));
select testes.guardar('b', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'B Jardim', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":9000000},
    {"quadra":"A","numero":"2","area_m2":"300","preco_base_centavos":9000000}]'::jsonb));
select testes.guardar('c', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'C Parque', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"600","preco_base_centavos":18000000},
    {"quadra":"A","numero":"2","area_m2":"300","preco_base_centavos":9000000},
    {"quadra":"A","numero":"3","area_m2":"300"}]'::jsonb));
select set_config('teste.centro', (select codigo from public.centros_custo where tenant_id = testes.id('tenant') order by codigo limit 1), true);
select set_config('teste.rateio', json_build_object('descricao', 'Contabilidade de novembro', 'centro_codigo', current_setting('teste.centro'),
  'valor_centavos', 100000, 'vencimento', '2026-12-10', 'criterio', 'lotes')::text, true);

-- Por lotes: 1, 2 e 3 lotes → 1/6, 2/6, 3/6 de R$ 1.000,00
select testes.guardar('r1', public.ratear_despesa(current_setting('teste.rateio')::jsonb, array[testes.id('a'), testes.id('b'), testes.id('c')]));
select results_eq($$ select e.nome, cp.valor_centavos from public.contas_pagar cp join public.empreendimentos e on e.id = cp.empreendimento_id
                      where cp.rateio_id = testes.id('r1') order by e.nome $$,
  $$ values ('A Residencial'::text, 16667::bigint), ('B Jardim', 33333::bigint), ('C Parque', 50000::bigint) $$,
  'rateio por lotes, com o centavo que sobra na maior fração');
select is((select sum(valor_centavos) from public.contas_pagar where rateio_id = testes.id('r1')), 100000::numeric, 'as partes somam a despesa');
select is((select descricao from public.contas_pagar where rateio_id = testes.id('r1') limit 1), 'Contabilidade de novembro (rateio)', 'conta identifica o rateio');

-- Por área e por VGV
select testes.guardar('r2', public.ratear_despesa(jsonb_set(current_setting('teste.rateio')::jsonb, '{criterio}', '"area"'), array[testes.id('a'), testes.id('c')]));
select results_eq($$ select cp.valor_centavos from public.contas_pagar cp join public.empreendimentos e on e.id = cp.empreendimento_id
                      where cp.rateio_id = testes.id('r2') order by e.nome $$,
  $$ values (20000::bigint), (80000::bigint) $$, 'rateio por área (300 × 1.200 m²)');
select testes.guardar('r3', public.ratear_despesa(jsonb_set(current_setting('teste.rateio')::jsonb, '{criterio}', '"vgv"'), array[testes.id('b'), testes.id('c')]));
select results_eq($$ select cp.valor_centavos from public.contas_pagar cp join public.empreendimentos e on e.id = cp.empreendimento_id
                      where cp.rateio_id = testes.id('r3') order by e.nome $$,
  $$ values (40000::bigint), (60000::bigint) $$, 'rateio por VGV de tabela (lote sem preço não pesa)');

-- Manual
select set_config('teste.pct', json_build_object(testes.id('a')::text, 0.25, testes.id('b')::text, 0.75)::text, true);
select testes.guardar('r4', public.ratear_despesa(jsonb_set(current_setting('teste.rateio')::jsonb, '{criterio}', '"manual"'),
  array[testes.id('a'), testes.id('b')], current_setting('teste.pct')::jsonb));
select is((select array_agg(valor_centavos order by valor_centavos) from public.contas_pagar where rateio_id = testes.id('r4')), array[25000, 75000]::bigint[], 'rateio por percentuais informados');
select throws_ok($$ select public.ratear_despesa(jsonb_set(current_setting('teste.rateio')::jsonb, '{criterio}', '"manual"'),
  array[testes.id('a'), testes.id('b')], jsonb_build_object(testes.id('a')::text, 0.5, testes.id('b')::text, 0.4)) $$,
  '23514', null, 'percentuais que não somam 100% são recusados');
select throws_ok($$ select public.ratear_despesa(current_setting('teste.rateio')::jsonb, array[testes.id('a')]) $$,
  '23514', null, 'rateio exige ao menos dois empreendimentos');

-- Quem não edita custos em todos os empreendimentos não rateia
select set_config('teste.ce', public.criar_convite(testes.id('tenant'), 'edu@loteadora.com.br', 'engenharia', 'empreendimento', testes.id('a')), true);
select testes.entrar(testes.id('edu'));
select public.aceitar_convite(current_setting('teste.ce'));
select throws_ok($$ select public.ratear_despesa(current_setting('teste.rateio')::jsonb, array[testes.id('a'), testes.id('b')]) $$,
  '42501', null, 'sem permissão em um dos empreendimentos, nada é lançado');
select is((select count(*) from public.rateios), 3::bigint, 'engenharia do A vê só os rateios que tocam o A');

select * from finish();
rollback;
