-- Fase 5c-3b · Modelos de documentos (DOCX) por cliente (D-059): contrato, termo de quitação e
-- aditivos. Cada envio é uma nova versão; a anterior fica no histórico (nada é apagado).
-- Sem modelo próprio, vale o modelo padrão da plataforma (texto provisório).

insert into public.papel_permissoes (papel, permissao) values ('dono', 'modelos.gerenciar');

create table public.modelos_documento (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  tipo text not null check (tipo in ('contrato', 'quitacao', 'aditivo_renegociacao', 'aditivo_cessao', 'aditivo_troca_lote')),
  nome_arquivo text not null check (length(trim(nome_arquivo)) between 1 and 200),
  -- DOCX em base64 (até ~2 MB).
  conteudo_base64 text not null check (length(conteudo_base64) between 100 and 2800000),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

comment on table public.modelos_documento is
  'Versões dos modelos DOCX do cliente. O histórico é a própria tabela (sem auditoria do conteúdo, que é grande).';

create unique index modelos_documento_ativo_idx on public.modelos_documento (tenant_id, tipo) where ativo;
create index modelos_documento_tenant_idx on public.modelos_documento (tenant_id, tipo, criado_em desc);

alter table public.modelos_documento enable row level security;
create policy "ler modelos" on public.modelos_documento for select to authenticated
  using (privado.e_membro(tenant_id));
revoke insert, update, delete, truncate on public.modelos_documento from authenticated, anon;

-- Publica nova versão (o app confere antes que o modelo preenche sem erro).
create function public.publicar_modelo(p_tenant uuid, p_tipo text, p_nome text, p_conteudo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not privado.pode('modelos.gerenciar', p_tenant) then
    raise exception 'Sem permissão para alterar modelos de documentos.' using errcode = 'insufficient_privilege';
  end if;
  update public.modelos_documento set ativo = false, atualizado_em = now(), atualizado_por = auth.uid()
   where tenant_id = p_tenant and tipo = p_tipo and ativo;
  insert into public.modelos_documento (tenant_id, tipo, nome_arquivo, conteudo_base64)
  values (p_tenant, p_tipo, trim(p_nome), p_conteudo)
  returning id into v_id;
  return v_id;
end;
$$;

-- Volta ao modelo padrão da plataforma (as versões enviadas ficam no histórico).
create function public.usar_modelo_padrao(p_tenant uuid, p_tipo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.pode('modelos.gerenciar', p_tenant) then
    raise exception 'Sem permissão para alterar modelos de documentos.' using errcode = 'insufficient_privilege';
  end if;
  update public.modelos_documento set ativo = false, atualizado_em = now(), atualizado_por = auth.uid()
   where tenant_id = p_tenant and tipo = p_tipo and ativo;
end;
$$;

revoke execute on function public.publicar_modelo(uuid, text, text, text) from public, anon;
revoke execute on function public.usar_modelo_padrao(uuid, text) from public, anon;
grant execute on function public.publicar_modelo(uuid, text, text, text) to authenticated;
grant execute on function public.usar_modelo_padrao(uuid, text) to authenticated;
