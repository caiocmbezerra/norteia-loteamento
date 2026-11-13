-- Avisos de chamado e convite do portal por e-mail (D-116), com o Resend simulado.
begin;
\ir ../auxiliares/testes.psql
select plan(10);

create temp table resend_chamadas (corpo jsonb, ordem serial);
grant all on resend_chamadas to public;
grant usage on sequence resend_chamadas_ordem_seq to public;
create or replace function privado.resend_chamar(p_corpo jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into pg_temp.resend_chamadas (corpo) values (p_corpo);
  return '{"status":200,"corpo":{"id":"email_x"}}'::jsonb;
end $$;

select testes.guardar('ana', testes.criar_usuario('ana@aviso.com.br', 'Ana (dona)'));
select testes.guardar('joana', testes.criar_usuario('joana@aviso.com.br', 'Joana (compradora)'));
select testes.guardar('ciro', testes.criar_usuario('ciro@aviso.com.br', 'Ciro (contador)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora Aviso'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Jardim Aviso', 'Goiânia', 'GO', '2025-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2025-01-02' where id = testes.id('emp');
insert into public.compradores (tenant_id, nome, cpf, email) values (testes.id('tenant'), 'Joana Compradora', '52998224725', 'joana@aviso.com.br');
select testes.guardar('venda', public.vender_lote((select id from public.lotes where empreendimento_id = testes.id('emp')),
  json_build_object('comprador_id', (select id from public.compradores where tenant_id = testes.id('tenant')), 'data_venda', current_date - 1,
    'preco_centavos', 100000, 'entrada_centavos', 10000, 'parcelas', 1, 'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', current_date + 29)::jsonb));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), json_build_array(
  json_build_object('numero', 0, 'vencimento', current_date - 1, 'valor_centavos', 10000, 'amortizacao_centavos', 10000, 'juros_centavos', 0),
  json_build_object('numero', 1, 'vencimento', current_date + 29, 'valor_centavos', 90000, 'amortizacao_centavos', 90000, 'juros_centavos', 0))::jsonb));
select set_config('teste.convite', public.criar_convite_portal(testes.id('tenant'), 'comprador', (select id from public.compradores where tenant_id = testes.id('tenant')), 'joana@aviso.com.br'), true);
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'ciro@aviso.com.br', 'contador'), true);

-- Convite por e-mail
select is(public.enviar_convite_portal(current_setting('teste.convite')), 'enviado', 'convite do portal enviado por e-mail');
select ok((select corpo ->> 'html' like '%/portal-convite/' || current_setting('teste.convite') || '%' and corpo #>> '{to,0}' = 'joana@aviso.com.br'
  from pg_temp.resend_chamadas order by ordem desc limit 1), 'para o e-mail do convite, com o link oficial');
select is(public.enviar_convite_portal(current_setting('teste.convite')), 'repetido', 'o mesmo convite não é enviado duas vezes');
select testes.entrar(testes.id('ciro'));
select public.aceitar_convite(current_setting('teste.cc'));
select throws_ok($$ select public.enviar_convite_portal(current_setting('teste.convite')) $$, '42501', null, 'contador não envia convite');

-- Chamado aberto pela compradora avisa quem atende
select testes.entrar(testes.id('joana'));
select public.aceitar_convite_portal(current_setting('teste.convite'));
delete from pg_temp.resend_chamadas;
select testes.guardar('ch', public.abrir_chamado(testes.id('contrato'), 'Dúvida <boleto>', 'financeiro', 'Não recebi o boleto & preciso dele.'));
select is((select count(*) from pg_temp.resend_chamadas), 1::bigint, 'um aviso para a equipe (a dona; o contador não atende)');
select ok((select corpo #>> '{to,0}' = 'ana@aviso.com.br' and corpo ->> 'subject' = 'Chamado de Joana Compradora: Dúvida <boleto>'
             and corpo ->> 'html' like '%Dúvida &lt;boleto&gt;%' and corpo ->> 'html' like '%boleto &amp; preciso%' and corpo ->> 'html' like '%abriu um chamado%'
  from pg_temp.resend_chamadas), 'aviso para a dona, com o texto escapado');

-- Resposta da loteadora avisa a compradora
select testes.entrar(testes.id('ana'));
delete from pg_temp.resend_chamadas;
select public.responder_chamado(testes.id('ch'), 'Enviamos a segunda via no portal.');
select ok((select corpo #>> '{to,0}' = 'joana@aviso.com.br' and corpo ->> 'html' like '%/portal/contratos/' || testes.id('contrato') || '/chamados/' || testes.id('ch') || '%'
  from pg_temp.resend_chamadas), 'resposta avisa a compradora com o link do chamado no portal');
select is((select count(*) from public.envios_email where tipo = 'chamado'), 2::bigint, 'avisos registrados');

-- Aviso desligado
select public.definir_parametro(testes.id('tenant'), 'carteira.aviso_chamado_email', 'false', current_date, 'Sem avisos');
delete from pg_temp.resend_chamadas;
select public.responder_chamado(testes.id('ch'), 'Mais uma informação.');
select is((select count(*) from pg_temp.resend_chamadas), 0::bigint, 'com o aviso desligado, nada é enviado');
select testes.entrar(testes.id('joana'));
select lives_ok($$ select public.responder_chamado(testes.id('ch'), 'Obrigada!') $$, 'conversa segue normalmente');

select * from finish();
rollback;
