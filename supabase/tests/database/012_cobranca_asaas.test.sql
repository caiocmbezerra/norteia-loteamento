-- Fase 5b-2: cobrança pelo Asaas com a API simulada (sem rede).
begin;
\ir ../auxiliares/testes.psql
select plan(24);

-- API do Asaas simulada: respostas por método + caminho (LIKE) e registro das chamadas.
create temp table asaas_falso (metodo text, caminho text, resposta jsonb, ordem serial);
create temp table asaas_chamadas (metodo text, caminho text, corpo jsonb);
grant all on asaas_falso, asaas_chamadas to public;
grant usage on sequence asaas_falso_ordem_seq to public;
create or replace function privado.asaas_chamar(p_ambiente text, p_chave text, p_metodo text, p_caminho text, p_corpo jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  insert into pg_temp.asaas_chamadas values (p_metodo, p_caminho, p_corpo);
  select resposta into v from pg_temp.asaas_falso where metodo = p_metodo and p_caminho like caminho order by ordem desc limit 1;
  return coalesce(v, '{"status":500,"corpo":{}}'::jsonb);
end $$;
create function pg_temp.responder(m text, c text, r jsonb) returns void language sql as
  $$ insert into pg_temp.asaas_falso (metodo, caminho, resposta) values (m, c, r) $$;

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('fabi', testes.criar_usuario('fabi@loteadora.com.br', 'Fabi (financeiro)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Residencial', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
select set_config('teste.cf', public.criar_convite(testes.id('tenant'), 'fabi@loteadora.com.br', 'financeiro'), true);
insert into public.compradores (tenant_id, nome) values (testes.id('tenant'), 'Joana Compradora');
select testes.guardar('comprador', (select id from public.compradores where tenant_id = testes.id('tenant')));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2026-01-02' where id = testes.id('emp');
-- R$ 1.000,00: entrada 100,00 + 2 × 450,00 sem juros, a vencer
select testes.guardar('venda', public.vender_lote((select id from public.lotes where empreendimento_id = testes.id('emp')),
  json_build_object('comprador_id', testes.id('comprador'), 'data_venda', current_date, 'preco_centavos', 100000,
    'entrada_centavos', 10000, 'parcelas', 2, 'juros_mensal', 0, 'sistema', 'sac',
    'primeira_parcela_em', current_date + 30)::jsonb));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), json_build_array(
  json_build_object('numero', 0, 'vencimento', current_date, 'valor_centavos', 10000, 'amortizacao_centavos', 10000, 'juros_centavos', 0),
  json_build_object('numero', 1, 'vencimento', current_date + 30, 'valor_centavos', 45000, 'amortizacao_centavos', 45000, 'juros_centavos', 0),
  json_build_object('numero', 2, 'vencimento', current_date + 60, 'valor_centavos', 45000, 'amortizacao_centavos', 45000, 'juros_centavos', 0))::jsonb));
select testes.guardar('p0', (select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 0));
select testes.guardar('p1', (select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 1));
select testes.guardar('p2', (select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 2));

-- Configuração
select testes.entrar(testes.id('fabi'));
select public.aceitar_convite(current_setting('teste.cf'));
select throws_ok($$ select public.configurar_asaas(testes.id('tenant'), 'sandbox', '$aact_hmlg_x') $$, '42501', null, 'financeiro não configura a integração');
select testes.entrar(testes.id('ana'));
select throws_ok($$ select public.configurar_asaas(testes.id('tenant'), 'sandbox', '$aact_prod_x') $$, '23514', null, 'chave de produção não serve no sandbox');
select pg_temp.responder('GET', '/finance/balance', '{"status":401,"corpo":{"errors":[{"description":"A chave de API fornecida é inválida"}]}}');
select throws_ok($$ select public.configurar_asaas(testes.id('tenant'), 'sandbox', '$aact_hmlg_errada') $$, '23514',
  'O Asaas recusou a chave: A chave de API fornecida é inválida', 'chave recusada pelo Asaas não é gravada');
select pg_temp.responder('GET', '/finance/balance', '{"status":200,"corpo":{"balance":0}}');
select set_config('teste.token', public.configurar_asaas(testes.id('tenant'), 'sandbox', '$aact_hmlg_certa'), true);
select is(length(current_setting('teste.token')), 48, 'configuração devolve o token do webhook');
reset role;
select is((select decrypted_secret from vault.decrypted_secrets s join public.integracoes_asaas i on i.segredo_id = s.id where i.tenant_id = testes.id('tenant')),
  '$aact_hmlg_certa', 'a chave fica cifrada no Vault');
select testes.entrar(testes.id('fabi'));
select throws_ok($$ select segredo_id from public.integracoes_asaas $$, '42501', null, 'ninguém lê a referência do segredo');
select is((select ambiente from public.integracoes_asaas), 'sandbox', 'financeiro vê a situação da integração');

-- Emissão
select throws_ok($$ select public.gerar_cobranca(testes.id('p1')) $$, '23514', 'Cadastre o CPF do comprador para emitir boleto e Pix.', 'sem CPF não emite');
reset role;
update public.compradores set cpf = '52998224725' where id = testes.id('comprador');
select pg_temp.responder('POST', '/customers', '{"status":200,"corpo":{"id":"cus_1"}}');
select pg_temp.responder('POST', '/payments', '{"status":200,"corpo":{"id":"pay_1","invoiceUrl":"https://sandbox.asaas.com/i/1","bankSlipUrl":"https://sandbox.asaas.com/b/1"}}');
select testes.entrar(testes.id('fabi'));
select testes.guardar('c1', public.gerar_cobranca(testes.id('p1')));
select is((select valor_centavos || ' ' || situacao || ' ' || link_fatura from public.cobrancas where id = testes.id('c1')),
  '45000 pendente https://sandbox.asaas.com/i/1', 'cobrança emitida pelo saldo da parcela');
reset role;
select is((select corpo ->> 'value' || ' ' || (corpo #>> '{fine,value}') || ' ' || (corpo #>> '{interest,value}') || ' ' || (corpo ->> 'billingType')
  from pg_temp.asaas_chamadas where metodo = 'POST' and caminho = '/payments'),
  '450.00 2.0000 1.0000 UNDEFINED', 'boleto + Pix com multa e juros do contrato');
select testes.entrar(testes.id('fabi'));
select is(public.gerar_cobranca(testes.id('p1')), testes.id('c1'), 'parcela com cobrança pendente não gera outra');
reset role;
select is((select count(*) from pg_temp.asaas_chamadas where caminho = '/customers'), 1::bigint, 'comprador cadastrado uma vez no Asaas');

-- Webhook
set local role anon;
select is(public.webhook_asaas(testes.id('tenant'), 'token-errado', '{"event":"PAYMENT_RECEIVED","payment":{"id":"pay_1"}}'), 'nao_autorizado', 'token errado é recusado');
select throws_ok($$ select public.gerar_cobranca(testes.id('p2')) $$, '42501', null, 'anônimo só chama o webhook');
reset role;
-- O aviso diz 1,00, mas o Asaas informa 450,00 recebidos: vale a consulta.
select pg_temp.responder('GET', '/payments/pay_1', '{"status":200,"corpo":{"id":"pay_1","status":"RECEIVED","value":450.00,"billingType":"PIX","paymentDate":"2026-01-10","clientPaymentDate":"2026-01-10"}}');
set local role anon;
select is(public.webhook_asaas(testes.id('tenant'), current_setting('teste.token'),
  '{"id":"evt_1","event":"PAYMENT_RECEIVED","payment":{"id":"pay_1","value":1.00}}'), 'paga', 'aviso válido baixa a parcela');
select is(public.webhook_asaas(testes.id('tenant'), current_setting('teste.token'),
  '{"id":"evt_1","event":"PAYMENT_RECEIVED","payment":{"id":"pay_1"}}'), 'repetido', 'aviso repetido é ignorado');
select is(public.webhook_asaas(testes.id('tenant'), current_setting('teste.token'),
  '{"id":"evt_2","event":"PAYMENT_CONFIRMED","payment":{"id":"pay_1"}}'), 'ja_processada', 'outro aviso do mesmo pagamento não baixa de novo (RN-K05)');
reset role;
select is((select count(*) || ' ' || min(principal_centavos) || ' ' || min(origem) || ' ' || min(referencia_externa) from public.recebimentos where tenant_id = testes.id('tenant')),
  '1 45000 asaas pay_1', 'um recebimento, com o valor conferido no Asaas');

-- Pagamento com acréscimo e varredura de segurança
select pg_temp.responder('POST', '/payments', '{"status":200,"corpo":{"id":"pay_2","invoiceUrl":"https://sandbox.asaas.com/i/2"}}');
select testes.entrar(testes.id('fabi'));
select testes.guardar('c2', public.gerar_cobranca(testes.id('p2')));
reset role;
-- Formato conferido no sandbox (12/11/2026): pago em atraso, "value" é o total e "interestValue" soma multa e juros.
select pg_temp.responder('GET', '/payments/pay_2', format('{"status":200,"corpo":{"id":"pay_2","status":"RECEIVED","value":460.50,"originalValue":450.00,"interestValue":10.50,"paymentDate":"%s"}}',
  current_date + 61)::jsonb);
select is(public.conciliar_cobrancas(), 1, 'a varredura baixa o pagamento sem webhook');
select is((select multa_centavos || '/' || juros_mora_centavos from public.recebimentos where referencia_externa = 'pay_2'),
  round(45000 * (select multa_atraso from public.contratos where id = testes.id('contrato')))::bigint || '/' ||
    (1050 - round(45000 * (select multa_atraso from public.contratos where id = testes.id('contrato')))::bigint),
  'acréscimo do Asaas separa a multa do contrato e o resto como juros de mora');
select is((select valor_centavos from public.recebimentos where referencia_externa = 'pay_2'), 46050::bigint, 'recebimento com o valor total pago');
select is((select situacao from public.contratos where id = testes.id('contrato')), 'vigente', 'entrada ainda aberta mantém o contrato vigente');

-- Cancelamento
select pg_temp.responder('POST', '/payments', '{"status":200,"corpo":{"id":"pay_0"}}');
select pg_temp.responder('DELETE', '/payments/pay_0', '{"status":200,"corpo":{"deleted":true}}');
select testes.entrar(testes.id('fabi'));
select testes.guardar('c0', public.gerar_cobranca(testes.id('p0')));
select lives_ok($$ select public.cancelar_cobranca(testes.id('c0'), 'cliente pagou em dinheiro') $$, 'cobrança cancelada no Asaas');
select throws_ok($$ select public.registrar_recebimento(testes.id('p0'), current_date, 10000, p_origem => 'asaas', p_referencia => 'pay_x') $$,
  '23514', null, 'usuário não registra recebimento como se viesse do Asaas');

select * from finish();
rollback;
