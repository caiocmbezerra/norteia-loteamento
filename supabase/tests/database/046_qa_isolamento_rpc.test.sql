-- Auditoria de QA (docs/qa-norteia-loteamento, SEG-RPC-*): varredura de TODAS as funções de
-- public executáveis por authenticated/anon, chamadas com ids reais de outra loteadora, e
-- matriz papel × função. Complementa 001 (tabelas) com a carteira, o comercial, sócios,
-- permutas e custos preenchidos (INV-012, INV-018).
begin;
\ir ../auxiliares/testes.psql
\ir ../auxiliares/qa_cenario.psql
select plan(28);

select testes.guardar('dona_a', testes.criar_usuario('dona.a@exemplo.test', 'Dona A'));
select testes.guardar('dona_b', testes.criar_usuario('dona.b@exemplo.test', 'Dona B'));
select testes.guardar('intruso', testes.criar_usuario('intruso@exemplo.test', 'Sem loteadora'));
select testes.entrar(testes.id('dona_a'));
select testes.qa_cenario('a');
select testes.entrar(testes.id('dona_b'));
select testes.qa_cenario('b');

-- Impressão digital de A antes de qualquer tentativa.
reset role;
create temp table qa_antes as select * from testes.qa_impressao(testes.id('a_tenant'));
create temp table qa_varredura (quem text, funcao text, desfecho text, estado text, retorno text);
grant select, insert on qa_antes, qa_varredura to authenticated, anon;

-- Marcas que não podem aparecer no retorno de quem não é de A.
create temp table qa_marcas as select unnest(array[
  testes.id('a_tenant')::text, testes.id('a_contrato')::text, testes.id('a_comprador')::text, testes.id('a_venda')::text,
  testes.id('a_emp')::text, testes.id('a_l1')::text, 'Comprador QA a', 'Residencial QA a', 'Sócio QA a', 'Permutante QA a']) marca;
grant select on qa_marcas to authenticated, anon;

-- Funções que qualquer usuário executa sem depender dos ids passados (só leem os próprios dados).
create temp table qa_neutras as select unnest(array['aceitar_convites_pendentes', 'definir_meus_lembretes', 'meu_portal',
  'meus_lembretes', 'parametro_vigente', 'preco_tabela', 'vitrine_publica', 'vitrines_do_portal', 'webhook_asaas']) funcao;
grant select on qa_neutras to authenticated, anon;

-- ── SEG-RPC-001..006: dona de outra loteadora (todas as permissões, mas em B) ──
select testes.entrar(testes.id('dona_b'));
insert into qa_varredura select 'dona_b', * from testes.qa_varrer_rpcs('a', array['descadastrar_lembretes']);
select is((select count(*) from qa_varredura where quem = 'dona_b'), 73::bigint,
  'SEG-RPC-001: as 73 funções (menos o descadastro por token) foram chamadas com ids de A');
select set_eq($$ select funcao from qa_varredura where quem = 'dona_b' and desfecho = 'executou' $$,
  $$ select funcao from qa_neutras $$,
  'SEG-RPC-002: com ids de A, a dona de B só executa as funções neutras; todas as demais recusam');
select is_empty($$ select v.funcao from qa_varredura v join qa_marcas m on v.retorno like '%' || m.marca || '%'
                    where v.quem = 'dona_b' and v.desfecho = 'executou' $$,
  'SEG-RPC-003: nenhum retorno traz id ou nome de A');
select is((select retorno from qa_varredura where quem = 'dona_b' and funcao = 'parametro_vigente'), '0.02',
  'SEG-RPC-004: parametro_vigente com o tenant de A devolve a sugestão da plataforma, nunca o valor próprio de A (0.015)');
select is((select retorno from qa_varredura where quem = 'dona_b' and funcao = 'webhook_asaas'), 'nao_autorizado',
  'SEG-RPC-005: webhook com token errado não é autorizado');
select is_empty($$ select funcao from qa_varredura where quem = 'dona_b' and desfecho = 'recusou' and estado not in ('42501', '22023', '23514', 'P0002') $$,
  'SEG-RPC-006: recusas são de permissão ou validação (sem erro interno)');

-- Duas funções validam a entrada antes da permissão: chamadas válidas também são recusadas.
select throws_ok($$ select public.criar_empreendimento_com_lotes(testes.id('a_tenant'), testes.id('a_spe'), 'Intruso', 'Goiânia', 'GO',
  '2026-01-01', '[{"quadra":"Z","numero":"1","area_m2":"300","preco_base_centavos":1}]') $$, '42501', null,
  'SEG-RPC-007: dona de B não cria empreendimento em A (chamada válida)');
select throws_ok($$ select public.ratear_despesa(jsonb_build_object('descricao', 'Rateio intruso', 'valor_centavos', 1000,
  'vencimento', current_date, 'centro_codigo', 'administracao', 'criterio', 'lotes'),
  array[testes.id('a_emp'), testes.id('b_emp')]) $$, '42501', null,
  'SEG-RPC-008: rateio que inclui empreendimento de A é recusado');

-- ── SEG-RPC-009..011: usuário autenticado sem loteadora ──
select testes.entrar(testes.id('intruso'));
insert into qa_varredura select 'intruso', * from testes.qa_varrer_rpcs('a', array['descadastrar_lembretes', 'criar_tenant']);
select set_eq($$ select funcao from qa_varredura where quem = 'intruso' and desfecho = 'executou' $$,
  $$ select funcao from qa_neutras $$, 'SEG-RPC-009: usuário sem loteadora só executa as funções neutras');
select is_empty($$ select v.funcao from qa_varredura v join qa_marcas m on v.retorno like '%' || m.marca || '%'
                    where v.quem = 'intruso' and v.desfecho = 'executou' $$,
  'SEG-RPC-010: nenhum retorno traz dados de A');
select is((select retorno from qa_varredura where quem = 'intruso' and funcao = 'meu_portal'),
  '{"permutas": [], "contratos": [], "sociedades": []}', 'SEG-RPC-011: portal de quem não tem vínculo vem vazio');

-- ── SEG-RPC-012..014: anônimo ──
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
insert into qa_varredura select 'anon', * from testes.qa_varrer_rpcs('a', array['descadastrar_lembretes']);
select set_eq($$ select funcao from qa_varredura where quem = 'anon' $$,
  array['registrar_interesse', 'vitrine_publica', 'webhook_asaas'],
  'SEG-RPC-012: anônimo só alcança as funções públicas previstas (vitrine, interesse, webhook; descadastro à parte)');
select is((select estado from qa_varredura where quem = 'anon' and funcao = 'registrar_interesse'), 'P0002',
  'SEG-RPC-013: interesse em empreendimento sem vitrine publicada é recusado');
select is((select coalesce(retorno, '') from qa_varredura where quem = 'anon' and funcao = 'vitrine_publica'), '',
  'SEG-RPC-014: vitrine não publicada não aparece');

-- ── SEG-RPC-015: nada mudou em A ──
reset role;
select is_empty($$ select i.tabela from testes.qa_impressao(testes.id('a_tenant')) i join qa_antes a using (tabela) where i.hash <> a.hash $$,
  'SEG-RPC-015: depois de 200+ chamadas de B, do usuário sem loteadora e do anônimo, nenhuma linha de A mudou');

-- ── SEG-RPC-016..017: descadastro por token é capacidade por desenho (link do e-mail) ──
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$ select public.descadastrar_lembretes(gen_random_uuid()) $$, null, 'Link inválido.',
  'SEG-RPC-016: token desconhecido não descadastra ninguém');
reset role;
select is_empty($$ select i.tabela from testes.qa_impressao(testes.id('a_tenant')) i join qa_antes a using (tabela) where i.hash <> a.hash $$,
  'SEG-RPC-017: e não altera dados');

-- ── SEG-RPC-018..024: matriz papel × função dentro da própria loteadora (regressão de permissões) ──
create temp table qa_matriz (papel text, funcao text);
grant select, insert on qa_matriz to authenticated;
create function pg_temp.qa_matriz_do_papel(p_papel public.papel) returns void language plpgsql as $$
declare
  v_email text := 'membro.' || p_papel || '@exemplo.test';
  v_uid uuid;
begin
  perform testes.entrar(testes.id('dona_a'));
  perform set_config('teste.cv', public.criar_convite(testes.id('a_tenant'), v_email, p_papel), true);
  execute 'reset role';
  v_uid := testes.criar_usuario(v_email, 'Membro ' || p_papel);
  perform testes.entrar(v_uid);
  perform public.aceitar_convite(current_setting('teste.cv'));
  insert into qa_matriz select p_papel::text, funcao from testes.qa_varrer_rpcs('a', array['descadastrar_lembretes'])
   where desfecho = 'executou' and funcao not in (select funcao from qa_neutras);
  execute 'reset role';
end $$;
select pg_temp.qa_matriz_do_papel(p) from unnest(array['corretor', 'contador', 'socio_leitura', 'engenharia',
  'comercial_gestor', 'financeiro']::public.papel[]) p;

select set_eq($$ select funcao from qa_matriz where papel = 'corretor' $$, array['criar_proposta'],
  'SEG-RPC-018: corretor só faz proposta (RN-C07: sem carteira, sem financeiro)');
select set_eq($$ select funcao from qa_matriz where papel = 'contador' $$,
  array['dados_dimob', 'documento_portal', 'eventos_contabeis', 'eventos_permuta', 'inadimplencia_historico',
        'informe_pagamentos', 'obra_portal', 'painel_consolidado'],
  'SEG-RPC-019: contador só lê (DIMOB, contábil, carteira) — nenhuma escrita');
select set_eq($$ select funcao from qa_matriz where papel = 'socio_leitura' $$,
  array['documento_portal', 'eventos_permuta', 'inadimplencia_historico', 'informe_pagamentos', 'obra_portal', 'painel_consolidado'],
  'SEG-RPC-020: sócio (leitura) só lê');
select set_eq($$ select funcao from qa_matriz where papel = 'engenharia' $$,
  array['configurar_vitrine', 'documento_portal', 'eventos_permuta', 'inadimplencia_historico', 'informe_pagamentos',
        'obra_portal', 'painel_consolidado'],
  'SEG-RPC-021: engenharia não mexe em carteira nem em vendas');
select set_eq($$ select funcao from qa_matriz where papel = 'comercial_gestor' $$,
  array['cancelar_proposta', 'cancelar_reserva', 'configurar_vitrine', 'criar_convite_portal', 'criar_proposta',
        'documento_portal', 'enviar_convite_portal', 'inadimplencia_historico', 'informe_pagamentos', 'obra_portal',
        'publicar_tabela_preco', 'solicitar_aprovacao_desconto', 'vender_lote'],
  'SEG-RPC-022: gestor comercial vende e gere propostas, mas não recebe nem estorna');
select set_eq($$ select funcao from qa_matriz where papel = 'financeiro' $$,
  array['aplicar_credito', 'criar_convite_portal', 'criar_permuta', 'dados_dimob', 'definir_parametro', 'devolver_credito',
        'documento_portal', 'enviar_convite_portal', 'estornar_recebimento', 'estornar_repasse', 'eventos_contabeis',
        'eventos_permuta', 'inadimplencia_historico', 'informe_pagamentos', 'obra_portal', 'painel_consolidado',
        'reajustar_contrato', 'registrar_credito', 'registrar_recebimento', 'registrar_repasse'],
  'SEG-RPC-023: financeiro recebe, estorna e reajusta, mas não vende nem decide descontos');
select is_empty($$ select papel from qa_matriz where papel <> 'financeiro'
                    and funcao in ('registrar_recebimento', 'estornar_recebimento', 'aplicar_credito', 'devolver_credito',
                                   'registrar_credito', 'reajustar_contrato', 'executar_distrato', 'renegociar_contrato') $$,
  'SEG-RPC-024: só o financeiro (e o dono) mexe em dinheiro da carteira');

-- ── SEG-RPC-025..027: membro das duas loteadoras não move registro entre elas ──
select testes.entrar(testes.id('dona_b'));
select set_config('teste.cvb', public.criar_convite(testes.id('b_tenant'), 'dona.a@exemplo.test', 'dono'), true);
select testes.entrar(testes.id('dona_a'));
select public.aceitar_convite(current_setting('teste.cvb'));
insert into public.fornecedores (tenant_id, nome) values (testes.id('a_tenant'), 'Fornecedor solto QA');
select throws_ok($$ update public.fornecedores set tenant_id = testes.id('b_tenant') where nome = 'Fornecedor solto QA' $$,
  '23514', 'Um registro não pode mudar de cliente (tenant).', 'SEG-RPC-025: tenant_id é imutável mesmo para quem é das duas');
select throws_ok($$ update public.compradores set tenant_id = testes.id('b_tenant') where id = testes.id('a_comprador') $$,
  '23514', null, 'SEG-RPC-026: comprador com contrato não muda de loteadora');
select throws_ok($$ select public.vender_lote(testes.id('b_l5'), jsonb_build_object('comprador_id', testes.id('a_comprador'),
  'data_venda', current_date, 'preco_centavos', 12000000, 'entrada_centavos', 12000000, 'parcelas', 0, 'juros_mensal', 0, 'sistema', 'sac')) $$,
  '23503', null, 'SEG-RPC-027: venda em B com comprador de A é recusada (chave composta tenant_id)');
select throws_ok($$ select public.ratear_despesa(jsonb_build_object('descricao', 'Rateio entre loteadoras', 'valor_centavos', 1000,
  'vencimento', current_date, 'centro_codigo', 'administracao', 'criterio', 'lotes'),
  array[testes.id('a_emp'), testes.id('b_emp')]) $$, '42501', null,
  'SEG-RPC-028: nem quem é dona das duas rateia uma despesa entre loteadoras diferentes');

select * from finish();
rollback;
