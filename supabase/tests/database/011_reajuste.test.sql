-- Fase 5b: reajuste por índice (RN-K03) e importação de índices.
begin;
\ir ../auxiliares/testes.psql
select plan(17);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));
insert into public.indices_economicos (codigo, nome, fonte) values ('TESTE', 'Índice de teste', 'pgTAP');

select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
insert into public.compradores (tenant_id, nome) values (testes.id('tenant'), 'Joana Compradora');
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2026-01-02' where id = testes.id('emp');
-- R$ 1.000,00: entrada 100,00 + 24 × 37,50 sem juros, de 15/02/2026 a 15/01/2028
select testes.guardar('venda', public.vender_lote(
  (select id from public.lotes where empreendimento_id = testes.id('emp')),
  json_build_object('comprador_id', (select id from public.compradores where tenant_id = testes.id('tenant')),
    'data_venda', '2026-01-15', 'preco_centavos', 100000, 'entrada_centavos', 10000, 'parcelas', 24,
    'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', '2026-02-15')::jsonb));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'),
  (select jsonb_agg(jsonb_build_object('numero', n, 'vencimento', ('2026-01-15'::date + make_interval(months => n))::date,
     'valor_centavos', case when n = 0 then 10000 else 3750 end,
     'amortizacao_centavos', case when n = 0 then 10000 else 3750 end, 'juros_centavos', 0))
     from generate_series(0, 24) n),
  'TESTE'));
select is((select reajuste_periodicidade_meses || '/' || reajuste_defasagem_meses || '/' || reajuste_negativo from public.contratos where id = testes.id('contrato')),
  '12/2/ignorar', 'regras de reajuste vêm dos parâmetros vigentes na venda');
-- Pagamento parcial antecipado da parcela 12 (vence no aniversário)
select public.registrar_recebimento((select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 12), current_date, 1000);

select throws_ok($$ select public.executar_reajustes('2027-02-01') $$, '42501', null, 'usuário não executa a rotina de reajuste');
select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.cc'));
select throws_ok($$ select public.reajustar_contrato(testes.id('contrato')) $$, '42501', null, 'corretor não reajusta contrato');

reset role;
select is(public.executar_reajustes('2027-01-14'), 0, 'antes do aniversário não há reajuste');
-- 11 dos 12 meses publicados (dez/2025 a out/2026)
insert into public.indice_valores (codigo, competencia, variacao_mensal)
  select 'TESTE', ('2025-12-01'::date + make_interval(months => m))::date, 0.5 from generate_series(0, 10) m;
select is(public.executar_reajustes('2027-02-01'), 0, 'sem todos os índices publicados, o reajuste fica pendente');
insert into public.indice_valores (codigo, competencia, variacao_mensal) values ('TESTE', '2026-11-01', 0.5);
select is(public.executar_reajustes('2027-02-01'), 1, 'com os 12 meses publicados, reajusta');
select is((select fator::text || ' ' || parcelas || ' ' || competencia_inicial || ' ' || competencia_final from public.reajustes where contrato_id = testes.id('contrato')),
  '1.061677811864 13 2025-12-01 2026-11-01', 'fator acumulado de dez/2025 a nov/2026 sobre as 13 parcelas a partir do aniversário');
select is((select valor_centavos || '/' || correcao_centavos from public.parcelas where contrato_id = testes.id('contrato') and numero = 13),
  '3981/231', 'parcela futura corrigida pelo fator');
select is((select valor_centavos || '/' || pago_centavos from public.parcelas where contrato_id = testes.id('contrato') and numero = 12),
  '3920/1000', 'parcela com pagamento parcial: só o saldo é corrigido');
select is((select valor_centavos from public.parcelas where contrato_id = testes.id('contrato') and numero = 11),
  3750::bigint, 'parcela anterior ao aniversário não muda');
select is(public.executar_reajustes('2027-02-01'), 0, 'rotina repetida não reajusta de novo');

-- Deflação no segundo ano: ignorada por padrão (PL-03)
insert into public.indice_valores (codigo, competencia, variacao_mensal)
  select 'TESTE', ('2026-12-01'::date + make_interval(months => m))::date, -0.1 from generate_series(0, 11) m;
select is(public.executar_reajustes('2028-01-20'), 1, 'segundo aniversário processado');
select is((select fator_aplicado::text || ' ' || diferenca_centavos from public.reajustes where contrato_id = testes.id('contrato') and aniversario = '2028-01-15'),
  '1.000000000000 0', 'índice negativo é ignorado');

-- Importação: formato do SGS
select is(privado.gravar_serie_indice('TESTE', '[{"data":"01/12/2027","valor":"0.39"},{"data":"01/01/2028","valor":"0.16"},{"data":"xx","valor":"1"}]'::jsonb),
  2, 'grava as competências válidas da série');
select is(privado.gravar_serie_indice('TESTE', '[{"data":"01/12/2027","valor":"0.39"}]'::jsonb), 0, 'importação repetida não regrava');
select is(privado.gravar_serie_indice('TESTE', '[{"data":"01/12/2027","valor":"0.40"}]'::jsonb), 1, 'revisão do índice é atualizada');

-- Volume: 1.000 contratos reajustados por rotina idempotente
update public.tenants set plano_id = 'empresarial' where id = testes.id('tenant');
select testes.entrar(testes.id('ana'));
select testes.guardar('emp2', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Grande', 'Goiânia', 'GO', '2026-01-01',
  (select jsonb_agg(jsonb_build_object('quadra', 'B', 'numero', n::text, 'area_m2', '300', 'preco_base_centavos', 100000)) from generate_series(1, 1000) n)));
reset role;
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2026-01-02' where id = testes.id('emp2');
select testes.entrar(testes.id('ana'));
select count(public.criar_contrato(
  public.vender_lote(l.id, json_build_object('comprador_id', (select id from public.compradores where tenant_id = testes.id('tenant')),
    'data_venda', '2026-01-15', 'preco_centavos', 100000, 'entrada_centavos', 10000, 'parcelas', 18,
    'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', '2026-02-15')::jsonb),
  (select jsonb_agg(jsonb_build_object('numero', n, 'vencimento', ('2026-01-15'::date + make_interval(months => n))::date,
     'valor_centavos', case when n = 0 then 10000 else 5000 end,
     'amortizacao_centavos', case when n = 0 then 10000 else 5000 end, 'juros_centavos', 0)) from generate_series(0, 18) n),
  'TESTE'))
  from public.lotes l where l.empreendimento_id = testes.id('emp2');
reset role;
select is(public.executar_reajustes('2027-02-01') + public.executar_reajustes('2027-02-01'), 1000,
  '1.000 contratos reajustados uma única vez');

select * from finish();
rollback;
