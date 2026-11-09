-- Fase 3 · Anexo de notas fiscais, boletos e recibos às contas a pagar. Arquivos no Storage,
-- privados, em <tenant>/<empreendimento>/contas/<conta>/<arquivo>; quem lê as contas lê os anexos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create table public.anexos_conta (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  empreendimento_id uuid not null,
  conta_id uuid not null,
  caminho text not null unique,
  nome text not null check (length(trim(nome)) between 1 and 200),
  tipo text not null check (tipo in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  tamanho integer not null check (tamanho between 1 and 10485760),
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  -- O arquivo fica na pasta da própria conta.
  check (caminho like tenant_id::text || '/' || empreendimento_id::text || '/contas/' || conta_id::text || '/%'),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict,
  foreign key (tenant_id, conta_id) references public.contas_pagar (tenant_id, id) on delete restrict
);
create index anexos_conta_conta_idx on public.anexos_conta (tenant_id, conta_id);
create index anexos_conta_empreendimento_idx on public.anexos_conta (tenant_id, empreendimento_id);

-- A conta precisa ser do mesmo empreendimento.
create function privado.validar_anexo_conta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.contas_pagar c
     where c.id = new.conta_id and c.empreendimento_id = new.empreendimento_id and c.tenant_id = new.tenant_id
  ) then
    raise exception 'Conta a pagar de outro empreendimento.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger validar_anexo_conta
  before insert or update on public.anexos_conta
  for each row execute function privado.validar_anexo_conta();

alter table public.anexos_conta enable row level security;
create policy "ler anexos de contas" on public.anexos_conta for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id, 'empreendimento', empreendimento_id));
create policy "anexar a contas" on public.anexos_conta for insert to authenticated
  with check (privado.pode('custos.editar', tenant_id, 'empreendimento', empreendimento_id));
create policy "remover anexos de contas" on public.anexos_conta for delete to authenticated
  using (privado.pode('custos.editar', tenant_id, 'empreendimento', empreendimento_id));
revoke update, truncate on public.anexos_conta from authenticated, anon;
select privado.instrumentar('public.anexos_conta');

-- Storage: a pasta precisa ser de um empreendimento do tenant da pasta.
create function privado.pode_documento(p_permissao text, p_caminho text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.empreendimentos e
     where e.tenant_id = privado.uuid_ou_nulo((storage.foldername(p_caminho))[1])
       and e.id = privado.uuid_ou_nulo((storage.foldername(p_caminho))[2])
       and (storage.foldername(p_caminho))[3] = 'contas'
       and privado.pode(p_permissao, e.tenant_id, 'empreendimento', e.id)
  )
$$;
revoke execute on function privado.pode_documento(text, text) from public, anon;
grant execute on function privado.pode_documento(text, text) to authenticated, service_role;

create policy "ler documentos" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and privado.pode_documento('financeiro.ler', name));
create policy "enviar documentos" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and privado.pode_documento('custos.editar', name));
create policy "apagar documentos" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and privado.pode_documento('custos.editar', name));
