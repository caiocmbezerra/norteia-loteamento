-- Fase 4b: tabela de preços com vigência e aprovação de desconto acima do limite (RN-C05).
begin;
\ir ../auxiliares/testes.psql
select plan(23);

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('gil', testes.criar_usuario('gil@loteadora.com.br', 'Gil (gestor comercial)'));
select testes.guardar('caio', testes.criar_usuario('caio@corretor.com.br', 'Caio (corretor)'));

select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":10000000},
    {"quadra":"A","numero":"2","area_m2":"300","preco_base_centavos":10000000},
    {"quadra":"A","numero":"3","area_m2":"300"}]'::jsonb));
select testes.guardar('l1', (select id from public.lotes where numero = '1' and empreendimento_id = testes.id('emp')));
select testes.guardar('l2', (select id from public.lotes where numero = '2' and empreendimento_id = testes.id('emp')));
select testes.guardar('l3', (select id from public.lotes where numero = '3' and empreendimento_id = testes.id('emp')));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2026-01-02' where id = testes.id('emp');
select set_config('teste.cg', public.criar_convite(testes.id('tenant'), 'gil@loteadora.com.br', 'comercial_gestor'), true);
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'caio@corretor.com.br', 'corretor'), true);
insert into public.compradores (tenant_id, nome, cpf) values (testes.id('tenant'), 'Joana Compradora', '52998224725');
select testes.guardar('comprador', (select id from public.compradores where tenant_id = testes.id('tenant')));

-- Sem tabela, vale o preço de cadastro
select is(public.preco_tabela(testes.id('l1'), current_date), 10000000::bigint, 'sem tabela, o preço é o do cadastro do lote');

-- Publicação
select throws_ok($$ select public.publicar_tabela_preco(testes.id('emp'), 'Antiga', current_date - 1) $$,
  '23514', null, 'tabela não nasce com vigência passada');
select testes.guardar('t1', public.publicar_tabela_preco(testes.id('emp'), 'Tabela de lançamento', current_date));
select is((select lotes from public.tabelas_preco where id = testes.id('t1')), 2, 'lote sem preço fica fora da tabela');
select throws_ok($$ select public.publicar_tabela_preco(testes.id('emp'), 'Repetida', current_date) $$,
  '23514', null, 'uma tabela por data de vigência');

select set_config('teste.precos', json_build_object(testes.id('l2')::text, 12000000)::text, true);
select testes.guardar('t2', public.publicar_tabela_preco(testes.id('emp'), 'Reajuste de dezembro', current_date + 30, 0.05,
  current_setting('teste.precos')::jsonb));
select is(public.preco_tabela(testes.id('l1'), current_date + 30), 10500000::bigint, 'nova tabela aplica o reajuste sobre a vigente');
select is(public.preco_tabela(testes.id('l2'), current_date + 30), 12000000::bigint, 'preço informado substitui o reajuste');
select is(public.preco_tabela(testes.id('l1'), current_date), 10000000::bigint, 'antes da vigência vale a tabela anterior');
select is((select preco_base_centavos from public.lotes where id = testes.id('l1')), 10000000::bigint,
  'tabela futura ainda não muda o preço de cadastro');
select throws_ok($$ update public.lotes set preco_base_centavos = 1 where id = testes.id('l1') $$,
  '23514', 'O preço deste lote segue a tabela de preços; publique uma nova tabela para mudá-lo.',
  'preço de lote em tabela não é editado à mão');
select lives_ok($$ update public.lotes set preco_base_centavos = 8000000 where id = testes.id('l3') $$,
  'lote fora de tabela continua editável');
select throws_ok($$ insert into public.tabelas_preco (tenant_id, empreendimento_id, nome, vigente_desde, lotes) values (testes.id('tenant'), testes.id('emp'), 'x', current_date + 60, 0) $$,
  '42501', null, 'tabela só pela função');

-- A vigência futura chega: a rotina atualiza o cadastro
reset role;
update public.tabelas_preco set vigente_desde = current_date - 1 where id = testes.id('t1');
update public.tabelas_preco set vigente_desde = current_date where id = testes.id('t2');
select is(privado.sincronizar_precos(), 2, 'rotina diária aplica a tabela que passou a valer');
select is((select preco_base_centavos from public.lotes where id = testes.id('l1')), 10500000::bigint,
  'o cadastro passa a mostrar o preço da tabela vigente');

-- Limite de desconto: 5% para esta loteadora
insert into public.parametro_valores (tenant_id, chave, escopo, valor, vigencia, motivo)
  values (testes.id('tenant'), 'comercial.desconto_maximo_sem_aprovacao', 'tenant', '0.05', daterange('2026-01-01', null), 'Política comercial');

select testes.entrar(testes.id('gil'));
select public.aceitar_convite(current_setting('teste.cg'));
select set_config('teste.venda', json_build_object(
  'comprador_id', testes.id('comprador'), 'data_venda', current_date, 'preco_centavos', 9000000,
  'entrada_centavos', 900000, 'parcelas', 120, 'juros_mensal', 0.005, 'sistema', 'price',
  'primeira_parcela_em', current_date + 30)::text, true);
select throws_ok($$ select public.vender_lote(testes.id('l1'), current_setting('teste.venda')::jsonb) $$,
  '23514', 'Desconto de 14,29% sobre a tabela (R$ 105.000,00) passa do limite de 5,00%: peça a aprovação do desconto.',
  'gestor não vende com desconto acima do limite sem aprovação');
select throws_ok($$ select public.solicitar_aprovacao_desconto(testes.id('l1'), 10000000, current_date, 'Cliente fiel, à vista') $$,
  '23514', null, 'desconto dentro do limite não precisa de pedido');
select testes.guardar('ap', public.solicitar_aprovacao_desconto(testes.id('l1'), 9000000, current_date, 'Cliente compra três lotes à vista'));
select throws_ok($$ select public.decidir_aprovacao_desconto(testes.id('ap'), true) $$,
  '42501', null, 'gestor não aprova o próprio pedido');

select testes.entrar(testes.id('caio'));
select public.aceitar_convite(current_setting('teste.cc'));
select is_empty($$ select 1 from public.aprovacoes_desconto $$, 'corretor não vê pedidos de desconto de outros');

select testes.entrar(testes.id('ana'));
select lives_ok($$ select public.decidir_aprovacao_desconto(testes.id('ap'), true) $$, 'dona aprova o desconto');
select is((select valida_ate from public.aprovacoes_desconto where id = testes.id('ap')), current_date + 7,
  'aprovação vale pelo prazo configurado');

select testes.entrar(testes.id('gil'));
select set_config('teste.venda_menor', jsonb_set(current_setting('teste.venda')::jsonb, '{preco_centavos}', '8900000')::text, true);
select throws_ok($$ select public.vender_lote(testes.id('l1'), current_setting('teste.venda_menor')::jsonb) $$,
  '23514', null, 'aprovação não cobre preço abaixo do aprovado');
select testes.guardar('v1', public.vender_lote(testes.id('l1'), current_setting('teste.venda')::jsonb));
select results_eq(
  $$ select v.preco_tabela_centavos, v.desconto_aprovado_por, a.situacao, a.venda_id
       from public.vendas v join public.aprovacoes_desconto a on a.id = v.aprovacao_desconto_id
      where v.id = testes.id('v1') $$,
  $$ values (10500000::bigint, testes.id('ana'), 'utilizada'::text, testes.id('v1')) $$,
  'venda guarda o preço de tabela, quem aprovou e consome a aprovação');

-- Dono vende acima do limite direto, registrado como aprovado por ele
select testes.entrar(testes.id('ana'));
select testes.guardar('v2', public.vender_lote(testes.id('l2'), jsonb_set(current_setting('teste.venda')::jsonb, '{preco_centavos}', '9000000')));
select is((select desconto_aprovado_por from public.vendas where id = testes.id('v2')), testes.id('ana'),
  'venda do dono acima do limite fica registrada como aprovada por ele');

-- Recusa exige motivo
select testes.entrar(testes.id('gil'));
select testes.guardar('ap3', public.solicitar_aprovacao_desconto(testes.id('l3'), 7000000, current_date, 'Lote de esquina com problema'));
select testes.entrar(testes.id('ana'));
select throws_ok($$ select public.decidir_aprovacao_desconto(testes.id('ap3'), false) $$, '23514', null, 'recusa sem motivo é recusada');

select * from finish();
rollback;
