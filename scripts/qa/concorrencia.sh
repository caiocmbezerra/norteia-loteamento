#!/usr/bin/env bash
# Auditoria de QA (docs/qa-norteia-loteamento, CONC-*): concorrência REAL no banco local.
# Para cada cenário, duas sessões psql independentes são liberadas ao mesmo tempo por um
# advisory lock (barreira), chamam a mesma RPC sobre o mesmo recurso e seguram a transação
# aberta 0,3 s antes do commit (janela de corrida). Depois o estado final é conferido.
#
# SEGURANÇA: só roda contra o Supabase local (contêiner supabase_db_*, 127.0.0.1). Grava dados
# sintéticos (e-mails @exemplo.test) e o esquema auxiliar `testes`; ao final, limpe com
# `pnpm exec supabase db reset`.
# Uso: scripts/qa/concorrencia.sh [repeticoes=10]
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
reps="${1:-10}"
db="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1 || true)"
[[ -n "$db" ]] || { echo "Banco local do Supabase não está rodando." >&2; exit 2; }
url_local="$(cd "$raiz" && pnpm exec supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d'"' -f2 || true)"
[[ -z "$url_local" || "$url_local" == *"127.0.0.1"* || "$url_local" == *"localhost"* ]] ||
  { echo "Recusado: o banco não é local ($url_local)." >&2; exit 2; }

sql() { docker exec -i "$db" psql -U postgres -X -At -v ON_ERROR_STOP=1 "$@"; }

# Esquema auxiliar persistente (só no banco local).
docker exec "$db" mkdir -p /tmp/qa
docker cp "$raiz/supabase/tests/auxiliares/testes.psql" "$db:/tmp/qa/testes.psql" >/dev/null
docker cp "$raiz/supabase/tests/auxiliares/qa_cenario.psql" "$db:/tmp/qa/qa_cenario.psql" >/dev/null
sql -q <<'EOF' >/dev/null
\i /tmp/qa/testes.psql
\i /tmp/qa/qa_cenario.psql
create table if not exists testes.qa_ids (rotulo text, nome text, valor uuid, primary key (rotulo, nome));
grant usage on schema testes to authenticated;
grant select on testes.qa_ids to authenticated;
EOF

NOMES="tenant spe emp l1 l2 l3 l4 l5 l6 l7 l8 l9 l10 l11 l12 comprador p0 p1 p2 p3 p4 rec0 rec1 cred res prop aprov socio mov perm permuta rep forn cf conta"

# Cria a loteadora sintética <rotulo> e grava os ids.
preparar() {
  local r="$1" uid
  uid="$(sql -c "select testes.criar_usuario('dona.$r@exemplo.test', 'Dona $r')" | tail -1)"
  local ins=""
  for n in $NOMES; do ins+="insert into testes.qa_ids values ('$r', '$n', testes.id('${r}_$n'));"; done
  sql -q >/dev/null <<EOF
begin;
select testes.guardar('dona', '$uid');
select testes.entrar('$uid');
select testes.qa_cenario('$r');
reset role;
$ins
insert into testes.qa_ids values ('$r', 'dona', '$uid');
-- recurso extra para participações: sócio 1 cai para 20% a partir de 01/07/2026, dois sócios novos
select testes.entrar('$uid');
select public.definir_participacao(testes.id('${r}_spe'), testes.id('${r}_socio'), 0.2, '2026-07-01', 'Redução (QA)');
insert into public.socios (tenant_id, nome) values (testes.id('${r}_tenant'), 'Sócio 2 QA'), (testes.id('${r}_tenant'), 'Sócio 3 QA');
reset role;
insert into testes.qa_ids select '$r', 's2', id from public.socios where tenant_id = testes.id('${r}_tenant') and nome = 'Sócio 2 QA';
insert into testes.qa_ids select '$r', 's3', id from public.socios where tenant_id = testes.id('${r}_tenant') and nome = 'Sócio 3 QA';
commit;
EOF
}

id() { sql -c "select valor from testes.qa_ids where rotulo = '$1' and nome = '$2'"; }

# Executa duas chamadas em paralelo, liberadas juntas. Saída: "ok" ou "erro: <mensagem>" por sessão.
corrida() {
  local r="$1" chamada1="$2" chamada2="$3" uid trava
  uid="$(id "$r" dona)"
  trava=$((RANDOM + 1000))
  sql -c "select pg_advisory_lock($trava); select pg_sleep(1.0);" >/dev/null &
  local seg=$!
  sleep 0.4
  for c in "$chamada1" "$chamada2"; do
    (
      saida="$(sql 2>&1 <<EOF
select pg_advisory_lock_shared($trava); select pg_advisory_unlock_shared($trava);
begin;
select testes.entrar('$uid');
select ($c)::text;
select pg_sleep(0.3);
commit;
EOF
)" && echo "ok" || echo "erro: $(echo "$saida" | grep -m1 ERROR | sed 's/.*ERROR: *//')"
    ) &
  done
  wait
  wait "$seg" 2>/dev/null || true
}

mkdir -p "$raiz/test-results"
resultado="$raiz/test-results/qa-concorrencia.txt"
: > "$resultado"
registrar() { echo "$1|$2|$3|$4" | tee -a "$resultado"; }

for ((k = 1; k <= reps; k++)); do
  r="c$(date +%s)$k"
  preparar "$r"
  T="testes.qa_ids where rotulo = '$r' and nome ="
  v() { echo "(select valor from $T '$1')"; }

  # CONC-001 — duas reservas do mesmo lote (RN-C02, INV-006)
  s="$(corrida "$r" "public.reservar_lote($(v l5), 'Cliente 1')" "public.reservar_lote($(v l5), 'Cliente 2')")"
  n="$(sql -c "select count(*) from public.reservas where lote_id = $(v l5) and situacao = 'ativa'")"
  registrar CONC-001 "$k" "$( [[ $n == 1 ]] && echo PASSOU || echo FALHOU)" "reservas ativas=$n; $(echo $s | tr '\n' ' ')"

  # CONC-002 — duas vendas do mesmo lote (RN-C02, INV-005)
  venda="jsonb_build_object('comprador_id', $(v comprador), 'data_venda', current_date, 'preco_centavos', 12000000, 'entrada_centavos', 12000000, 'parcelas', 0, 'juros_mensal', 0, 'sistema', 'sac')"
  s="$(corrida "$r" "public.vender_lote($(v l6), $venda)" "public.vender_lote($(v l6), $venda)")"
  n="$(sql -c "select count(*) from public.vendas where lote_id = $(v l6) and situacao = 'ativa'")"
  registrar CONC-002 "$k" "$( [[ $n == 1 ]] && echo PASSOU || echo FALHOU)" "vendas ativas=$n; $(echo $s | tr '\n' ' ')"

  # CONC-003 — duas baixas integrais da mesma parcela, avisos diferentes (RN-K06, INV-004)
  s="$(corrida "$r" "public.registrar_recebimento($(v p2), current_date, 2500000, p_referencia => 'x1')" "public.registrar_recebimento($(v p2), current_date, 2500000, p_referencia => 'x2')")"
  n="$(sql -c "select pago_centavos || '/' || (select count(*) from public.recebimentos where parcela_id = p.id and estornado_em is null) from public.parcelas p where id = $(v p2)")"
  registrar CONC-003 "$k" "$( [[ $n == 2500000/1 ]] && echo PASSOU || echo FALHOU)" "pago/recebimentos=$n; $(echo $s | tr '\n' ' ')"

  # CONC-004 — o mesmo aviso de pagamento chega duas vezes ao mesmo tempo (RN-K05, INV-008)
  s="$(corrida "$r" "public.registrar_recebimento($(v p3), current_date, 100000, p_referencia => 'aviso-dup')" "public.registrar_recebimento($(v p3), current_date, 100000, p_referencia => 'aviso-dup')")"
  n="$(sql -c "select pago_centavos || '/' || (select count(*) from public.recebimentos where parcela_id = p.id) from public.parcelas p where id = $(v p3)")"
  registrar CONC-004 "$k" "$( [[ $n == 100000/1 ]] && echo PASSOU || echo FALHOU)" "pago/recebimentos=$n; $(echo $s | tr '\n' ' ')"

  # CONC-005 — dois usos do saldo inteiro do mesmo crédito (INV-014)
  s="$(corrida "$r" "public.aplicar_credito($(v cred), $(v p4), 5000)" "public.aplicar_credito($(v cred), $(v p4), 5000)")"
  n="$(sql -c "select coalesce(sum(valor_centavos), 0) from public.usos_credito where credito_id = $(v cred)")"
  registrar CONC-005 "$k" "$( [[ $n == 5000 ]] && echo PASSOU || echo FALHOU)" "usado=$n de 5000; $(echo $s | tr '\n' ' ')"

  # CONC-006 — dois estornos do mesmo recebimento (INV-009)
  s="$(corrida "$r" "public.estornar_recebimento($(v rec1), 'Estorno 1 QA')" "public.estornar_recebimento($(v rec1), 'Estorno 2 QA')")"
  n="$(sql -c "select (select pago_centavos from public.parcelas where id = $(v p1)) || '/' || (select count(*) from public.auditoria where tabela = 'recebimentos' and registro_id = $(v rec1)::text and operacao = 'UPDATE')")"
  registrar CONC-006 "$k" "$( [[ $n == 0/1 ]] && echo PASSOU || echo FALHOU)" "pago p1/updates auditados=$n; $(echo $s | tr '\n' ' ')"

  # CONC-007 — duas decisões sobre a mesma aprovação de desconto
  s="$(corrida "$r" "public.decidir_aprovacao_desconto($(v aprov), true, 'Aprovado QA')" "public.decidir_aprovacao_desconto($(v aprov), false, 'Recusado QA')")"
  n="$(echo "$s" | grep -c '^ok' || true)"
  registrar CONC-007 "$k" "$( [[ $n == 1 ]] && echo PASSOU || echo FALHOU)" "decisões aceitas=$n; $(echo $s | tr '\n' ' ')"

  # CONC-008 — duas participações de 50% na mesma data com outro sócio em 20% (INV-010)
  s="$(corrida "$r" "public.definir_participacao($(v spe), $(v s2), 0.5, '2026-07-01', 'Entrada QA 2')" "public.definir_participacao($(v spe), $(v s3), 0.5, '2026-07-01', 'Entrada QA 3')")"
  n="$(sql -c "select sum(percentual) from public.participacoes where spe_id = $(v spe) and vigencia @> date '2026-07-01'")"
  registrar CONC-008 "$k" "$( awk "BEGIN{exit !($n <= 1)}" && echo PASSOU || echo FALHOU)" "soma em 01/07/2026=$n; $(echo $s | tr '\n' ' ')"

  # CONC-009 — duas medições de 60% acumulado no mesmo contrato de fornecedor (INV-016)
  s="$(corrida "$r" "public.registrar_medicao($(v cf), current_date, 0.6, current_date + 10, 'NF 1', null)" "public.registrar_medicao($(v cf), current_date, 0.6, current_date + 10, 'NF 2', null)")"
  n="$(sql -c "select count(*) || '/' || coalesce(sum(valor_centavos), 0) from public.medicoes where contrato_id = $(v cf)")"
  registrar CONC-009 "$k" "$( [[ $n == 1/600000 ]] && echo PASSOU || echo FALHOU)" "medições/valor=$n; $(echo $s | tr '\n' ' ')"

  # CONC-010 — reserva e venda do mesmo lote ao mesmo tempo (RN-C02)
  s="$(corrida "$r" "public.reservar_lote($(v l7), 'Cliente R')" "public.vender_lote($(v l7), $venda)")"
  n="$(sql -c "select l.status || '/' || (select count(*) from public.vendas where lote_id = l.id and situacao = 'ativa') || '/' || (select count(*) from public.reservas where lote_id = l.id and situacao = 'ativa') from public.lotes l where id = $(v l7)")"
  ok=FALHOU; [[ $n == vendido/1/0 || $n == reservado/0/1 ]] && ok=PASSOU
  registrar CONC-010 "$k" "$ok" "status/vendas/reservas=$n; $(echo $s | tr '\n' ' ')"
done

echo
echo "Resumo (cenário | passou | falhou):"
awk -F'|' '{p[$1]+=($3=="PASSOU"); f[$1]+=($3=="FALHOU")} END {for (c in p) print c " | " p[c] " | " f[c]}' "$resultado" | sort
