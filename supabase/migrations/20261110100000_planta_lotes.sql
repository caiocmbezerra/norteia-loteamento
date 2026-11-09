-- Fase 4b · Planta de lotes (D-008): imagem da planta do loteamento como fundo, com o contorno
-- de cada lote desenhado por cima (coordenadas relativas à imagem, de 0 a 1). A grade por quadra
-- continua como alternativa automática.

-- Arquivos no Storage, privados, em <tenant>/<empreendimento>/<arquivo>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plantas', 'plantas', false, 20971520, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create function privado.uuid_ou_nulo(p text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then p::uuid end
$$;
grant execute on function privado.uuid_ou_nulo(text) to authenticated, service_role;

-- O caminho só vale se o empreendimento for mesmo daquele tenant.
create function privado.pode_planta(p_permissao text, p_caminho text)
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
       and privado.pode(p_permissao, e.tenant_id, 'empreendimento', e.id)
  )
$$;
revoke execute on function privado.pode_planta(text, text) from public, anon;
grant execute on function privado.pode_planta(text, text) to authenticated, service_role;

create policy "ler plantas" on storage.objects for select to authenticated
  using (bucket_id = 'plantas' and privado.pode_planta('cadastro.ler', name));
create policy "enviar plantas" on storage.objects for insert to authenticated
  with check (bucket_id = 'plantas' and privado.pode_planta('empreendimento.editar', name));
create policy "trocar plantas" on storage.objects for update to authenticated
  using (bucket_id = 'plantas' and privado.pode_planta('empreendimento.editar', name))
  with check (bucket_id = 'plantas' and privado.pode_planta('empreendimento.editar', name));
create policy "apagar plantas" on storage.objects for delete to authenticated
  using (bucket_id = 'plantas' and privado.pode_planta('empreendimento.editar', name));

alter table public.empreendimentos
  add column planta_arquivo text,
  add column planta_largura integer check (planta_largura between 1 and 20000),
  add column planta_altura integer check (planta_altura between 1 and 20000),
  add constraint empreendimentos_planta_completa check (
    (planta_arquivo is null) = (planta_largura is null) and (planta_arquivo is null) = (planta_altura is null)
  ),
  -- O arquivo fica na pasta do próprio empreendimento.
  add constraint empreendimentos_planta_pasta check (
    planta_arquivo is null or planta_arquivo like tenant_id::text || '/' || id::text || '/%'
  );

comment on column public.empreendimentos.planta_arquivo is
  'Caminho da imagem da planta no bucket plantas (D-008); largura e altura em pixels dão a proporção.';

-- Polígono: de 3 a 200 pontos [x, y], cada coordenada entre 0 e 1.
create function privado.poligono_valido(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) between 3 and 200
     and not exists (
       select 1 from jsonb_array_elements(p) pt
        where jsonb_typeof(pt) <> 'array'
           or jsonb_array_length(pt) <> 2
           or jsonb_typeof(pt -> 0) <> 'number'
           or jsonb_typeof(pt -> 1) <> 'number'
           or (pt ->> 0)::numeric not between 0 and 1
           or (pt ->> 1)::numeric not between 0 and 1
     )
$$;
grant execute on function privado.poligono_valido(jsonb) to authenticated, service_role;

alter table public.lotes
  add column planta_poligono jsonb check (planta_poligono is null or privado.poligono_valido(planta_poligono));

comment on column public.lotes.planta_poligono is
  'Contorno do lote sobre a planta: [[x, y], ...] relativos à imagem (0 a 1).';
