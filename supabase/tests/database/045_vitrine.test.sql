-- Vitrine pública: publicar, ver sem login (preço conforme a escolha), interesse vira lead e
-- avisa a equipe; portal lista os empreendimentos publicados da loteadora do comprador.
begin;
\ir ../auxiliares/testes.psql
select plan(17);

create temp table resend_chamadas (corpo jsonb, ordem serial);
grant all on resend_chamadas to public;
grant usage on sequence resend_chamadas_ordem_seq to public;
create or replace function privado.resend_chamar(p_corpo jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into pg_temp.resend_chamadas (corpo) values (p_corpo);
  return '{"status":200,"corpo":{"id":"x"}}'::jsonb;
end $$;

select testes.guardar('ana', testes.criar_usuario('ana@vitrine.com.br', 'Ana (dona)'));
select testes.guardar('joana', testes.criar_usuario('joana@vitrine.com.br', 'Joana (compradora)'));
select testes.guardar('ciro', testes.criar_usuario('ciro@vitrine.com.br', 'Ciro (contador)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora Vitrine'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Jardim São José', 'Goiânia', 'GO', '2025-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":9000000},{"quadra":"A","numero":"2","area_m2":"320","preco_base_centavos":9500000},{"quadra":"A","numero":"3","area_m2":"300","preco_base_centavos":8000000}]'::jsonb));
select testes.guardar('lote2', (select id from public.lotes where empreendimento_id = testes.id('emp') and numero = '2'));
update public.lotes set status = 'bloqueado' where empreendimento_id = testes.id('emp') and numero = '3';
select set_config('teste.cc', public.criar_convite(testes.id('tenant'), 'ciro@vitrine.com.br', 'contador'), true);

-- Antes de publicar, nada aparece
select is(public.vitrine_publica('qualquer'), null::jsonb, 'endereço inexistente não mostra nada');
select set_config('teste.slug', public.configurar_vitrine(testes.id('emp'), false, 'a_partir', 'Lotes a 5 minutos do centro.'), true);
select ok(current_setting('teste.slug') like 'jardim-sao-jose-%', 'endereço gerado a partir do nome, sem acento');
set local role anon;
select is(public.vitrine_publica(current_setting('teste.slug')), null::jsonb, 'despublicado não aparece');
reset role;

select testes.entrar(testes.id('ana'));
select is(public.configurar_vitrine(testes.id('emp'), true, 'a_partir', 'Lotes a 5 minutos do centro.'), current_setting('teste.slug'), 'publicar mantém o endereço');
set local role anon;
select is((public.vitrine_publica(current_setting('teste.slug')) ->> 'a_partir_centavos')::bigint, 9000000::bigint,
  '"a partir de" é o menor preço entre os disponíveis');
select is((select count(*) from jsonb_array_elements(public.vitrine_publica(current_setting('teste.slug')) -> 'lotes') x where x ->> 'preco_centavos' is not null),
  0::bigint, 'modo "a partir de" não mostra preço por lote');
select is((select count(*) from jsonb_array_elements(public.vitrine_publica(current_setting('teste.slug')) -> 'lotes') x where (x ->> 'disponivel')::boolean),
  2::bigint, 'disponibilidade dos lotes');
reset role;

select testes.entrar(testes.id('ana'));
select public.configurar_vitrine(testes.id('emp'), true, 'lote', null);
set local role anon;
select is((select (x ->> 'preco_centavos')::bigint from jsonb_array_elements(public.vitrine_publica(current_setting('teste.slug')) -> 'lotes') x where x ->> 'numero' = '2'),
  9500000::bigint, 'modo por lote mostra o preço do lote disponível');
select is((select x ->> 'preco_centavos' from jsonb_array_elements(public.vitrine_publica(current_setting('teste.slug')) -> 'lotes') x where x ->> 'numero' = '3'),
  null, 'lote indisponível não mostra preço');

-- Interesse sem login
select throws_ok($$ select public.registrar_interesse(current_setting('teste.slug'), 'Paulo', null, null, null, null, true) $$,
  '23514', null, 'exige telefone ou e-mail');
select throws_ok($$ select public.registrar_interesse(current_setting('teste.slug'), 'Paulo', 'paulo@ex.com', null, null, null, false) $$,
  '23514', null, 'exige o consentimento');
select is(public.registrar_interesse(current_setting('teste.slug'), 'Paulo <Lima>', 'Paulo@Ex.com', '(62) 99999-0000',
  testes.id('lote2'), 'Quero visitar', true), 'ok', 'interesse registrado');
select is(public.registrar_interesse(current_setting('teste.slug'), 'Paulo <Lima>', 'paulo@ex.com', null, null, null, true), 'ok', 'clique repetido responde ok sem duplicar');
reset role;
select results_eq($$ select origem, email, observacao like '%Quadra A · Lote 2%', consentimento_em is not null from public.leads where tenant_id = testes.id('tenant') $$,
  $$ values ('site'::text, 'paulo@ex.com'::text, true, true) $$, 'vira um lead só, com o lote e o consentimento');
select ok((select bool_and(corpo #>> '{to,0}' = 'ana@vitrine.com.br' and corpo ->> 'html' like '%Paulo &lt;Lima&gt;%') from pg_temp.resend_chamadas)
  and (select count(*) from pg_temp.resend_chamadas) = 1, 'aviso por e-mail só para quem vende, com o texto escapado');

-- Contador não configura
select testes.entrar(testes.id('ciro'));
select public.aceitar_convite(current_setting('teste.cc'));
select throws_ok($$ select public.configurar_vitrine(testes.id('emp'), false, 'nenhum', null) $$, '42501', null, 'contador não configura a vitrine');

-- Portal do comprador
select testes.entrar(testes.id('ana'));
insert into public.compradores (tenant_id, nome, email) values (testes.id('tenant'), 'Joana', 'joana@vitrine.com.br');
select public.criar_convite_portal(testes.id('tenant'), 'comprador', (select id from public.compradores where tenant_id = testes.id('tenant')), 'joana@vitrine.com.br');
select testes.entrar(testes.id('joana'));
select public.aceitar_convites_pendentes();
select is(public.vitrines_do_portal() -> 0 ->> 'nome', 'Jardim São José', 'comprador vê os empreendimentos publicados da loteadora');

select * from finish();
rollback;
