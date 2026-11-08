-- Fase 6d: painel consolidado — números corretos e meta de desempenho
-- (10 empreendimentos, 3.000 lotes, 2.000 contratos, 240 mil parcelas).
begin;
\ir ../auxiliares/testes.psql
select plan(6);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora Grande'));
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
reset role;
update public.tenants set plano_id = 'empresarial' where id = testes.id('tenant');
select testes.entrar(testes.id('ana'));
select public.criar_empreendimento_com_lotes(testes.id('tenant'), (select id from public.spes where tenant_id = testes.id('tenant')),
  'Empreendimento ' || e, 'Goiânia', 'GO', '2026-01-01',
  (select jsonb_agg(jsonb_build_object('quadra', 'Q' || (n / 30), 'numero', n::text, 'area_m2', '300', 'preco_base_centavos', 10000000)) from generate_series(1, 300) n))
  from generate_series(1, 10) e;
reset role;

-- Carga direta (sem gatilhos de auditoria) para medir só a leitura.
set local session_replication_role = replica;
insert into public.compradores (tenant_id, nome) values (testes.id('tenant'), 'Comprador de carga');
create temp table carga as
  select l.id as lote_id, l.empreendimento_id, gen_random_uuid() as venda_id, gen_random_uuid() as contrato_id
    from public.lotes l
   where l.tenant_id = testes.id('tenant') and l.numero::int <= 200;
update public.lotes set status = 'vendido' where id in (select lote_id from carga);
insert into public.vendas (id, tenant_id, empreendimento_id, lote_id, comprador_id, data_venda, preco_centavos, entrada_centavos, parcelas, juros_mensal, sistema, primeira_parcela_em)
  select venda_id, testes.id('tenant'), empreendimento_id, lote_id, (select id from public.compradores where tenant_id = testes.id('tenant')),
         '2025-11-01', 10000000, 400000, 120, 0, 'sac', '2025-12-01' from carga;
insert into public.contratos (id, tenant_id, empreendimento_id, venda_id, lote_id, comprador_id, multa_atraso, juros_mora_mensal,
                             reajuste_periodicidade_meses, reajuste_defasagem_meses, reajuste_negativo)
  select contrato_id, testes.id('tenant'), empreendimento_id, venda_id, lote_id, (select id from public.compradores where tenant_id = testes.id('tenant')),
         0.02, 0.01, 12, 2, 'ignorar' from carga;
-- 120 parcelas de 80.000: as 10 primeiras pagas, a 11ª vencida, o resto a vencer
insert into public.parcelas (tenant_id, contrato_id, numero, vencimento, valor_centavos, amortizacao_centavos, juros_centavos, pago_centavos, situacao)
  select testes.id('tenant'), c.contrato_id, n, ('2025-12-01'::date + make_interval(months => n - 1))::date, 80000, 80000, 0,
         case when n <= 10 then 80000 else 0 end, case when n <= 10 then 'paga' else 'aberta' end
    from carga c cross join generate_series(1, 120) n;
insert into public.recebimentos (tenant_id, parcela_id, data_pagamento, valor_centavos, principal_centavos)
  select testes.id('tenant'), p.id, p.vencimento, 80000, 80000
    from public.parcelas p where p.tenant_id = testes.id('tenant') and p.situacao = 'paga';
set local session_replication_role = origin;
analyze public.lotes; analyze public.parcelas; analyze public.recebimentos; analyze public.contratos; analyze public.vendas;

select testes.entrar(testes.id('ana'));
select set_config('teste.inicio', clock_timestamp()::text, true);
select set_config('teste.painel', public.painel_consolidado(testes.id('tenant'), '2026-10-15')::text, true);
select set_config('teste.fim', clock_timestamp()::text, true);
select diag('Tempo do painel consolidado: ' || (current_setting('teste.fim')::timestamptz - current_setting('teste.inicio')::timestamptz));
select ok(current_setting('teste.fim')::timestamptz - current_setting('teste.inicio')::timestamptz < interval '2 seconds',
  'painel consolidado de 10 empreendimentos e 3.000 lotes em menos de 2 s');
select is(jsonb_array_length(current_setting('teste.painel')::jsonb), 10, 'uma linha por empreendimento');
select is((select sum((x ->> 'lotes')::int) || '/' || sum((x ->> 'vendidos')::int) from jsonb_array_elements(current_setting('teste.painel')::jsonb) x),
  '3000/2000', 'lotes e vendidos');
-- Por empreendimento: 200 contratos × 10 parcelas pagas × 800,00 = 1.600.000,00
select is((select (x ->> 'recebido')::bigint from jsonb_array_elements(current_setting('teste.painel')::jsonb) x limit 1), 160000000::bigint,
  'recebido por empreendimento');
-- Em 15/10/2026 a única parcela aberta já vencida é a 11ª (01/10/2026): 200 × 800,00
select is((select (x ->> 'vencido')::bigint || '/' || (x ->> 'inadimplentes') from jsonb_array_elements(current_setting('teste.painel')::jsonb) x limit 1),
  '16000000/200', 'vencido e contratos inadimplentes');

select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.cc'));
select throws_ok($$ select public.painel_consolidado(testes.id('tenant')) $$, '42501', null, 'corretor não vê o consolidado');

select * from finish();
rollback;
