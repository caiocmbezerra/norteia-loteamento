-- Contrato e termo de quitação baixados pelo comprador no portal.
begin;
\ir ../auxiliares/testes.psql
select plan(4);

select testes.guardar('ana', testes.criar_usuario('ana@docportal.com.br', 'Ana (dona)'));
select testes.guardar('joana', testes.criar_usuario('joana@docportal.com.br', 'Joana (compradora)'));
select testes.guardar('intrusa', testes.criar_usuario('intrusa@docportal.com.br', 'Intrusa'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora Doc Portal'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Jardim Doc', 'Goiânia', 'GO', '2025-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2025-01-02' where id = testes.id('emp');
insert into public.compradores (tenant_id, nome, cpf) values (testes.id('tenant'), 'Joana Compradora', '52998224725');
select testes.guardar('venda', public.vender_lote((select id from public.lotes where empreendimento_id = testes.id('emp')),
  json_build_object('comprador_id', (select id from public.compradores where tenant_id = testes.id('tenant')), 'data_venda', current_date - 1,
    'preco_centavos', 100000, 'entrada_centavos', 10000, 'parcelas', 1, 'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', current_date + 29)::jsonb));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), json_build_array(
  json_build_object('numero', 0, 'vencimento', current_date - 1, 'valor_centavos', 10000, 'amortizacao_centavos', 10000, 'juros_centavos', 0),
  json_build_object('numero', 1, 'vencimento', current_date + 29, 'valor_centavos', 90000, 'amortizacao_centavos', 90000, 'juros_centavos', 0))::jsonb));
select set_config('teste.convite', public.criar_convite_portal(testes.id('tenant'), 'comprador', (select id from public.compradores where tenant_id = testes.id('tenant')), 'joana@docportal.com.br'), true);

select testes.entrar(testes.id('joana'));
select public.aceitar_convite_portal(current_setting('teste.convite'));
select is(public.documento_portal(testes.id('contrato'), 'contrato') #>> '{contrato,compradores,nome}', 'Joana Compradora',
  'compradora baixa o próprio contrato');
select throws_ok($$ select public.documento_portal(testes.id('contrato'), 'quitacao') $$, '23514',
  'O termo de quitação só sai com o contrato quitado.', 'quitação só com o contrato quitado');
select throws_ok($$ select public.documento_portal(testes.id('contrato'), 'aditivo_cessao') $$, '23514', 'Documento indisponível no portal.',
  'aditivos não saem pelo portal');

select testes.entrar(testes.id('intrusa'));
select throws_ok($$ select public.documento_portal(testes.id('contrato'), 'contrato') $$, '42501', null, 'outra pessoa não baixa o contrato');

select * from finish();
rollback;
