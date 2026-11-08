-- Fase 7b: dados da DIMOB por SPE e ano-calendário.
begin;
\ir ../auxiliares/testes.psql
select plan(9);

select testes.guardar('ana', testes.criar_usuario('ana@dimob.com.br', 'Ana (dona)'));
select testes.guardar('intrusa', testes.criar_usuario('intrusa@dimob.com.br', 'Intrusa'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora Dimob'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Jardim Dimob', 'Goiânia', 'GO', '2025-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000},{"quadra":"A","numero":"2","area_m2":"300","preco_base_centavos":80000}]'::jsonb));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2025-01-02', cep = '74000000', municipio_rfb = '9373'
 where id = testes.id('emp');
insert into public.compradores (tenant_id, nome, cpf) values (testes.id('tenant'), 'Joana Compradora', '52998224725');
select testes.guardar('comprador', (select id from public.compradores where tenant_id = testes.id('tenant')));

-- Venda do ano passado sem pagamento neste ano; venda deste ano com a entrada paga.
select testes.guardar('v1', public.vender_lote((select id from public.lotes where empreendimento_id = testes.id('emp') and numero = '2'),
  json_build_object('comprador_id', testes.id('comprador'), 'data_venda', make_date(extract(year from current_date)::int - 1, 6, 1),
    'preco_centavos', 80000, 'entrada_centavos', 80000, 'parcelas', 0, 'juros_mensal', 0, 'sistema', 'sac')::jsonb));
select testes.guardar('c1', public.criar_contrato(testes.id('v1'), json_build_array(
  json_build_object('numero', 0, 'vencimento', make_date(extract(year from current_date)::int - 1, 6, 1), 'valor_centavos', 80000, 'amortizacao_centavos', 80000, 'juros_centavos', 0))::jsonb));
select testes.guardar('v2', public.vender_lote((select id from public.lotes where empreendimento_id = testes.id('emp') and numero = '1'),
  json_build_object('comprador_id', testes.id('comprador'), 'data_venda', current_date - 1, 'preco_centavos', 100000,
    'entrada_centavos', 10000, 'parcelas', 1, 'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', current_date + 30)::jsonb));
select testes.guardar('c2', public.criar_contrato(testes.id('v2'), json_build_array(
  json_build_object('numero', 0, 'vencimento', current_date - 1, 'valor_centavos', 10000, 'amortizacao_centavos', 10000, 'juros_centavos', 0),
  json_build_object('numero', 1, 'vencimento', current_date + 30, 'valor_centavos', 90000, 'amortizacao_centavos', 90000, 'juros_centavos', 0))::jsonb));
select public.registrar_recebimento((select id from public.parcelas where contrato_id = testes.id('c2') and numero = 0), current_date - 1, 10000);

select is((select string_agg(numero::text, ',' order by numero) from public.contratos where tenant_id = testes.id('tenant')), '1,2',
  'contratos numerados em sequência por loteadora');

select set_config('teste.ano', extract(year from current_date)::text, true);
select is(jsonb_array_length(public.dados_dimob(testes.id('spe'), current_setting('teste.ano')::int) -> 'operacoes'), 1,
  'só entram contratos do ano ou com pagamento no ano');
select is((public.dados_dimob(testes.id('spe'), current_setting('teste.ano')::int) #> '{operacoes,0}'::text[]) - 'contrato_id'::text - 'empreendimento_id'::text - 'comprador_id'::text - 'data'::text,
  jsonb_build_object('numero', 2, 'comprador', 'Joana Compradora', 'cpf', '52998224725', 'valor_operacao', 100000, 'pago_no_ano', 10000,
    'imovel', 'Quadra A Lote 1 - Jardim Dimob'),
  'operação com valor da venda e valor pago no ano');
select is(jsonb_array_length(public.dados_dimob(testes.id('spe'), current_setting('teste.ano')::int - 1) -> 'operacoes'), 1,
  'no ano anterior aparece a venda daquele ano');
select is((select sum((c ->> 'tamanho')::int) from jsonb_array_elements(public.dados_dimob(testes.id('spe'), current_setting('teste.ano')::int) #> '{leiaute,registros,R03}') c),
  249::bigint, 'leiaute do ano vem junto (R03 com 249 posições)');
select is(public.dados_dimob(testes.id('spe'), current_setting('teste.ano')::int) #>> '{empreendimentos,0,municipio_rfb}', '9373',
  'dados do empreendimento para o endereço do imóvel');
select throws_ok($$ select public.dados_dimob(testes.id('spe'), current_setting('teste.ano')::int + 1) $$, '23514', 'Ano-calendário inválido.',
  'ano futuro é recusado');
select throws_ok($$ update public.leiautes_declaracao set versao = 'x' $$, '42501', null, 'leiaute não muda pelo app');

select testes.entrar(testes.id('intrusa'));
select throws_ok($$ select public.dados_dimob(testes.id('spe'), current_setting('teste.ano')::int) $$, '42501', null,
  'quem não é da loteadora não gera a DIMOB');

select * from finish();
rollback;
