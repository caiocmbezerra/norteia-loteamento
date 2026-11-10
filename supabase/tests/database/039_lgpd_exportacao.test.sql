-- L5: exportação dos dados do comprador (LGPD), pelo próprio titular ou pelo dono, com registro.
begin;
\ir ../auxiliares/testes.psql
select plan(8);

select testes.guardar('ana', testes.criar_usuario('ana@lgpd.com.br', 'Ana (dona)'));
select testes.guardar('joana', testes.criar_usuario('joana@lgpd.com.br', 'Joana (compradora)'));
select testes.guardar('intrusa', testes.criar_usuario('intrusa@lgpd.com.br', 'Intrusa'));
select testes.guardar('gil', testes.criar_usuario('gil@lgpd.com.br', 'Gil (gestor comercial)'));
select testes.entrar(testes.id('ana'));
select testes.guardar('tenant', public.criar_tenant('Loteadora LGPD'));
select testes.guardar('spe', (select id from public.spes where tenant_id = testes.id('tenant')));
select testes.guardar('emp', public.criar_empreendimento_com_lotes(testes.id('tenant'), testes.id('spe'), 'Jardim LGPD', 'Goiânia', 'GO', '2025-01-01',
  '[{"quadra":"A","numero":"1","area_m2":"300","preco_base_centavos":100000}]'::jsonb));
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2025-01-02' where id = testes.id('emp');
insert into public.compradores (tenant_id, nome, cpf, email) values (testes.id('tenant'), 'Joana Compradora', '52998224725', 'joana@lgpd.com.br');
select testes.guardar('comprador', (select id from public.compradores where tenant_id = testes.id('tenant')));
select testes.guardar('venda', public.vender_lote((select id from public.lotes where empreendimento_id = testes.id('emp')),
  json_build_object('comprador_id', testes.id('comprador'), 'data_venda', current_date - 1,
    'preco_centavos', 100000, 'entrada_centavos', 10000, 'parcelas', 1, 'juros_mensal', 0, 'sistema', 'sac', 'primeira_parcela_em', current_date + 29)::jsonb));
select testes.guardar('contrato', public.criar_contrato(testes.id('venda'), json_build_array(
  json_build_object('numero', 0, 'vencimento', current_date - 1, 'valor_centavos', 10000, 'amortizacao_centavos', 10000, 'juros_centavos', 0),
  json_build_object('numero', 1, 'vencimento', current_date + 29, 'valor_centavos', 90000, 'amortizacao_centavos', 90000, 'juros_centavos', 0))::jsonb));
select set_config('teste.convite', public.criar_convite_portal(testes.id('tenant'), 'comprador', testes.id('comprador'), 'joana@lgpd.com.br'), true);
select set_config('teste.cg', public.criar_convite(testes.id('tenant'), 'gil@lgpd.com.br', 'comercial_gestor'), true);

-- Titular
select testes.entrar(testes.id('joana'));
select public.aceitar_convite_portal(current_setting('teste.convite'));
select public.abrir_chamado(testes.id('contrato'), 'Dúvida', 'outro', 'Olá');
select results_eq($$ select d #>> '{cadastro,cpf}', jsonb_array_length(d -> 'contratos'), jsonb_array_length(d #> '{contratos,0,parcelas}'),
                            d #>> '{contratos,0,chamados,0,assunto}'
                       from (select public.dados_titular(testes.id('comprador')) as d) x $$,
  $$ values ('52998224725'::text, 1, 2, 'Dúvida'::text) $$, 'titular exporta cadastro, contrato, parcelas e chamados');

select is(public.dados_titular_do_contrato(testes.id('contrato')) #>> '{cadastro,nome}', 'Joana Compradora', 'titular exporta também pelo contrato');

-- Dona atende o pedido
select testes.entrar(testes.id('ana'));
select is(public.dados_titular(testes.id('comprador')) #>> '{cadastro,nome}', 'Joana Compradora', 'dona exporta os dados do titular');
select results_eq($$ select pelo_titular from public.exportacoes_titular where comprador_id = testes.id('comprador') order by criado_em, pelo_titular desc $$,
  $$ values (true), (true), (false) $$, 'cada exportação fica registrada');
select throws_ok($$ insert into public.exportacoes_titular (tenant_id, comprador_id, pelo_titular) values (testes.id('tenant'), testes.id('comprador'), true) $$,
  '42501', null, 'registro só pela função');

-- Gestor comercial não exporta; outra pessoa também não
select testes.entrar(testes.id('gil'));
select public.aceitar_convite(current_setting('teste.cg'));
select throws_ok($$ select public.dados_titular(testes.id('comprador')) $$, '42501', null, 'gestão comercial não exporta dados do titular');
select is_empty($$ select 1 from public.exportacoes_titular $$, 'gestão comercial não vê o registro de exportações');
select testes.entrar(testes.id('intrusa'));
select throws_ok($$ select public.dados_titular(testes.id('comprador')) $$, '42501', null, 'outra pessoa não exporta');

select * from finish();
rollback;
