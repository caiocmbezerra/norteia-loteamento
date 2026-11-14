-- Vitrine de empreendimentos (D-118, decisão do dono do produto em 13/11/2026): página pública por
-- empreendimento, sem login, com o mapa de lotes disponíveis e o preço do jeito que a loteadora
-- escolher (por lote, "a partir de" ou sem preço). "Tenho interesse" vira lead (origem site),
-- com consentimento registrado (PL-15) e aviso por e-mail à equipe comercial. Os compradores veem
-- os empreendimentos publicados das loteadoras com que têm contrato, no portal.
-- // VALIDAR COM ADVOGADO (PL-15): texto do consentimento do formulário público.

alter table public.empreendimentos
  add column vitrine_publicada boolean not null default false,
  add column vitrine_slug text unique check (vitrine_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add column vitrine_precos text not null default 'a_partir' check (vitrine_precos in ('lote', 'a_partir', 'nenhum')),
  add column vitrine_descricao text check (vitrine_descricao is null or length(vitrine_descricao) <= 1000);

alter table public.leads add column consentimento_em timestamptz;

alter table public.envios_email drop constraint envios_email_tipo_check;
alter table public.envios_email add constraint envios_email_tipo_check
  check (tipo in ('lembrete_vencimento', 'chamado', 'convite_portal', 'interesse_vitrine'));

-- Texto em endereço: minúsculas, sem acento, palavras separadas por hífen.
create function privado.slug(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    translate(lower(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', '-', 'g'))
$$;

-- Publicar, despublicar e configurar a vitrine. Devolve o endereço (slug), criado na primeira vez.
create function public.configurar_vitrine(p_empreendimento uuid, p_publicada boolean, p_precos text, p_descricao text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.empreendimentos;
  v_slug text;
begin
  select * into e from public.empreendimentos where id = p_empreendimento for update;
  if e.id is null or not privado.pode('empreendimento.editar', e.tenant_id, 'empreendimento', e.id) then
    raise exception 'Sem permissão para configurar a vitrine.' using errcode = 'insufficient_privilege';
  end if;
  if p_precos not in ('lote', 'a_partir', 'nenhum') then
    raise exception 'Escolha como mostrar o preço.' using errcode = 'check_violation', hint = 'precos';
  end if;
  v_slug := e.vitrine_slug;
  if v_slug is null then
    v_slug := left(nullif(privado.slug(e.nome), ''), 50);
    v_slug := coalesce(v_slug || '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5);
  end if;
  update public.empreendimentos
     set vitrine_publicada = coalesce(p_publicada, false), vitrine_precos = p_precos, vitrine_slug = v_slug,
         vitrine_descricao = nullif(trim(coalesce(p_descricao, '')), '')
   where id = e.id;
  return v_slug;
end;
$$;
revoke execute on function public.configurar_vitrine(uuid, boolean, text, text) from public, anon;
grant execute on function public.configurar_vitrine(uuid, boolean, text, text) to authenticated;

-- Página pública: só empreendimento publicado; nada de comprador, preço de venda ou contrato.
create function public.vitrine_publica(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.empreendimentos;
  v_lotes jsonb;
  v_a_partir bigint;
begin
  select * into e from public.empreendimentos where vitrine_slug = p_slug and vitrine_publicada;
  if e.id is null then
    return null;
  end if;
  select min(public.preco_tabela(l.id, current_date)) into v_a_partir
    from public.lotes l where l.empreendimento_id = e.id and l.status = 'disponivel';
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'quadra', q.codigo, 'numero', l.numero, 'area_m2', l.area_m2,
           'disponivel', l.status = 'disponivel',
           'preco_centavos', case when e.vitrine_precos = 'lote' and l.status = 'disponivel'
                                  then public.preco_tabela(l.id, current_date) end)
         order by q.codigo, length(l.numero), l.numero), '[]'::jsonb)
    into v_lotes
    from public.lotes l join public.quadras q on q.id = l.quadra_id
   where l.empreendimento_id = e.id;
  return jsonb_build_object(
    'nome', e.nome, 'municipio', e.municipio, 'uf', e.uf, 'descricao', e.vitrine_descricao,
    'em_vendas', e.situacao = 'em_vendas',
    'loteadora', (select nome from public.tenants where id = e.tenant_id),
    'precos', e.vitrine_precos,
    'a_partir_centavos', case when e.vitrine_precos <> 'nenhum' then v_a_partir end,
    'lotes', v_lotes
  );
end;
$$;
revoke execute on function public.vitrine_publica(text) from public;
grant execute on function public.vitrine_publica(text) to anon, authenticated;

-- E-mails de quem tem uma permissão no escopo do empreendimento.
create function privado.emails_com_permissao(p_tenant uuid, p_empreendimento uuid, p_permissao text)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct pf.email::text
    from public.membros m
    join public.perfis pf on pf.id = m.usuario_id
    join public.atribuicoes_papel a on a.membro_id = m.id
    join public.papel_permissoes pp on pp.papel = a.papel and pp.permissao = p_permissao
    join public.empreendimentos e on e.id = p_empreendimento
    join public.spes s on s.id = e.spe_id
   where m.tenant_id = p_tenant and m.ativo and pf.email is not null
     and (a.escopo_tipo = 'tenant'
          or (a.escopo_tipo = 'empresa' and a.escopo_id = s.empresa_id)
          or (a.escopo_tipo = 'spe' and a.escopo_id = s.id)
          or (a.escopo_tipo = 'empreendimento' and a.escopo_id = e.id))
$$;
revoke execute on function privado.emails_com_permissao(uuid, uuid, text) from public, anon, authenticated;

-- "Tenho interesse" na página pública: vira lead (origem site) e avisa a equipe comercial.
-- Retorna 'ok' (ou 'ok' também para pedido repetido em 10 minutos, sem duplicar o lead).
create function public.registrar_interesse(
  p_slug text, p_nome text, p_email text, p_telefone text, p_lote uuid, p_mensagem text, p_consentimento boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.empreendimentos;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_tel text := nullif(regexp_replace(coalesce(p_telefone, ''), '[^0-9+() -]', '', 'g'), '');
  v_lote text;
  v_obs text;
  v_lead uuid;
  v_site text;
  v_para text;
begin
  select * into e from public.empreendimentos where vitrine_slug = p_slug and vitrine_publicada;
  if e.id is null then
    raise exception 'Empreendimento não encontrado.' using errcode = 'no_data_found';
  end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then
    raise exception 'Informe seu nome.' using errcode = 'check_violation', hint = 'nome';
  end if;
  if v_email is null and v_tel is null then
    raise exception 'Informe um telefone ou e-mail para contato.' using errcode = 'check_violation', hint = 'contato';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.' using errcode = 'check_violation', hint = 'email';
  end if;
  if not coalesce(p_consentimento, false) then
    raise exception 'Autorize o contato para enviar.' using errcode = 'check_violation', hint = 'consentimento';
  end if;
  -- Clique repetido: não duplica o lead.
  if exists (select 1 from public.leads l
              where l.empreendimento_id = e.id and l.origem = 'site' and l.criado_em > now() - interval '10 minutes'
                and ((v_email is not null and l.email = v_email) or (v_tel is not null and l.telefone = v_tel))) then
    return 'ok';
  end if;
  select 'Quadra ' || q.codigo || ' · Lote ' || l.numero into v_lote
    from public.lotes l join public.quadras q on q.id = l.quadra_id
   where l.id = p_lote and l.empreendimento_id = e.id;
  v_obs := left(concat_ws(E'\n', 'Pela vitrine do site.',
                          case when v_lote is not null then 'Interesse: ' || v_lote end,
                          nullif(trim(coalesce(p_mensagem, '')), '')), 1000);
  insert into public.leads (tenant_id, empreendimento_id, nome, email, telefone, origem, observacao, consentimento_em)
  values (e.tenant_id, e.id, left(trim(p_nome), 200), left(v_email, 200), left(v_tel, 30), 'site', v_obs, now())
  returning id into v_lead;

  v_site := rtrim(public.parametro_vigente('plataforma.url_site', current_date, e.tenant_id) #>> '{}', '/');
  for v_para in select * from privado.emails_com_permissao(e.tenant_id, e.id, 'venda.registrar') loop
    perform privado.enviar_email(
      e.tenant_id, 'interesse_vitrine', v_lead || ':' || v_para, null, v_para,
      format('Novo interessado em %s: %s', e.nome, trim(p_nome)),
      privado.email_html(
        format('<p><strong>%s</strong> demonstrou interesse em <strong>%s</strong> pela vitrine do site.</p>'
               '<p>%s%s%s</p>%s',
               privado.html(trim(p_nome)), privado.html(e.nome),
               coalesce('Telefone: ' || privado.html(v_tel) || '<br>', ''),
               coalesce('E-mail: ' || privado.html(v_email) || '<br>', ''),
               coalesce('Lote: ' || privado.html(v_lote), ''),
               coalesce('<blockquote style="margin:0;padding:8px 12px;border-left:3px solid #e5e7eb;color:#374151">'
                        || privado.html(left(nullif(trim(coalesce(p_mensagem, '')), ''), 600)) || '</blockquote>', '')),
        v_site || '/empreendimentos/' || e.id || '/comercial/leads', 'Ver nos leads',
        'Aviso automático do NorteIA Loteamento para a equipe comercial.'),
      format(E'%s demonstrou interesse em %s.\nTelefone: %s\nE-mail: %s\nLote: %s\n\n%s',
             trim(p_nome), e.nome, coalesce(v_tel, '-'), coalesce(v_email, '-'), coalesce(v_lote, '-'),
             v_site || '/empreendimentos/' || e.id || '/comercial/leads'));
  end loop;
  return 'ok';
end;
$$;
revoke execute on function public.registrar_interesse(text, text, text, text, uuid, text, boolean) from public;
grant execute on function public.registrar_interesse(text, text, text, text, uuid, text, boolean) to anon, authenticated;

-- Portal: empreendimentos publicados das loteadoras com que o usuário tem contrato, sociedade ou permuta.
create function public.vitrines_do_portal()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', e.vitrine_slug, 'nome', e.nome, 'municipio', e.municipio, 'uf', e.uf,
           'loteadora', t.nome, 'em_vendas', e.situacao = 'em_vendas',
           'disponiveis', (select count(*) from public.lotes l where l.empreendimento_id = e.id and l.status = 'disponivel'),
           'a_partir_centavos', case when e.vitrine_precos <> 'nenhum' then
             (select min(public.preco_tabela(l.id, current_date)) from public.lotes l
               where l.empreendimento_id = e.id and l.status = 'disponivel') end)
         order by e.nome), '[]'::jsonb)
    from public.empreendimentos e
    join public.tenants t on t.id = e.tenant_id
   where e.vitrine_publicada
     and e.tenant_id in (
       select tenant_id from public.compradores where usuario_id = auth.uid()
       union select tenant_id from public.socios where usuario_id = auth.uid()
       union select tenant_id from public.permutantes where usuario_id = auth.uid())
$$;
revoke execute on function public.vitrines_do_portal() from public, anon;
grant execute on function public.vitrines_do_portal() to authenticated;
