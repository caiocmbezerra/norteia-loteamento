#!/usr/bin/env bash
# Auditoria de QA: roda as invariantes (supabase/tests/auxiliares/qa_invariantes.psql) em
# qualquer banco, numa transação SOMENTE LEITURA. Nada é gravado.
# Uso: scripts/qa/invariantes.sh "postgresql://..."   (padrão: banco local do Supabase CLI)
set -euo pipefail
raiz="$(cd "$(dirname "$0")/../.." && pwd)"
url="${1:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
corpo="$(awk '/^as \$invariantes\$/{f=1;next} /^\$invariantes\$;/{f=0} f' "$raiz/supabase/tests/auxiliares/qa_invariantes.psql")"
if command -v psql >/dev/null 2>&1; then
  printf 'begin transaction read only;\n%s;\nrollback;\n' "$corpo" | psql "$url" -X -v ON_ERROR_STOP=1 -P pager=off
else
  # Sem psql local: usa o do contêiner do Supabase CLI (só para o banco local).
  printf 'begin transaction read only;\n%s;\nrollback;\n' "$corpo" |
    docker exec -i "$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)" psql -U postgres -X -v ON_ERROR_STOP=1 -P pager=off
fi
