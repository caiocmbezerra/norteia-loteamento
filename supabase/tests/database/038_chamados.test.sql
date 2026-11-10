-- L4: chamados no portal — comprador abre e conversa sobre o próprio contrato; a loteadora responde.
begin;
\ir ../auxiliares/testes.psql
select plan(11);

select testes.guardar('ana', testes.criar_usuario('ana@chamados.com.br', 'Ana (dona)'));
select testes.guardar('joana', testes.criar_usuario('joana@chamados.com.br', 'Joana (compradora)'));
select testes.guardar('intrusa', testes.criar_usuario('intrusa@chamados.com.br', 'Intrusa'));
select testes.guardar('ciro', testes.criar_usuario('ciro@chamados.com.br', 'Ciro (contador)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora Chamados'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Jardim Chamados', 'Goiânia', 'GO', '2025-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2025-01-02' where id = testes.id('emp');
insert into public.compradores (tenant_id, nome, cpf) values (testes.id('tenant'), 'Joana Compradora', '52998224725');
select testes.guardar('venda', public.vender_lote((select id from public.lotes where empreendimento_id = testes.id('emp')),
  json_build_object('comprador_id', (select id from public.compradores where tenant_id = testes.id('tenant')), 'data_venda', current_date - 1,
    'preco_centavos', 100000, 'entrada_centavos', 10000, 'parcelas', 1, 'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', current_date + 29)::jsonb));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), json_build_array(
  json_build_object('numero', 0, 'vencimento', current_date - 1, 'valor_centavos', 10000, 'amortizacao_centavos', 10000, 'juros_centavos', 0),
  json_build_object('numero', 1, 'vencimento', current_date + 29, 'valor_centavos', 90000, 'amortizacao_centavos', 90000, 'juros_centavos', 0))::jsonb));
select set_config('teste.convite', public.criar_convite_portal(testes.id('tenant'), 'comprador', (select id from public.compradores where tenant_id = testes.id('tenant')), 'joana@chamados.com.br'), true);
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'ciro@chamados.com.br', 'contador'), true);

-- Compradora abre o chamado
select testes.entrar(testes.id('joana'));
select public.aceitar_convite_portal(current_setting('teste.convite'));
select testes.guardar('ch', public.abrir_chamado(testes.id('contrato'), 'Segunda via da escritura', 'escritura', 'Quando sai a escritura do meu lote?'));
select is((select situacao from public.chamados where id = testes.id('ch')), 'aberto', 'chamado nasce aberto');
select is((select count(*) from public.chamado_mensagens where chamado_id = testes.id('ch')), 1::bigint, 'com a primeira mensagem');
select throws_ok($$ select public.mudar_situacao_chamado(testes.id('ch'), 'resolvido') $$, '42501', null, 'compradora não muda a situação');
select throws_ok($$ insert into public.chamado_mensagens (tenant_id, chamado_id, autor_comprador, texto) values (testes.id('tenant'), testes.id('ch'), true, 'x') $$,
  '42501', null, 'mensagem só pela função');

-- Loteadora responde e resolve
select testes.entrar(testes.id('ana'));
select lives_ok($$ select public.responder_chamado(testes.id('ch'), 'A escritura sai após a quitação; seu contrato está em dia.') $$, 'dona responde');
select is((select situacao from public.chamados where id = testes.id('ch')), 'em_atendimento', 'resposta da loteadora coloca em atendimento');
select lives_ok($$ select public.mudar_situacao_chamado(testes.id('ch'), 'resolvido') $$, 'dona marca como resolvido');

-- Nova mensagem da compradora reabre
select testes.entrar(testes.id('joana'));
select public.responder_chamado(testes.id('ch'), 'Obrigada! E o IPTU?');
select is((select situacao from public.chamados where id = testes.id('ch')), 'aberto', 'mensagem da compradora reabre o chamado');

-- Contador lê, mas não responde; outra pessoa não vê
select testes.entrar(testes.id('ciro'));
select public.aceitar_convite(current_setting('teste.cc'));
select is((select count(*) from public.chamado_mensagens where chamado_id = testes.id('ch')), 3::bigint, 'contador lê a conversa');
select throws_ok($$ select public.responder_chamado(testes.id('ch'), 'oi') $$, '42501', null, 'contador não responde');
select testes.entrar(testes.id('intrusa'));
select is_empty($$ select 1 from public.chamados $$, 'outra pessoa não vê os chamados');

select * from finish();
rollback;
