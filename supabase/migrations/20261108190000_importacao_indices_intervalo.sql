-- Correção: a API do SGS aceita no máximo 20 valores em "ultimos/N". A importação passa a
-- usar intervalo de datas (5 anos), o que também carrega o histórico de contratos antigos.

create or replace function public.importar_indices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_resp extensions.http_response;
  v_total integer := 0;
  v_inicio text := to_char(date_trunc('month', current_date) - interval '5 years', 'DD/MM/YYYY');
  v_fim text := to_char(current_date, 'DD/MM/YYYY');
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');
  for r in select codigo, serie_sgs from public.indices_economicos where serie_sgs is not null order by codigo loop
    begin
      v_resp := extensions.http_get(format(
        'https://api.bcb.gov.br/dados/serie/bcdata.sgs.%s/dados?formato=json&dataInicial=%s&dataFinal=%s',
        r.serie_sgs, v_inicio, v_fim));
      if v_resp.status = 200 then
        v_total := v_total + privado.gravar_serie_indice(r.codigo, v_resp.content::jsonb);
      else
        raise warning 'Importação do índice %: HTTP % — %', r.codigo, v_resp.status, left(v_resp.content, 200);
      end if;
    exception when others then
      raise warning 'Importação do índice % falhou: %', r.codigo, sqlerrm;
    end;
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.importar_indices() from public, anon, authenticated;
grant execute on function public.importar_indices() to service_role;
