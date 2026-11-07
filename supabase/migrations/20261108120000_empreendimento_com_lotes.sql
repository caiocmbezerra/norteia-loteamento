-- Fase 1b: cria empreendimento, quadras e lotes numa única transação (tudo ou nada).
-- Roda com os direitos de quem chama (security invoker): a RLS e o limite do plano valem.

create function public.criar_empreendimento_com_lotes(
  p_tenant uuid,
  p_spe uuid,
  p_nome text,
  p_municipio text,
  p_uf text,
  p_data_base date,
  p_lotes jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_empreendimento uuid;
begin
  if jsonb_typeof(p_lotes) <> 'array' or jsonb_array_length(p_lotes) = 0 then
    raise exception 'Informe ao menos um lote.' using errcode = 'check_violation';
  end if;

  insert into public.empreendimentos (tenant_id, spe_id, nome, municipio, uf, data_base)
  values (p_tenant, p_spe, trim(p_nome), nullif(trim(p_municipio), ''), p_uf, p_data_base)
  returning id into v_empreendimento;

  insert into public.quadras (tenant_id, empreendimento_id, codigo)
  select distinct p_tenant, v_empreendimento, l ->> 'quadra'
    from jsonb_array_elements(p_lotes) l;

  insert into public.lotes (tenant_id, empreendimento_id, quadra_id, numero, area_m2, preco_base_centavos)
  select p_tenant, v_empreendimento, q.id, l ->> 'numero', (l ->> 'area_m2')::numeric,
         (l ->> 'preco_base_centavos')::bigint
    from jsonb_array_elements(p_lotes) l
    join public.quadras q on q.empreendimento_id = v_empreendimento and q.codigo = l ->> 'quadra';

  return v_empreendimento;
end;
$$;

revoke execute on function public.criar_empreendimento_com_lotes(uuid, uuid, text, text, text, date, jsonb) from public, anon;
grant execute on function public.criar_empreendimento_com_lotes(uuid, uuid, text, text, text, date, jsonb) to authenticated;

-- Relação direta lote → empreendimento (consultas embutidas e integridade explícita).
-- Restrict: empreendimento com lotes não é apagado por engano.
alter table public.lotes
  add constraint lotes_empreendimento_fkey
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict;
