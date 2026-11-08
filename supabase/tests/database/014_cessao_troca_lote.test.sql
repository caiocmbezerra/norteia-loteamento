-- Fase 5c-3a: cessão de contrato e troca de lote por aditivo.
begin;
\ir ../auxiliares/testes.psql
select plan(16);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000},
    {"quadra":"A","numero":"2","area_m2":"360","preco_base_centavos":120000},
    {"quadra":"A","numero":"3","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
select testes.guardar('l1', (select id from public.lotes where numero = '1' and empreendimento_id = testes.id('emp')));
select testes.guardar('l2', (select id from public.lotes where numero = '2' and empreendimento_id = testes.id('emp')));
select testes.guardar('l3', (select id from public.lotes where numero = '3' and empreendimento_id = testes.id('emp')));
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
insert into public.compradores (tenant_id, nome) values (testes.id('tenant'), 'Joana Cedente'), (testes.id('tenant'), 'Pedro Cessionário');
select testes.guardar('joana', (select id from public.compradores where nome = 'Joana Cedente'));
select testes.guardar('pedro', (select id from public.compradores where nome = 'Pedro Cessionário'));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2026-01-02' where id = testes.id('emp');
-- R$ 1.000,00: entrada 100,00 + 2 × 450,00 (uma vencida há 10 dias, outra a vencer)
select testes.guardar('venda', public.vender_lote(testes.id('l1'), json_build_object('comprador_id', testes.id('joana'),
  'data_venda', current_date - 40, 'preco_centavos', 100000, 'entrada_centavos', 10000, 'parcelas', 2,
  'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', current_date - 10)::jsonb));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), json_build_array(
  json_build_object('numero', 0, 'vencimento', current_date - 40, 'valor_centavos', 10000, 'amortizacao_centavos', 10000, 'juros_centavos', 0),
  json_build_object('numero', 1, 'vencimento', current_date - 10, 'valor_centavos', 45000, 'amortizacao_centavos', 45000, 'juros_centavos', 0),
  json_build_object('numero', 2, 'vencimento', current_date + 20, 'valor_centavos', 45000, 'amortizacao_centavos', 45000, 'juros_centavos', 0))::jsonb));
select public.registrar_recebimento((select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 0), current_date - 40, 10000);

-- Cessão
select throws_ok($$ select public.ceder_contrato(testes.id('contrato'), testes.id('pedro'), current_date, 'Venda do direito ao Pedro') $$,
  '23514', 'O contrato tem parcelas vencidas: regularize antes da cessão.', 'cessão exige adimplência (sugestão da plataforma)');
select throws_ok($$ select public.ceder_contrato(testes.id('contrato'), testes.id('joana'), current_date, 'Venda do direito') $$,
  '23514', null, 'cessionário precisa ser outro comprador');
select public.registrar_recebimento((select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 1), current_date, 45000);
select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.cc'));
select throws_ok($$ select public.ceder_contrato(testes.id('contrato'), testes.id('pedro'), current_date, 'Venda do direito ao Pedro') $$,
  '42501', null, 'corretor não cede contrato');
select testes.entrar(testes.id('ana'));
select testes.guardar('cessao', public.ceder_contrato(testes.id('contrato'), testes.id('pedro'), current_date, 'Venda do direito ao Pedro'));
select is((select comprador_id from public.contratos where id = testes.id('contrato')), testes.id('pedro'), 'contrato passa ao cessionário');
select is((select condicoes ->> 'cedente_id' from public.aditivos where id = testes.id('cessao')), testes.id('joana')::text, 'aditivo registra o cedente');
select is((select comprador_id from public.vendas where id = testes.id('venda')), testes.id('joana'), 'a venda original continua com a compradora original');
select is((select count(*) from public.parcelas where contrato_id = testes.id('contrato') and situacao = 'aberta'), 1::bigint, 'cessão não muda as parcelas');

-- Troca de lote: saldo 450 + (1.200 − 1.000) = 650 em 2 parcelas
select set_config('teste.plano', json_build_array(
  json_build_object('numero', 3, 'vencimento', current_date + 30, 'valor_centavos', 32500, 'amortizacao_centavos', 32500, 'juros_centavos', 0),
  json_build_object('numero', 4, 'vencimento', current_date + 60, 'valor_centavos', 32500, 'amortizacao_centavos', 32500, 'juros_centavos', 0))::text, true);
select throws_ok($$ select public.trocar_lote(testes.id('contrato'), testes.id('l2'), current_date, 'Troca para lote de esquina', 120000, '{}',
  replace(current_setting('teste.plano'), '32500', '30000')::jsonb) $$, '23514', 'O novo plano não confere com o saldo após a troca.', 'plano precisa somar saldo + diferença');
reset role;
select set_config('app.transicao_lote', 'on', true);
update public.lotes set status = 'bloqueado' where id = testes.id('l3');
select set_config('app.transicao_lote', '', true);
select testes.entrar(testes.id('ana'));
select throws_ok($$ select public.trocar_lote(testes.id('contrato'), testes.id('l3'), current_date, 'Troca para lote de esquina', 100000, '{}', current_setting('teste.plano')::jsonb) $$,
  '23514', null, 'lote indisponível não recebe a troca');
select throws_ok($$ select public.trocar_lote(testes.id('contrato'), testes.id('l2'), current_date, 'Troca para lote de esquina', 5000, '{}', current_setting('teste.plano')::jsonb) $$,
  '23514', 'O preço do novo lote precisa ser maior que a entrada já paga.', 'preço novo acima da entrada');
select testes.guardar('troca', public.trocar_lote(testes.id('contrato'), testes.id('l2'), current_date, 'Troca para lote de esquina', 120000,
  '{"parcelas":2}', current_setting('teste.plano')::jsonb));
select is((select status::text from public.lotes where id = testes.id('l1')) || '/' || (select status::text from public.lotes where id = testes.id('l2')),
  'disponivel/vendido', 'lote antigo volta ao estoque; novo fica vendido');
select is((select lote_id from public.contratos where id = testes.id('contrato')), testes.id('l2'), 'contrato aponta o novo lote');
select is((select lote_id || ' ' || preco_centavos from public.vendas where id = testes.id('venda')), testes.id('l2') || ' 120000', 'venda acompanha o novo lote e preço');
select is((select string_agg(numero || ':' || situacao, ' ' order by numero) from public.parcelas where contrato_id = testes.id('contrato')),
  '0:paga 1:paga 2:cancelada 3:aberta 4:aberta', 'saldo antigo substituído pelo novo plano');
select is((select saldo_anterior_centavos || ' ' || encargos_incorporados_centavos || ' ' || novo_saldo_centavos from public.aditivos where id = testes.id('troca')),
  '45000 20000 65000', 'aditivo registra a diferença de preço');
select lives_ok($$ select public.reservar_lote(testes.id('l1'), 'Novo interessado') $$, 'lote antigo pode ser vendido de novo');

select * from finish();
rollback;
