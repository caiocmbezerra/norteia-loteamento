-- Fase 7a: portais do comprador, do sócio e do permutante.
begin;
\ir ../auxiliares/testes.psql
select plan(14);

create temp table asaas_falso (metodo text, caminho text, resposta jsonb);
grant all on asaas_falso to public;
create or replace function privado.asaas_chamar(p_ambiente text, p_chave text, p_metodo text, p_caminho text, p_corpo jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  select resposta into v from pg_temp.asaas_falso where metodo = p_metodo and p_caminho like caminho limit 1;
  return coalesce(v, '{"status":500,"corpo":{}}'::jsonb);
end $$;

select testes.guardar('ana', testes.criar_usuario('ana@loteadora.com.br', 'Ana (dona)'));
select testes.guardar('joana', testes.criar_usuario('joana@compradora.com.br', 'Joana (compradora)'));
select testes.guardar('pedro', testes.criar_usuario('pedro@terreno.com.br', 'Pedro (permutante e sócio)'));
select testes.guardar('intrusa', testes.criar_usuario('intrusa@x.com.br', 'Intrusa'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora Portal'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Jardim Portal', 'Goiânia', 'GO', '2026-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
insert into public.compradores (tenant_id, nome, cpf, email) values (testes.id('tenant'), 'Joana Compradora', '52998224725', 'joana@compradora.com.br');
select testes.guardar('comprador', (select id from public.compradores where tenant_id = testes.id('tenant')));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2026-01-02' where id = testes.id('emp');
select testes.guardar('venda', public.vender_lote((select id from public.lotes where empreendimento_id = testes.id('emp')),
  json_build_object('comprador_id', testes.id('comprador'), 'data_venda', current_date, 'preco_centavos', 100000,
    'entrada_centavos', 10000, 'parcelas', 2, 'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', current_date + 30)::jsonb));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), json_build_array(
  json_build_object('numero', 0, 'vencimento', current_date, 'valor_centavos', 10000, 'amortizacao_centavos', 10000, 'juros_centavos', 0),
  json_build_object('numero', 1, 'vencimento', current_date + 30, 'valor_centavos', 45000, 'amortizacao_centavos', 45000, 'juros_centavos', 0),
  json_build_object('numero', 2, 'vencimento', current_date + 60, 'valor_centavos', 45000, 'amortizacao_centavos', 45000, 'juros_centavos', 0))::jsonb));
select public.registrar_recebimento((select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 0), current_date, 10000);
insert into public.permutantes (tenant_id, nome) values (testes.id('tenant'), 'Pedro Dono do Terreno');
select testes.guardar('perm', (select id from public.permutantes where tenant_id = testes.id('tenant')));
select testes.guardar('permuta', public.criar_permuta(testes.id('emp'), testes.id('perm'),
  '{"tipo":"financeira","inicio":"2026-01-01","percentual":0.1,"base":"recebido","abate_distrato":true}'));
insert into public.socios (tenant_id, nome) values (testes.id('tenant'), 'Pedro Sócio');
select public.definir_participacao(testes.id('spe'), (select id from public.socios where tenant_id = testes.id('tenant')), 0.5, '2026-01-01', 'Contrato social');

-- Convites
select set_config('teste.c1', public.criar_convite_portal(testes.id('tenant'), 'comprador', testes.id('comprador'), 'joana@compradora.com.br'), true);
select set_config('teste.c2', public.criar_convite_portal(testes.id('tenant'), 'permutante', testes.id('perm'), 'pedro@terreno.com.br'), true);
select set_config('teste.c3', public.criar_convite_portal(testes.id('tenant'), 'socio', (select id from public.socios where tenant_id = testes.id('tenant')), 'pedro@terreno.com.br'), true);
select throws_ok($$ select public.criar_convite_portal(testes.id('tenant'), 'comprador', testes.id('comprador'), 'invalido') $$, '23514', null, 'e-mail do convite é validado');

select testes.entrar(testes.id('intrusa'));
select throws_ok($$ select public.aceitar_convite_portal(current_setting('teste.c1')) $$, '42501', 'Este convite foi enviado para outro e-mail.', 'convite só para o e-mail convidado');
select throws_ok($$ select public.criar_convite_portal(testes.id('tenant'), 'comprador', testes.id('comprador'), 'x@x.com.br') $$, '42501', null, 'quem não é da loteadora não convida');
select throws_ok($$ select public.portal_contrato(testes.id('contrato')) $$, '42501', null, 'outro usuário não vê o contrato');

select testes.entrar(testes.id('joana'));
select is(public.aceitar_convite_portal(current_setting('teste.c1')), 'comprador', 'compradora aceita o convite');
select is((select jsonb_array_length(public.meu_portal() -> 'contratos')), 1, 'portal lista o contrato da compradora');
select is((public.meu_portal() #>> '{contratos,0,saldo}')::bigint, 90000::bigint, 'com o saldo em aberto');
select is(jsonb_array_length(public.portal_contrato(testes.id('contrato')) -> 'pagamentos'), 1, 'e os pagamentos feitos');
select is_empty($$ select 1 from public.contratos $$, 'compradora não lê as tabelas internas');
select throws_ok($$ select public.segunda_via((select (public.portal_contrato(testes.id('contrato')) #>> '{parcelas,1,id}')::uuid)) $$,
  '23514', 'A loteadora ainda não emite boleto pelo portal; fale com ela.', 'sem Asaas, sem segunda via automática');

-- Com Asaas: a compradora emite a própria segunda via
reset role;
insert into pg_temp.asaas_falso values
  ('POST', '/customers', '{"status":200,"corpo":{"id":"cus_1"}}'),
  ('POST', '/payments', '{"status":200,"corpo":{"id":"pay_9","invoiceUrl":"https://sandbox.asaas.com/i/9"}}');
insert into public.integracoes_asaas (tenant_id, ambiente, segredo_id, webhook_token_hash)
  values (testes.id('tenant'), 'sandbox', vault.create_secret('$aact_hmlg_x', 'asaas:teste-portal'), 'x');
select testes.entrar(testes.id('joana'));
select is(public.segunda_via((select (public.portal_contrato(testes.id('contrato')) #>> '{parcelas,1,id}')::uuid)),
  'https://sandbox.asaas.com/i/9', 'compradora emite a segunda via');

-- Permutante e sócio
select testes.entrar(testes.id('pedro'));
select public.aceitar_convite_portal(current_setting('teste.c2'));
select public.aceitar_convite_portal(current_setting('teste.c3'));
select is(jsonb_array_length(public.meu_portal() -> 'permutas') || '/' || jsonb_array_length(public.meu_portal() -> 'sociedades'), '1/1',
  'permutante e sócio veem suas permutas e sociedades');
select is(jsonb_array_length(public.eventos_permuta(testes.id('permuta')) -> 'vendas'), 1, 'extrato do permutante traz as vendas do empreendimento');
select testes.entrar(testes.id('joana'));
select throws_ok($$ select public.eventos_permuta(testes.id('permuta')) $$, '42501', null, 'compradora não vê o extrato do permutante');

select * from finish();
rollback;
