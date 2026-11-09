-- Fase 7c: eventos contábeis por SPE e configuração contábil do cliente.
begin;
\ir ../auxiliares/testes.psql
select plan(8);

select testes.guardar('ana', testes.criar_usuario('ana@contabil.com.br', 'Ana (dona)'));
select testes.guardar('intrusa', testes.criar_usuario('intrusa@contabil.com.br', 'Intrusa'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora Contábil'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Jardim Contábil', 'Goiânia', 'GO', '2025-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2025-01-02' where id = testes.id('emp');
insert into public.compradores (tenant_id, nome, cpf) values (testes.id('tenant'), 'Joana Compradora', '52998224725');
select testes.guardar('venda', public.vender_lote((select id from public.lotes where empreendimento_id = testes.id('emp')),
  json_build_object('comprador_id', (select id from public.compradores where tenant_id = testes.id('tenant')), 'data_venda', current_date - 5,
    'preco_centavos', 100000, 'entrada_centavos', 10000, 'parcelas', 1, 'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', current_date + 25)::jsonb));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), json_build_array(
  json_build_object('numero', 0, 'vencimento', current_date - 5, 'valor_centavos', 10000, 'amortizacao_centavos', 10000, 'juros_centavos', 0),
  json_build_object('numero', 1, 'vencimento', current_date + 25, 'valor_centavos', 90000, 'amortizacao_centavos', 90000, 'juros_centavos', 0))::jsonb));
select public.registrar_recebimento((select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 0), current_date - 5, 10000);
insert into public.socios (tenant_id, nome) values (testes.id('tenant'), 'Pedro Sócio');
select public.registrar_movimento_socio(testes.id('spe'), (select id from public.socios where tenant_id = testes.id('tenant')), 'aporte', current_date - 3, 50000, null);

select set_config('teste.eventos', public.eventos_contabeis(testes.id('spe'), current_date - 30, current_date)::text, true);
select is((select string_agg(e ->> 'evento', ',' order by e ->> 'evento') from jsonb_array_elements(current_setting('teste.eventos')::jsonb) e),
  'aporte_socio,recebimento_parcela,venda_contratada', 'venda, recebimento e aporte viram eventos');
select is((select (e ->> 'valor')::bigint from jsonb_array_elements(current_setting('teste.eventos')::jsonb) e where e ->> 'evento' = 'venda_contratada'),
  100000::bigint, 'venda pelo preço');
select is((select e ->> 'documento' from jsonb_array_elements(current_setting('teste.eventos')::jsonb) e where e ->> 'evento' = 'recebimento_parcela'),
  'CT 1 P0', 'recebimento identificado pelo contrato e parcela');
select is(jsonb_array_length(public.eventos_contabeis(testes.id('spe'), current_date - 30, current_date - 10)), 0, 'filtra pelo período');
select throws_ok($$ select public.eventos_contabeis(testes.id('spe'), current_date, current_date - 1) $$, '23514', 'Período inválido (até 13 meses).',
  'período invertido é recusado');

insert into public.plano_contas (tenant_id, codigo, nome) values (testes.id('tenant'), '1.1.1', 'Caixa'), (testes.id('tenant'), '1.1.2', 'Clientes');
select lives_ok($$ insert into public.regras_contabeis (tenant_id, evento, conta_debito, conta_credito)
  values (testes.id('tenant'), 'recebimento_parcela', '1.1.1', '1.1.2') $$, 'dona configura regra com contas do plano');
select throws_ok($$ insert into public.regras_contabeis (tenant_id, evento, conta_debito, conta_credito)
  values (testes.id('tenant'), 'venda_contratada', '9.9.9', '1.1.2') $$, '23503', null, 'regra só com contas do plano');

select testes.entrar(testes.id('intrusa'));
select throws_ok($$ select public.eventos_contabeis(testes.id('spe'), current_date - 30, current_date) $$, '42501', null,
  'quem não é da loteadora não exporta');

select * from finish();
rollback;
