#!/usr/bin/env bash
# Auditoria de QA (docs/qa-norteia-loteamento, CAR-*): carga sintética e medição de tempos no
# banco LOCAL. Cria uma loteadora com 5.000 lotes e importa 3.000 contratos com 67 parcelas cada
# (201.000 parcelas) pelo caminho real (importar_carteira, em lotes de 300 contratos), depois mede
# p50/p95 das leituras principais com o papel authenticated (RLS ligada) e roda EXPLAIN ANALYZE.
#
# SEGURANÇA: só roda no contêiner local do Supabase CLI. Dados sintéticos (@exemplo.test).
# Não cria índices nem altera o esquema. Ao final, limpe com `pnpm exec supabase db reset`.
# Uso: scripts/qa/carga.sh [repeticoes_por_consulta=15] [rotulo_de_carga_existente]
#   (com o 2º argumento, reaproveita a massa já criada e só mede)
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
reps="${1:-15}"
db="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1 || true)"
[[ -n "$db" ]] || { echo "Banco local do Supabase não está rodando." >&2; exit 2; }
sql() { docker exec -i "$db" psql -U postgres -X -At -v ON_ERROR_STOP=1 "$@"; }
mkdir -p "$raiz/test-results"
saida="$raiz/test-results/qa-carga.txt"
[[ -n "${2:-}" ]] && saida="$raiz/test-results/qa-carga-medicoes.txt"

docker exec "$db" mkdir -p /tmp/qa
docker cp "$raiz/supabase/tests/auxiliares/testes.psql" "$db:/tmp/qa/testes.psql" >/dev/null
docker cp "$raiz/supabase/tests/auxiliares/qa_invariantes.psql" "$db:/tmp/qa/qa_invariantes.psql" >/dev/null
sql -q -c '\i /tmp/qa/testes.psql' -c '\i /tmp/qa/qa_invariantes.psql' -c 'grant usage on schema testes to authenticated' >/dev/null

r="${2:-}"
if [[ -z "$r" ]]; then
r="carga$(date +%s)"
uid="$(sql -c "select testes.criar_usuario('dona.$r@exemplo.test', 'Dona carga')" | tail -1)"
echo "== Preparação ($r)" | tee "$saida"

inicio=$(date +%s.%N)
sql -q <<EOF
begin;
select testes.entrar('$uid');
select set_config('qa.tenant', public.criar_tenant('Loteadora carga $r')::text, true);
reset role;
-- Plano sem limite de lotes (preparação como dono do banco; o cliente não pode fazer isto — ver A-08).
update public.tenants set plano_id = 'empresarial' where id = current_setting('qa.tenant')::uuid;
select testes.entrar('$uid');
select set_config('qa.emp', public.criar_empreendimento_com_lotes(current_setting('qa.tenant')::uuid,
  (select id from public.spes where tenant_id = current_setting('qa.tenant')::uuid), 'Residencial Carga', 'Goiânia', 'GO', '2024-01-01',
  (select jsonb_agg(jsonb_build_object('quadra', 'Q' || lpad((n / 100)::text, 2, '0'), 'numero', (n % 100 + 1)::text,
          'area_m2', (250 + n % 200)::text, 'preco_base_centavos', 9000000 + (n % 50) * 10000)) from generate_series(0, 4999) n))::text, true);
update public.empreendimentos set situacao = 'em_vendas', data_registro = '2024-01-15' where id = current_setting('qa.emp')::uuid;
reset role;
create table if not exists testes.qa_carga (rotulo text primary key, usuario uuid, tenant uuid, empreendimento uuid);
insert into testes.qa_carga values ('$r', '$uid', current_setting('qa.tenant')::uuid, current_setting('qa.emp')::uuid);
commit;
EOF
echo "5.000 lotes: $(echo "$(date +%s.%N) - $inicio" | bc) s" | tee -a "$saida"

emp="$(sql -c "select empreendimento from testes.qa_carga where rotulo = '$r'")"
# 3.000 contratos × (entrada + 66 parcelas) = 201.000 parcelas, em 10 importações de 300.
# Vendas mensais desde jan/2024; parcelas vencidas pagas, exceto 1 em cada 12 contratos (atraso)
# e pagamentos parciais em 1 em cada 20.
inicio=$(date +%s.%N)
for b in $(seq 0 9); do
  sql -q <<EOF
begin;
select testes.entrar('$uid');
with j as (
  select jsonb_agg(jsonb_build_object(
    'ref', 'C' || c, 'quadra', 'Q' || lpad((c / 100)::text, 2, '0'), 'lote', (c % 100 + 1)::text,
    'comprador', jsonb_build_object('nome', 'Comprador sintético ' || c, 'email', 'comprador' || c || '@exemplo.test'),
    'data_venda', (date '2024-01-05' + ((c % 30) || ' months')::interval)::date, 'preco', 9000000, 'indice', 'IPCA',
    'parcelas', (select jsonb_agg(jsonb_build_object(
        'numero', k,
        'vencimento', (date '2024-01-05' + (((c % 30) + k) || ' months')::interval)::date,
        'valor', case when k = 0 then 900000 when k = 66 then 122745 else 122727 end,
        'pago', case when (date '2024-01-05' + (((c % 30) + k) || ' months')::interval)::date >= current_date then 0
                     when c % 12 = 0 and k > 3 then 0
                     when c % 20 = 0 and k = 2 then 50000
                     else case when k = 0 then 900000 when k = 66 then 122745 else 122727 end end) order by k)
      from generate_series(0, 66) k)))
  as d from generate_series($((b * 300)), $((b * 300 + 299))) c)
select public.importar_carteira('$emp', 'Carga QA', 'carga-$b.csv',
  (select sum(greatest((x ->> 'valor')::bigint - (x ->> 'pago')::bigint, 0)) from j, jsonb_array_elements(j.d) c, jsonb_array_elements(c -> 'parcelas') x)::bigint,
  (select d from j));
commit;
EOF
  echo "importação $((b + 1))/10 concluída"
done
fim=$(date +%s.%N)
echo "3.000 contratos / 201.000 parcelas (10 importações): $(echo "$fim - $inicio" | bc) s" | tee -a "$saida"
fi
uid="$(sql -c "select usuario from testes.qa_carga where rotulo = '$r'")"
emp="$(sql -c "select empreendimento from testes.qa_carga where rotulo = '$r'")"
tenant="$(sql -c "select tenant from testes.qa_carga where rotulo = '$r'")"
spe="$(sql -c "select id from public.spes where tenant_id = '$tenant'")"
sql -c "select 'volume: lotes=' || (select count(*) from public.lotes where tenant_id = '$tenant') || ' contratos=' || (select count(*) from public.contratos where tenant_id = '$tenant') || ' parcelas=' || (select count(*) from public.parcelas where tenant_id = '$tenant') || ' recebimentos=' || (select count(*) from public.recebimentos where tenant_id = '$tenant')" | tee -a "$saida"

sql -q -c "analyze"

# Mede uma consulta N vezes como a dona (authenticated, RLS ligada): p50, p95, máx em ms.
medir() {
  local nome="$1" consulta="$2"
  sql <<EOF | tee -a "$saida"
begin;
select testes.entrar('$uid');
do \$\$
declare t0 timestamptz; ms numeric[] := '{}'; d numeric;
begin
  for i in 1..$reps loop
    t0 := clock_timestamp();
    perform sum(length(x::text)) from ($consulta) x;
    ms := ms || extract(epoch from clock_timestamp() - t0) * 1000;
  end loop;
  select percentile_cont(0.5) within group (order by v) into d from unnest(ms) v;
  raise notice '%', format('%-42s p50 %8s ms | p95 %8s ms | máx %8s ms', '$nome', round(d, 1),
    round((select percentile_cont(0.95) within group (order by v) from unnest(ms) v)::numeric, 1),
    round((select max(v) from unnest(ms) v)::numeric, 1));
end \$\$;
rollback;
EOF
}
echo "== Leituras com RLS ($reps execuções cada)" | tee -a "$saida"
exec 3>&1
{
medir "CAR-001 lista de lotes (1ª página, 50)" "select * from public.lotes where empreendimento_id = '$emp' order by quadra_id, numero limit 50"
medir "CAR-002 busca de lote por número" "select * from public.lotes where empreendimento_id = '$emp' and numero = '57'"
medir "CAR-003 mapa de lotes completo (5.000)" "select id, status, numero from public.lotes where empreendimento_id = '$emp'"
medir "CAR-004 carteira: parcelas vencidas em aberto" "select p.* from public.parcelas p join public.contratos c on c.id = p.contrato_id where c.empreendimento_id = '$emp' and p.situacao = 'aberta' and p.vencimento < current_date"
medir "CAR-005 saldo a receber por contrato" "select contrato_id, sum(valor_centavos - pago_centavos) from public.parcelas where situacao = 'aberta' group by contrato_id"
medir "CAR-006 recebimentos do mês" "select * from public.recebimentos where data_pagamento >= date_trunc('month', current_date)"
medir "CAR-007 extrato de um contrato" "select * from public.parcelas where contrato_id = (select id from public.contratos where tenant_id = '$tenant' order by numero limit 1) order by numero"
} 2>&1 | grep NOTICE | sed 's/.*NOTICE: *//' | tee -a "$saida"

echo "== RPCs de relatório e consulta da tela da carteira (1 execução; tempo limite de 8 s do papel authenticated)" | tee -a "$saida"
umavez() {
  local nome="$1" consulta="$2" out
  out="$(sql <<EOF 2>&1
begin;
select testes.entrar('$uid');
set local statement_timeout = '8s';
\\timing on
select length(($consulta)::text);
rollback;
EOF
)" || true
  echo "$nome: $(echo "$out" | grep -E '^Time|ERROR' | head -1)" | tee -a "$saida"
}
umavez "CAR-008 painel_consolidado" "public.painel_consolidado('$tenant', current_date)"
umavez "CAR-009 inadimplencia_historico (1 data)" "public.inadimplencia_historico('$emp', array[current_date])"
umavez "CAR-010 eventos_contabeis do ano" "public.eventos_contabeis('$spe', date_trunc('year', current_date)::date, current_date)"
umavez "CAR-011 dados_dimob do ano anterior" "public.dados_dimob('$spe', extract(year from current_date)::int - 1)"
umavez "CAR-014 tela da carteira: recebimentos do mês" "(select count(*) from (select r.valor_centavos from public.recebimentos r join public.parcelas p on p.id = r.parcela_id join public.contratos c on c.id = p.contrato_id where c.empreendimento_id = '$emp' and r.estornado_em is null and r.data_pagamento >= date_trunc('month', current_date) order by r.id limit 1000) x)"

echo "== Escrita: 50 baixas de parcela (registrar_recebimento) com RLS" | tee -a "$saida"
sql <<EOF 2>&1 | grep NOTICE | sed 's/.*NOTICE: *//' | tee -a "$saida"
begin;
select testes.entrar('$uid');
do \$\$
declare t0 timestamptz; ms numeric[] := '{}'; p record;
begin
  for p in select pa.id, pa.valor_centavos - pa.pago_centavos as saldo from public.parcelas pa
            where pa.tenant_id = '$tenant' and pa.situacao = 'aberta' and pa.vencimento < current_date limit 50 loop
    t0 := clock_timestamp();
    perform public.registrar_recebimento(p.id, current_date, p.saldo);
    ms := ms || extract(epoch from clock_timestamp() - t0) * 1000;
  end loop;
  raise notice '%', format('%-42s p50 %8s ms | p95 %8s ms | máx %8s ms', 'CAR-012 registrar_recebimento',
    round((select percentile_cont(0.5) within group (order by v) from unnest(ms) v)::numeric, 1),
    round((select percentile_cont(0.95) within group (order by v) from unnest(ms) v)::numeric, 1),
    round((select max(v) from unnest(ms) v)::numeric, 1));
end \$\$;
rollback;
EOF

echo "== Invariantes sobre a massa de carga" | tee -a "$saida"
inicio=$(date +%s.%N)
sql -c "select invariante || ' ' || violacoes from testes.qa_invariantes() where violacoes > 0" | tee -a "$saida"
echo "CAR-013 invariantes (banco inteiro): $(echo "$(date +%s.%N) - $inicio" | bc) s" | tee -a "$saida"

echo "== EXPLAIN ANALYZE (RLS) — carteira vencida" | tee -a "$saida"
sql <<EOF | tee -a "$saida"
begin;
select testes.entrar('$uid');
explain (analyze, buffers, costs off, summary on)
select p.id from public.parcelas p join public.contratos c on c.id = p.contrato_id
 where c.empreendimento_id = '$emp' and p.situacao = 'aberta' and p.vencimento < current_date;
rollback;
EOF
echo "Resultado salvo em $saida"
