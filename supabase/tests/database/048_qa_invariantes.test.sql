-- Auditoria de QA (docs/qa-norteia-loteamento/05-invariantes.md): depois de um ciclo com venda,
-- contrato, recebimentos, estorno, crédito aplicado e devolvido, cobrança, permuta, sócios e
-- custos, todas as invariantes de auxiliares/qa_invariantes.psql valem (zero violações).
-- O mesmo SELECT roda, somente leitura, em produção (ver 07-relatorio-execucao.md).
begin;
\ir ../auxiliares/testes.psql
\ir ../auxiliares/qa_cenario.psql
\ir ../auxiliares/qa_invariantes.psql
select plan(3);

-- Linha de base: o banco local pode ter dados de outras execuções (ex.: demonstração do e2e).
create temp table qa_base as select * from testes.qa_invariantes();

select testes.guardar('dona_a', testes.criar_usuario('dona.a@exemplo.test', 'Dona A'));
select testes.guardar('dona_b', testes.criar_usuario('dona.b@exemplo.test', 'Dona B'));
select testes.entrar(testes.id('dona_a'));
select testes.qa_cenario('a');
-- Mais movimento na carteira de A
select public.estornar_recebimento(testes.id('a_rec1'), 'Estorno de teste QA');
select public.registrar_recebimento(testes.id('a_p1'), '2026-03-10', 2500000, 3750, 3083, p_referencia => 'qa-a-1b');
select public.aplicar_credito(testes.id('a_cred'), testes.id('a_p2'), 3000);
select public.devolver_credito(testes.id('a_cred'), current_date, 2000, 'Devolução do saldo (QA)');
select public.registrar_recebimento(testes.id('a_p2'), '2026-04-01', 2497000);
select public.registrar_recebimento(testes.id('a_p3'), '2026-05-01', 2500000);
select public.registrar_recebimento(testes.id('a_p4'), '2026-06-01', 2500000);
select testes.entrar(testes.id('dona_b'));
select testes.qa_cenario('b');

reset role;
create temp table qa_inv as select * from testes.qa_invariantes();

select is((select count(*) from qa_inv), 22::bigint, 'INV: as 22 invariantes automatizadas foram avaliadas');
select is_empty($$ select i.invariante || ' (' || i.violacoes - b.violacoes || ')' from qa_inv i join qa_base b using (invariante)
                    where i.violacoes > b.violacoes $$,
  'INV: nenhuma violação nova depois do ciclo completo em duas loteadoras');
select is((select pago_centavos || '/' || situacao from public.parcelas where id = testes.id('a_p2')), '2500000/paga',
  'INV-004/014: parcela paga com crédito (30,00) + dinheiro (24.970,00) fecha exatamente');

select * from finish();
rollback;
