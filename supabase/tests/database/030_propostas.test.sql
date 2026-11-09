-- Fase 4b: proposta como etapa separada (corretor propõe, gestão decide, venda converte).
begin;
\ir ../auxiliares/testes.psql
select plan(14);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));
select testes.guardar('dani', testes.criar_usuario('dani@corretora.com.br', 'Dani (corretora)'));

select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":9000000},
    {"quadra":"A","numero":"2","area_m2":"300","preco_base_centavos":9000000}]'::jsonb));
select testes.guardar('l1', (select id from public.lotes where numero = '1' and empreendimento_id = testes.id('emp')));
select testes.guardar('l2', (select id from public.lotes where numero = '2' and empreendimento_id = testes.id('emp')));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2026-01-02' where id = testes.id('emp');
select set_config('teste.c1', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
select set_config('teste.c2', public.criar_convite(testes.id('tenant'), 'dani@corretora.com.br', 'corretor'), true);
insert into public.corretores (tenant_id, nome, usuario_id, comissao_percentual)
  values (testes.id('tenant'), 'Caio', testes.id('caio'), 0.05), (testes.id('tenant'), 'Dani', testes.id('dani'), 0.04);
select set_config('teste.proposta', json_build_object(
  'cliente_nome', 'Joana Compradora', 'cliente_cpf', '52998224725', 'preco_centavos', 8800000,
  'entrada_centavos', 880000, 'parcelas', 120, 'juros_mensal', 0.005, 'sistema', 'price',
  'primeira_parcela_em', current_date + 30)::text, true);

-- Corretor reserva e propõe
select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.c1'));
select public.reservar_lote(testes.id('l1'), 'Joana');
select testes.guardar('p1', public.criar_proposta(testes.id('l1'), current_setting('teste.proposta')::jsonb));
select is((select corretor_id from public.propostas where id = testes.id('p1')),
  (select id from public.corretores where usuario_id = testes.id('caio')), 'proposta fica com o corretor que propôs');
select is((select valida_ate from public.propostas where id = testes.id('p1')), current_date + 7, 'validade padrão de 7 dias');
select throws_ok($$ select public.decidir_proposta(testes.id('p1'), true) $$, '42501', null, 'corretor não aceita a própria proposta');
select throws_ok($$ select public.criar_proposta(testes.id('l1'), jsonb_set(current_setting('teste.proposta')::jsonb, '{cliente_cpf}', '"52998224724"')) $$,
  '23514', null, 'CPF inválido é recusado');
select throws_ok($$ select public.criar_proposta(testes.id('l1'), jsonb_set(current_setting('teste.proposta')::jsonb, '{valida_ate}', to_jsonb(current_date + 120))) $$,
  '23514', null, 'validade além de 90 dias é recusada');

-- Outra corretora não vê nem propõe no lote reservado pelo colega (RN-C07)
select testes.entrar(testes.id('dani'));
select public.aceitar_convite(current_setting('teste.c2'));
select is_empty($$ select 1 from public.propostas $$, 'corretora não vê proposta de outro corretor');
select throws_ok($$ select public.criar_proposta(testes.id('l1'), current_setting('teste.proposta')::jsonb) $$,
  '23514', 'O lote está reservado para outro corretor.', 'corretora não propõe em lote reservado por outro');
select testes.guardar('p2', public.criar_proposta(testes.id('l2'), current_setting('teste.proposta')::jsonb));
select throws_ok($$ insert into public.propostas (tenant_id, empreendimento_id, lote_id, cliente_nome, preco_centavos, entrada_centavos, parcelas, juros_mensal, sistema, valida_ate)
  values (testes.id('tenant'), testes.id('emp'), testes.id('l2'), 'x', 1, 1, 0, 0, 'price', current_date) $$,
  '42501', null, 'proposta só pela função');

-- Gestão decide
select testes.entrar(testes.id('ana'));
select throws_ok($$ select public.decidir_proposta(testes.id('p2'), false) $$, '23514', null, 'recusa exige motivo');
select lives_ok($$ select public.decidir_proposta(testes.id('p2'), false, 'Prazo longo demais') $$, 'dona recusa a proposta');
select lives_ok($$ select public.decidir_proposta(testes.id('p1'), true) $$, 'dona aceita a proposta');
select testes.guardar('p3', public.criar_proposta(testes.id('l1'), current_setting('teste.proposta')::jsonb));
select throws_ok($$ select public.decidir_proposta(testes.id('p3'), true) $$, '23514', null, 'só uma proposta aceita por lote');

-- A venda converte a aceita e encerra as abertas
insert into public.compradores (tenant_id, nome, cpf) values (testes.id('tenant'), 'Joana Compradora', '52998224725');
select testes.guardar('v1', public.vender_lote(testes.id('l1'), json_build_object(
  'comprador_id', (select id from public.compradores where tenant_id = testes.id('tenant')),
  'data_venda', current_date, 'preco_centavos', 8800000, 'entrada_centavos', 880000, 'parcelas', 120,
  'juros_mensal', 0.005, 'sistema', 'price', 'primeira_parcela_em', current_date + 30)::jsonb));
select results_eq($$ select situacao, venda_id from public.propostas where id = testes.id('p1') $$,
  $$ values ('convertida'::text, testes.id('v1')) $$, 'proposta aceita vira convertida com a venda');
select is((select situacao from public.propostas where id = testes.id('p3')), 'cancelada', 'proposta aberta do lote vendido é cancelada');

select * from finish();
rollback;
