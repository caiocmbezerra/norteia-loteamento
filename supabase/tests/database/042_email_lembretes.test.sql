-- Lembrete de vencimento por e-mail (régua, RN-K10) com o Resend simulado (sem rede).
begin;
\ir ../auxiliares/testes.psql
select plan(14);

create temp table resend_chamadas (corpo jsonb, ordem serial);
create temp table resend_resposta (resposta jsonb);
grant all on resend_chamadas, resend_resposta to public;
grant usage on sequence resend_chamadas_ordem_seq to public;
insert into pg_temp.resend_resposta values ('{"status":200,"corpo":{"id":"email_1"}}');
create or replace function privado.resend_chamar(p_corpo jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into pg_temp.resend_chamadas (corpo) values (p_corpo);
  return (select resposta from pg_temp.resend_resposta limit 1);
end $$;

select testes.guardar('ana', testes.criar_usuario('ana@lembrete.com.br', 'Ana (dona)'));
select testes.guardar('intrusa', testes.criar_usuario('intrusa@lembrete.com.br', 'Intrusa'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora <Lembrete>'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Jardim Lembrete', 'Goiânia', 'GO', '2025-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2025-01-02' where id = testes.id('emp');
insert into public.compradores (tenant_id, nome, cpf, email) values (testes.id('tenant'), 'Joana Compradora', '52998224725', 'joana@exemplo.com.br');
select testes.guardar('venda', public.vender_lote((select id from public.lotes where empreendimento_id = testes.id('emp')),
  json_build_object('comprador_id', (select id from public.compradores where tenant_id = testes.id('tenant')), 'data_venda', current_date - 10,
    'preco_centavos', 100000, 'entrada_centavos', 10000, 'parcelas', 4, 'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', current_date - 3)::jsonb));
-- Parcelas: vencida há 3 dias, vence hoje, vence em 3 dias, vence em 10 dias.
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), json_build_array(
  json_build_object('numero', 0, 'vencimento', current_date - 10, 'valor_centavos', 10000, 'amortizacao_centavos', 10000, 'juros_centavos', 0),
  json_build_object('numero', 1, 'vencimento', current_date - 3, 'valor_centavos', 22500, 'amortizacao_centavos', 22500, 'juros_centavos', 0),
  json_build_object('numero', 2, 'vencimento', current_date, 'valor_centavos', 22500, 'amortizacao_centavos', 22500, 'juros_centavos', 0),
  json_build_object('numero', 3, 'vencimento', current_date + 3, 'valor_centavos', 22500, 'amortizacao_centavos', 22500, 'juros_centavos', 0),
  json_build_object('numero', 4, 'vencimento', current_date + 10, 'valor_centavos', 22500, 'amortizacao_centavos', 22500, 'juros_centavos', 0))::jsonb));
select public.registrar_recebimento((select id from public.parcelas where contrato_id = testes.id('contrato') and numero = 0), current_date - 10, 10000);
reset role;

select is(public.enviar_lembretes_vencimento(), 0, 'lembretes desligados por padrão: nada é enviado');

select testes.entrar(testes.id('ana'));
select public.definir_parametro(testes.id('tenant'), 'carteira.lembrete_email_ativo', 'true', '2026-01-01', 'Ligar lembretes');
select throws_ok($$ select public.enviar_lembretes_vencimento() $$, '42501', null, 'usuário não dispara a rotina');
reset role;

select is(public.enviar_lembretes_vencimento(), 3, 'três lembretes: 3 dias antes, no dia e 3 dias depois');
select is(public.enviar_lembretes_vencimento(), 0, 'a mesma etapa não é enviada duas vezes');
select is((select count(*) from pg_temp.resend_chamadas), 3::bigint, 'três chamadas ao Resend');
select ok((select bool_and(corpo ->> 'from' = 'Loteadora Lembrete <avisos@norteialoteamento.com.br>') from pg_temp.resend_chamadas),
  'remetente com o nome da loteadora, sem caracteres que quebram o cabeçalho');
select ok(exists (select 1 from pg_temp.resend_chamadas where corpo ->> 'subject' = 'Sua parcela vence hoje'), 'assunto do dia do vencimento');
select ok((select bool_and(corpo ->> 'html' like '%/descadastrar/' || (select token_descadastro from public.compradores where tenant_id = testes.id('tenant')) || '%')
  from pg_temp.resend_chamadas), 'todo e-mail traz o link de descadastro');
select ok((select bool_and(corpo ->> 'html' like '%R$ 225,00%') from pg_temp.resend_chamadas), 'valor da parcela em reais');
select is((select count(*) from public.envios_email where tenant_id = testes.id('tenant') and situacao = 'enviado'), 3::bigint, 'cada envio fica registrado');

-- Leitura do registro
select testes.entrar(testes.id('ana'));
select is((select count(*) from public.envios_email), 3::bigint, 'loteadora vê os envios');
select testes.entrar(testes.id('intrusa'));
select is_empty($$ select 1 from public.envios_email $$, 'outra pessoa não vê');

-- Descadastro pelo link, sem login
reset role;
select testes.guardar('token', (select token_descadastro from public.compradores where email = 'joana@exemplo.com.br'));
set local role anon;
select is(public.descadastrar_lembretes(testes.id('token')),
  'Loteadora <Lembrete>', 'link de descadastro funciona sem login');
reset role;
select is(public.enviar_lembretes_vencimento(current_date + 7), 0, 'comprador descadastrado não recebe mais');

select * from finish();
rollback;
