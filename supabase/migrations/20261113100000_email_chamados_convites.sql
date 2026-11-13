-- E-mails de atendimento e convite (D-116): aviso de chamado (comprador → equipe que atende e
-- equipe → comprador) e convite do portal enviado por e-mail. Usam o mesmo envio do Resend
-- (D-115), com registro e sem repetir a mesma mensagem.

alter table public.envios_email drop constraint envios_email_tipo_check;
alter table public.envios_email add constraint envios_email_tipo_check
  check (tipo in ('lembrete_vencimento', 'chamado', 'convite_portal'));

insert into public.parametros (chave, descricao, tipo, unidade, valores_permitidos, pendencia_legal) values
  ('carteira.aviso_chamado_email', 'Aviso por e-mail de mensagens nos chamados do portal (comprador e equipe)', 'booleano', null, null, null);
insert into public.parametro_valores (tenant_id, chave, escopo, escopo_id, valor, vigencia, motivo) values
  (null, 'carteira.aviso_chamado_email', 'plataforma', null, 'true', daterange('2026-01-01', null), 'Sugestão da plataforma');

-- Moldura comum dos e-mails: corpo em HTML já escapado, botão e rodapé.
create function privado.email_html(p_corpo text, p_link text, p_botao text, p_rodape text)
returns text
language sql
immutable
set search_path = ''
as $$
  select format(
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937;max-width:560px">%s'
    '<p><a href="%s" style="display:inline-block;background:#166534;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">%s</a></p>'
    '<p style="color:#6b7280;font-size:12px;margin-top:24px">%s</p></div>',
    p_corpo, privado.html(p_link), privado.html(p_botao), p_rodape)
$$;

-- E-mails de quem responde chamados do empreendimento (atendimento.responder no escopo).
create function privado.emails_atendimento(p_tenant uuid, p_empreendimento uuid)
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
    join public.papel_permissoes pp on pp.papel = a.papel and pp.permissao = 'atendimento.responder'
    join public.empreendimentos e on e.id = p_empreendimento
    join public.spes s on s.id = e.spe_id
   where m.tenant_id = p_tenant and m.ativo and pf.email is not null
     and (a.escopo_tipo = 'tenant'
          or (a.escopo_tipo = 'empresa' and a.escopo_id = s.empresa_id)
          or (a.escopo_tipo = 'spe' and a.escopo_id = s.id)
          or (a.escopo_tipo = 'empreendimento' and a.escopo_id = e.id))
$$;
revoke execute on function privado.emails_atendimento(uuid, uuid) from public, anon, authenticated;

create function privado.avisar_chamado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.chamados;
  c public.contratos;
  co public.compradores;
  v_site text;
  v_trecho text;
  v_para text;
begin
  if not coalesce((public.parametro_vigente('carteira.aviso_chamado_email', current_date, new.tenant_id) #>> '{}')::boolean, false) then
    return new;
  end if;
  select * into ch from public.chamados where id = new.chamado_id;
  select * into c from public.contratos where id = ch.contrato_id;
  select * into co from public.compradores where id = c.comprador_id;
  v_site := rtrim(public.parametro_vigente('plataforma.url_site', current_date, new.tenant_id) #>> '{}', '/');
  v_trecho := privado.html(left(new.texto, 600)) || case when length(new.texto) > 600 then '…' else '' end;

  if new.autor_comprador then
    for v_para in select * from privado.emails_atendimento(new.tenant_id, ch.empreendimento_id) loop
      perform privado.enviar_email(
        new.tenant_id, 'chamado', new.id || ':' || v_para, c.id, v_para,
        format('Chamado de %s: %s', co.nome, ch.assunto),
        privado.email_html(
          format('<p><strong>%s</strong> %s um chamado no portal.</p><p><strong>%s</strong></p><blockquote style="margin:0;padding:8px 12px;border-left:3px solid #e5e7eb;color:#374151">%s</blockquote>',
                 privado.html(co.nome), case when (select count(*) from public.chamado_mensagens m where m.chamado_id = ch.id) > 1 then 'respondeu' else 'abriu' end,
                 privado.html(ch.assunto), v_trecho),
          v_site || '/atendimento/' || ch.id, 'Abrir o chamado',
          'Aviso automático do NorteIA Loteamento para a equipe de atendimento.'),
        format(E'%s escreveu no chamado "%s":\n\n%s\n\n%s', co.nome, ch.assunto, left(new.texto, 600), v_site || '/atendimento/' || ch.id));
    end loop;
  elsif co.email is not null then
    perform privado.enviar_email(
      new.tenant_id, 'chamado', new.id::text, c.id, co.email::text,
      format('Resposta ao seu chamado: %s', ch.assunto),
      privado.email_html(
        format('<p>Olá, %s,</p><p>A loteadora respondeu ao seu chamado <strong>%s</strong>:</p><blockquote style="margin:0;padding:8px 12px;border-left:3px solid #e5e7eb;color:#374151">%s</blockquote>',
               privado.html(split_part(co.nome, ' ', 1)), privado.html(ch.assunto), v_trecho),
        v_site || '/portal/contratos/' || c.id || '/chamados/' || ch.id, 'Ver e responder no portal',
        'Aviso automático sobre um chamado que você abriu no portal do comprador.'),
      format(E'Olá, %s,\n\nA loteadora respondeu ao seu chamado "%s":\n\n%s\n\n%s',
             split_part(co.nome, ' ', 1), ch.assunto, left(new.texto, 600), v_site || '/portal/contratos/' || c.id || '/chamados/' || ch.id));
  end if;
  return new;
end;
$$;
create trigger avisar_chamado after insert on public.chamado_mensagens
  for each row execute function privado.avisar_chamado();

-- Convite do portal por e-mail: só quem pode criar o convite, só para o e-mail do convite,
-- com o link montado pelo próprio banco (endereço oficial do sistema).
create function public.enviar_convite_portal(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  cv public.convites_portal;
  v_nome text;
  v_site text;
  v_link text;
  v_permitido boolean;
begin
  select * into cv from public.convites_portal where token_hash = extensions.digest(coalesce(p_token, ''), 'sha256');
  if cv.id is null or cv.aceito_em is not null or cv.expira_em < now() then
    raise exception 'Convite inválido, expirado ou já utilizado.' using errcode = 'invalid_parameter_value';
  end if;
  v_permitido := case cv.tipo
    when 'comprador' then privado.pode('carteira.receber', cv.tenant_id) or privado.pode('venda.registrar', cv.tenant_id)
    when 'socio' then privado.pode('socios.gerenciar', cv.tenant_id)
    else privado.pode('permutas.gerenciar', cv.tenant_id) end;
  if not coalesce(v_permitido, false) then
    raise exception 'Sem permissão para enviar este convite.' using errcode = 'insufficient_privilege';
  end if;
  select nome into v_nome from public.tenants where id = cv.tenant_id;
  v_site := rtrim(public.parametro_vigente('plataforma.url_site', current_date, cv.tenant_id) #>> '{}', '/');
  v_link := v_site || '/portal-convite/' || p_token;
  return privado.enviar_email(
    cv.tenant_id, 'convite_portal', cv.id::text, null, cv.email::text,
    format('%s convidou você para o portal', v_nome),
    privado.email_html(
      format('<p>Olá!</p><p><strong>%s</strong> convidou você para acompanhar pelo celular o seu %s: parcelas, segunda via do boleto e extratos.</p>'
             '<p>Entre ou crie sua conta com <strong>este mesmo e-mail</strong>. O convite vale por 30 dias.</p>',
             privado.html(v_nome), case cv.tipo when 'comprador' then 'contrato' when 'socio' then 'investimento na sociedade' else 'contrato de permuta' end),
      v_link, 'Abrir meu portal',
      'Se você não esperava este convite, pode ignorar este e-mail.'),
    format(E'%s convidou você para o portal. Entre com este mesmo e-mail: %s\n\nO convite vale por 30 dias.', v_nome, v_link));
end;
$$;
revoke execute on function public.enviar_convite_portal(text) from public, anon;
grant execute on function public.enviar_convite_portal(text) to authenticated;
