-- Fase 6a: distrato (RN-D01 a RN-D03).
begin;
\ir ../auxiliares/testes.psql
select plan(13);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
select testes.guardar('l1', (select id from public.lotes where empreendimento_id = testes.id('emp')));
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
insert into public.compradores (tenant_id, nome) values (testes.id('tenant'), 'Joana');
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2026-01-02' where id = testes.id('emp');
select testes.guardar('venda', public.vender_lote(testes.id('l1'), json_build_object('comprador_id', (select id from public.compradores where tenant_id = testes.id('tenant')),
  'data_venda', current_date - 40, 'preco_centavos', 100000, 'entrada_centavos', 10000, 'parcelas', 2,
  'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', current_date + 10)::jsonb));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), json_build_array(
  json_build_object('numero', 0, 'vencimento', current_date - 40, 'valor_centavos', 10000, 'amortizacao_centavos', 10000, 'juros_centavos', 0),
  json_build_object('numero', 1, 'vencimento', current_date + 10, 'valor_centavos', 45000, 'amortizacao_centavos', 45000, 'juros_centavos', 0),
  json_build_object('numero', 2, 'vencimento', current_date + 40, 'valor_centavos', 45000, 'amortizacao_centavos', 45000, 'juros_centavos', 0))::jsonb));
select public.registrar_recebimento((select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 0), current_date - 40, 10000);
select is((select count(*) from public.parametros where chave like 'distrato.%'), 6::bigint, 'parâmetros do distrato no catálogo');

-- Pago 100,00 − cláusula 10% de 1.000 = 0 → sem devolução; aqui simulamos devolução de 30,00 em 2 parcelas
select set_config('teste.resumo', '{"devolucao_centavos": 3000, "pago_centavos": 10000}', true);
select set_config('teste.dev', json_build_array(
  json_build_object('numero', 1, 'vencimento', current_date + 365, 'valor_centavos', 1500),
  json_build_object('numero', 2, 'vencimento', current_date + 395, 'valor_centavos', 1500))::text, true);
select throws_ok($$ select public.executar_distrato(testes.id('contrato'), current_date, 'Desistência da compradora', current_setting('teste.resumo')::jsonb,
  replace(current_setting('teste.dev'), '1500}]', '1400}]')::jsonb) $$, '23514', 'As parcelas da devolução não conferem com o cálculo.', 'devolução precisa somar o cálculo');
select throws_ok($$ select public.executar_distrato(testes.id('contrato'), current_date, 'ok', current_setting('teste.resumo')::jsonb, current_setting('teste.dev')::jsonb) $$,
  '23514', 'Informe o motivo do distrato.', 'distrato exige motivo');
select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.cc'));
select throws_ok($$ select public.executar_distrato(testes.id('contrato'), current_date, 'Desistência da compradora', current_setting('teste.resumo')::jsonb, current_setting('teste.dev')::jsonb) $$,
  '42501', null, 'corretor não executa distrato');

select testes.entrar(testes.id('ana'));
select testes.guardar('distrato', public.executar_distrato(testes.id('contrato'), current_date, 'Desistência da compradora',
  current_setting('teste.resumo')::jsonb, current_setting('teste.dev')::jsonb));
select is((select situacao from public.contratos where id = testes.id('contrato')), 'distratado', 'contrato distratado');
select is((select situacao from public.vendas where id = testes.id('venda')), 'distratada', 'venda distratada');
select is((select status::text from public.lotes where id = testes.id('l1')), 'disponivel', 'lote volta ao estoque (RN-D03)');
select is((select string_agg(numero || ':' || situacao, ' ' order by numero) from public.parcelas where contrato_id = testes.id('contrato')),
  '0:paga 1:cancelada 2:cancelada', 'parcelas futuras canceladas; o pago fica no histórico');
select is((select count(*) || ' ' || sum(valor_centavos) from public.devolucoes where distrato_id = testes.id('distrato')), '2 3000', 'devolução parcelada');
select throws_ok($$ select public.executar_distrato(testes.id('contrato'), current_date, 'Desistência da compradora', current_setting('teste.resumo')::jsonb, current_setting('teste.dev')::jsonb) $$,
  '23514', 'Só contratos vigentes são distratados.', 'distrato não se repete');
select lives_ok($$ select public.pagar_devolucao((select id from public.devolucoes where distrato_id = testes.id('distrato') and numero = 1), current_date) $$,
  'pagamento da devolução registrado');
select throws_ok($$ select public.pagar_devolucao((select id from public.devolucoes where distrato_id = testes.id('distrato') and numero = 1), current_date) $$,
  '23514', 'Esta parcela da devolução já foi paga.', 'devolução não é paga duas vezes');
select lives_ok($$ select public.reservar_lote(testes.id('l1'), 'Novo interessado') $$, 'lote distratado pode ser vendido de novo');

select * from finish();
rollback;
