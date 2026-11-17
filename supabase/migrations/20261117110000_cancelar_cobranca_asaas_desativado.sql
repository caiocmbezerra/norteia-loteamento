-- Cancelar cobrança com o Asaas desativado (regra implícita encontrada na auditoria de QA, D-126).
-- Antes: desativar_asaas marca a integração como inativa e cancelar_cobranca só falava com o
-- Asaas pela integração ATIVA — a cobrança pendente não era mais cancelável e o contrato ficava
-- travado (renegociação, distrato, cessão, troca de lote e antecipação exigem nenhuma pendente).
-- Agora:
--   1. o cancelamento usa a chave guardada da loteadora mesmo com a integração desativada, para
--      que o boleto deixe de valer no Asaas;
--   2. sem chave guardada, ou com a chave recusada pelo Asaas (401/403, ex.: chave revogada), a
--      cobrança é cancelada só no NorteIA, e o motivo registra que o boleto deve ser cancelado
--      também no painel do Asaas.

create function privado.asaas_requisicao_cancelamento(p_tenant uuid, p_metodo text, p_caminho text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.integracoes_asaas;
  v_chave text;
begin
  select * into i from public.integracoes_asaas where tenant_id = p_tenant;
  if i.tenant_id is null or i.segredo_id is null then
    return null;
  end if;
  select decrypted_secret into v_chave from vault.decrypted_secrets where id = i.segredo_id;
  if v_chave is null then
    return null;
  end if;
  return privado.asaas_chamar(i.ambiente, v_chave, p_metodo, p_caminho, null);
end;
$$;
revoke execute on function privado.asaas_requisicao_cancelamento(uuid, text, text) from public, anon, authenticated;

create or replace function public.cancelar_cobranca(p_cobranca uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  co public.cobrancas;
  c public.contratos;
  v_resp jsonb;
  v_status integer;
  v_motivo text := trim(coalesce(p_motivo, ''));
begin
  select * into co from public.cobrancas where id = p_cobranca for update;
  select ct.* into c from public.parcelas pa join public.contratos ct on ct.id = pa.contrato_id where pa.id = co.parcela_id;
  if co.id is null or not privado.pode('carteira.receber', c.tenant_id, 'empreendimento', c.empreendimento_id) then
    raise exception 'Sem permissão para cancelar cobranças.' using errcode = 'insufficient_privilege';
  end if;
  if co.situacao <> 'pendente' then
    raise exception 'A cobrança não está pendente.' using errcode = 'check_violation';
  end if;
  if length(v_motivo) < 3 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'check_violation';
  end if;
  v_resp := privado.asaas_requisicao_cancelamento(co.tenant_id, 'DELETE', '/payments/' || co.asaas_id);
  v_status := (v_resp ->> 'status')::integer;
  if v_resp is null or v_status in (401, 403) then
    v_motivo := v_motivo || ' — cancelada só no NorteIA (integração com o Asaas indisponível); cancele o boleto também no painel do Asaas.';
  elsif v_status not in (200, 404) then
    raise exception 'O Asaas não cancelou a cobrança: %', privado.asaas_erro(v_resp) using errcode = 'check_violation', hint = 'asaas';
  end if;
  perform set_config('app.carteira', 'on', true);
  perform set_config('app.motivo', v_motivo, true);
  update public.cobrancas set situacao = 'cancelada', motivo = v_motivo, verificado_em = now() where id = co.id;
  perform set_config('app.carteira', '', true);
end;
$$;
