-- E-mail transacional pelo Resend (domínio norteialoteamento.com.br) e lembrete de vencimento
-- da régua de cobrança (RN-K10). A chave do Resend fica no Vault ('resend_api_key') e só é lida
-- dentro do banco; os envios saem daqui (extensão http), nunca do navegador nem do app.
-- Cada envio é registrado; o comprador pode se descadastrar por um link sem login (opt-out).
-- Lembretes vêm desligados: cada loteadora liga em Parâmetros (PL-15, PL-16).

insert into public.parametros (chave, descricao, tipo, unidade, valores_permitidos, pendencia_legal) values
  ('plataforma.url_site', 'Endereço público do sistema, usado nos links dos e-mails', 'texto', null, null, null),
  ('plataforma.email_remetente', 'Endereço que envia os e-mails do sistema', 'texto', null, null, null),
  ('carteira.lembrete_email_ativo', 'Lembrete de vencimento por e-mail ao comprador', 'booleano', null, null, 'PL-15, PL-16'),
  ('carteira.lembrete_dias_antes', 'Lembrete: quantos dias antes do vencimento (0 = não envia)', 'inteiro', 'dias', null, 'PL-16'),
  ('carteira.lembrete_no_vencimento', 'Lembrete no dia do vencimento', 'booleano', null, null, 'PL-16'),
  ('carteira.lembrete_dias_depois', 'Aviso de parcela em atraso: quantos dias depois do vencimento (0 = não envia)', 'inteiro', 'dias', null, 'PL-16');

insert into public.parametro_valores (tenant_id, chave, escopo, escopo_id, valor, vigencia, motivo) values
  (null, 'plataforma.url_site', 'plataforma', null, '"https://norteia-loteamento-1.vercel.app"', daterange('2026-01-01', null), 'Endereço atual do sistema'),
  (null, 'plataforma.email_remetente', 'plataforma', null, '"avisos@norteialoteamento.com.br"', daterange('2026-01-01', null), 'Domínio verificado no Resend'),
  (null, 'carteira.lembrete_email_ativo', 'plataforma', null, 'false', daterange('2026-01-01', null), 'Desligado até a loteadora ligar'),
  (null, 'carteira.lembrete_dias_antes', 'plataforma', null, '3', daterange('2026-01-01', null), 'Sugestão da plataforma'),
  (null, 'carteira.lembrete_no_vencimento', 'plataforma', null, 'true', daterange('2026-01-01', null), 'Sugestão da plataforma'),
  (null, 'carteira.lembrete_dias_depois', 'plataforma', null, '3', daterange('2026-01-01', null), 'Sugestão da plataforma');

-- Opt-out do comprador (RN-K10) e token do link de descadastro (sem login).
alter table public.compradores
  add column recebe_lembretes boolean not null default true,
  add column token_descadastro uuid not null default gen_random_uuid();
create unique index compradores_token_descadastro_idx on public.compradores (token_descadastro);

-- Registro de cada mensagem enviada (RN-K10). A referência impede o mesmo envio duas vezes.
create table public.envios_email (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  tipo text not null check (tipo in ('lembrete_vencimento')),
  referencia text not null,
  contrato_id uuid,
  destinatario extensions.citext not null,
  assunto text not null,
  situacao text not null default 'enviando' check (situacao in ('enviando', 'enviado', 'falhou')),
  provedor_id text,
  erro text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, tipo, referencia),
  foreign key (tenant_id, contrato_id) references public.contratos (tenant_id, id) on delete restrict
);
create index envios_email_contrato_idx on public.envios_email (tenant_id, contrato_id, criado_em desc);

alter table public.envios_email enable row level security;
create policy "ler envios de e-mail" on public.envios_email for select to authenticated
  using (privado.pode('carteira.ler', tenant_id));
revoke insert, update, delete, truncate on public.envios_email from authenticated, anon;
select privado.instrumentar('public.envios_email');

-- ---------------------------------------------------------------------------
-- Envio
-- ---------------------------------------------------------------------------

create function privado.html(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;') $$;

create function privado.moeda(p_centavos bigint)
returns text
language sql
immutable
set search_path = ''
as $$ select 'R$ ' || translate(to_char(p_centavos / 100.0, 'FM999,999,999,990.00'), ',.', '.,') $$;

-- Chamada à API do Resend (substituída nos testes). Retorna {status, corpo}.
create function privado.resend_chamar(p_corpo jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text;
  r extensions.http_response;
begin
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'resend_api_key';
  if v_chave is null then
    return jsonb_build_object('status', 0, 'corpo', jsonb_build_object('message', 'Chave do Resend não configurada.'));
  end if;
  r := extensions.http((
    'POST', 'https://api.resend.com/emails',
    array[extensions.http_header('Authorization', 'Bearer ' || v_chave)],
    'application/json', p_corpo::text
  )::extensions.http_request);
  return jsonb_build_object('status', r.status, 'corpo', coalesce(nullif(r.content, '')::jsonb, '{}'::jsonb));
exception when others then
  return jsonb_build_object('status', 0, 'corpo', jsonb_build_object('message', sqlerrm));
end;
$$;

-- Envia um e-mail uma única vez por (tenant, tipo, referência). Retorna 'enviado', 'falhou' ou 'repetido'.
create function privado.enviar_email(
  p_tenant uuid, p_tipo text, p_referencia text, p_contrato uuid,
  p_para text, p_assunto text, p_html text, p_texto text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_remetente text;
  v_nome text;
  v_resp jsonb;
begin
  insert into public.envios_email (tenant_id, tipo, referencia, contrato_id, destinatario, assunto)
  values (p_tenant, p_tipo, p_referencia, p_contrato, p_para, p_assunto)
  on conflict (tenant_id, tipo, referencia) do nothing
  returning id into v_id;
  if v_id is null then
    return 'repetido';
  end if;
  v_remetente := public.parametro_vigente('plataforma.email_remetente', current_date, p_tenant) #>> '{}';
  -- Nome de exibição: a loteadora, sem caracteres que quebram o cabeçalho.
  select regexp_replace(nome, '[<>"\\,;]', '', 'g') into v_nome from public.tenants where id = p_tenant;
  v_resp := privado.resend_chamar(jsonb_build_object(
    'from', format('%s <%s>', v_nome, v_remetente),
    'to', jsonb_build_array(p_para),
    'subject', p_assunto,
    'html', p_html,
    'text', p_texto
  ));
  if (v_resp ->> 'status')::integer between 200 and 299 then
    update public.envios_email set situacao = 'enviado', provedor_id = v_resp #>> '{corpo,id}' where id = v_id;
    return 'enviado';
  end if;
  update public.envios_email
     set situacao = 'falhou', erro = left(coalesce(v_resp #>> '{corpo,message}', 'HTTP ' || (v_resp ->> 'status')), 500)
   where id = v_id;
  return 'falhou';
end;
$$;
revoke execute on function privado.resend_chamar(jsonb) from public, anon, authenticated;
revoke execute on function privado.enviar_email(uuid, text, text, uuid, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lembrete de vencimento (rotina diária)
-- ---------------------------------------------------------------------------

create function public.enviar_lembretes_vencimento(p_hoje date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  r record;
  v_antes integer;
  v_no_dia boolean;
  v_depois integer;
  v_site text;
  v_etapa text;
  v_assunto text;
  v_intro text;
  v_link text;
  v_html text;
  v_texto text;
  v_n integer := 0;
begin
  for t in
    select id, nome from public.tenants
     where coalesce((public.parametro_vigente('carteira.lembrete_email_ativo', p_hoje, id) #>> '{}')::boolean, false)
  loop
    v_antes := coalesce((public.parametro_vigente('carteira.lembrete_dias_antes', p_hoje, t.id) #>> '{}')::integer, 0);
    v_no_dia := coalesce((public.parametro_vigente('carteira.lembrete_no_vencimento', p_hoje, t.id) #>> '{}')::boolean, false);
    v_depois := coalesce((public.parametro_vigente('carteira.lembrete_dias_depois', p_hoje, t.id) #>> '{}')::integer, 0);
    v_site := rtrim(public.parametro_vigente('plataforma.url_site', p_hoje, t.id) #>> '{}', '/');

    for r in
      select p.id as parcela_id, p.numero, p.vencimento, p.valor_centavos - p.pago_centavos as saldo,
             c.id as contrato_id, co.nome, co.email, co.token_descadastro,
             e.nome as empreendimento, 'Quadra ' || q.codigo || ' · Lote ' || l.numero as lote,
             (select x.link_fatura from public.cobrancas x where x.parcela_id = p.id and x.situacao = 'pendente' limit 1) as link_fatura
        from public.parcelas p
        join public.contratos c on c.id = p.contrato_id
        join public.compradores co on co.id = c.comprador_id
        join public.empreendimentos e on e.id = c.empreendimento_id
        join public.lotes l on l.id = c.lote_id
        join public.quadras q on q.id = l.quadra_id
       where p.tenant_id = t.id and p.situacao = 'aberta' and c.situacao = 'vigente'
         and co.email is not null and co.recebe_lembretes
         and p.valor_centavos > p.pago_centavos
         and ((v_antes > 0 and p.vencimento = p_hoje + v_antes)
              or (v_no_dia and p.vencimento = p_hoje)
              or (v_depois > 0 and p.vencimento = p_hoje - v_depois))
    loop
      v_etapa := case when r.vencimento > p_hoje then 'antes' when r.vencimento = p_hoje then 'dia' else 'depois' end;
      v_assunto := case v_etapa
        when 'antes' then format('Sua parcela vence em %s', to_char(r.vencimento, 'DD/MM/YYYY'))
        when 'dia' then 'Sua parcela vence hoje'
        else format('Parcela em aberto desde %s', to_char(r.vencimento, 'DD/MM/YYYY')) end;
      v_intro := case v_etapa
        when 'antes' then format('a %s do seu lote vence em <strong>%s</strong>.',
                                 case when r.numero = 0 then 'entrada' else 'parcela ' || r.numero end, to_char(r.vencimento, 'DD/MM/YYYY'))
        when 'dia' then format('a %s do seu lote vence <strong>hoje</strong>.',
                               case when r.numero = 0 then 'entrada' else 'parcela ' || r.numero end)
        else format('não identificamos o pagamento da %s do seu lote, vencida em <strong>%s</strong>. Se já pagou, desconsidere este aviso.',
                    case when r.numero = 0 then 'entrada' else 'parcela ' || r.numero end, to_char(r.vencimento, 'DD/MM/YYYY')) end;
      v_link := coalesce(r.link_fatura, v_site || '/portal/contratos/' || r.contrato_id);
      v_html := format(
        '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937;max-width:560px">'
        '<p>Olá, %s,</p><p>%s</p>'
        '<p style="margin:16px 0;padding:12px;border:1px solid #e5e7eb;border-radius:8px">%s<br>%s<br><strong>%s</strong></p>'
        '<p><a href="%s" style="display:inline-block;background:#166534;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">%s</a></p>'
        '<p style="color:#6b7280;font-size:12px;margin-top:24px">Mensagem automática de %s. '
        'Não quer mais receber lembretes por e-mail? <a href="%s">Descadastrar</a>.</p></div>',
        privado.html(split_part(r.nome, ' ', 1)), v_intro,
        privado.html(r.empreendimento), privado.html(r.lote), privado.moeda(r.saldo),
        privado.html(v_link), case when r.link_fatura is not null then 'Pagar com boleto ou Pix' else 'Ver no portal' end,
        privado.html(t.nome), privado.html(v_site || '/descadastrar/' || r.token_descadastro)
      );
      v_texto := format(E'Olá, %s,\n\n%s\n\n%s · %s · %s\n\n%s\n\nPara não receber mais lembretes: %s',
        split_part(r.nome, ' ', 1), regexp_replace(v_intro, '<[^>]+>', '', 'g'),
        r.empreendimento, r.lote, privado.moeda(r.saldo), v_link, v_site || '/descadastrar/' || r.token_descadastro);
      if privado.enviar_email(t.id, 'lembrete_vencimento', r.parcela_id || ':' || v_etapa || ':' || r.vencimento,
                              r.contrato_id, r.email, v_assunto, v_html, v_texto) = 'enviado' then
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.enviar_lembretes_vencimento(date) from public, anon, authenticated;

-- 08h07 em Brasília.
select cron.schedule('lembretes-vencimento', '7 11 * * *', 'select public.enviar_lembretes_vencimento()');

-- ---------------------------------------------------------------------------
-- Opt-out
-- ---------------------------------------------------------------------------

-- Link do e-mail, sem login: o token identifica o comprador.
create function public.descadastrar_lembretes(p_token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant text;
begin
  update public.compradores c set recebe_lembretes = false
    from public.tenants t
   where c.token_descadastro = p_token and t.id = c.tenant_id
  returning t.nome into v_tenant;
  if v_tenant is null then
    raise exception 'Link inválido.' using errcode = 'no_data_found';
  end if;
  return v_tenant;
end;
$$;
revoke execute on function public.descadastrar_lembretes(uuid) from public;
grant execute on function public.descadastrar_lembretes(uuid) to anon, authenticated;

-- Comprador no portal liga ou desliga os lembretes de todos os seus cadastros.
create function public.definir_meus_lembretes(p_recebe boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Entre para alterar.' using errcode = 'insufficient_privilege';
  end if;
  update public.compradores set recebe_lembretes = coalesce(p_recebe, true) where usuario_id = auth.uid();
end;
$$;
revoke execute on function public.definir_meus_lembretes(boolean) from public, anon;
grant execute on function public.definir_meus_lembretes(boolean) to authenticated;

create function public.meus_lembretes()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(bool_and(recebe_lembretes), true) from public.compradores where usuario_id = auth.uid() $$;
revoke execute on function public.meus_lembretes() from public, anon;
grant execute on function public.meus_lembretes() to authenticated;

-- Exportação LGPD (D-112) passa a incluir o opt-out e os e-mails enviados.
create or replace function public.dados_titular(p_comprador uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  co public.compradores;
  v_titular boolean;
begin
  select * into co from public.compradores where id = p_comprador;
  v_titular := co.id is not null and privado.e_comprador(co.id);
  if co.id is null or not (v_titular or privado.pode('tenant.administrar', co.tenant_id)) then
    raise exception 'Comprador não encontrado.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.exportacoes_titular (tenant_id, comprador_id, pelo_titular) values (co.tenant_id, co.id, v_titular);
  return jsonb_build_object(
    'gerado_em', now(),
    'controlador', (select nome from public.tenants where id = co.tenant_id),
    'cadastro', jsonb_build_object(
      'nome', co.nome, 'cpf', co.cpf, 'email', co.email, 'telefone', co.telefone,
      'cadastrado_em', co.criado_em, 'acessa_o_portal', co.usuario_id is not null, 'recebe_lembretes_email', co.recebe_lembretes
    ),
    'contratos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', c.numero, 'situacao', c.situacao, 'empreendimento', e.nome,
        'lote', 'Quadra ' || q.codigo || ' · Lote ' || l.numero,
        'data_venda', v.data_venda, 'preco_centavos', v.preco_centavos, 'entrada_centavos', v.entrada_centavos,
        'parcelas_contratadas', v.parcelas, 'juros_mensal', v.juros_mensal, 'indice_reajuste', c.indice_reajuste,
        'quitado_em', c.quitado_em,
        'parcelas', coalesce((select jsonb_agg(jsonb_build_object(
            'numero', p.numero, 'vencimento', p.vencimento, 'valor_centavos', p.valor_centavos,
            'pago_centavos', p.pago_centavos, 'situacao', p.situacao) order by p.numero)
          from public.parcelas p where p.contrato_id = c.id), '[]'::jsonb),
        'pagamentos', coalesce((select jsonb_agg(jsonb_build_object(
            'data', r.data_pagamento, 'valor_centavos', r.valor_centavos, 'parcela', p.numero,
            'origem', r.origem, 'estornado_em', r.estornado_em) order by r.data_pagamento)
          from public.recebimentos r join public.parcelas p on p.id = r.parcela_id where p.contrato_id = c.id), '[]'::jsonb),
        'chamados', coalesce((select jsonb_agg(jsonb_build_object(
            'assunto', ch.assunto, 'categoria', ch.categoria, 'situacao', ch.situacao, 'aberto_em', ch.criado_em,
            'mensagens', (select jsonb_agg(jsonb_build_object('em', m.criado_em, 'do_comprador', m.autor_comprador, 'texto', m.texto) order by m.criado_em)
                            from public.chamado_mensagens m where m.chamado_id = ch.id)) order by ch.criado_em)
          from public.chamados ch where ch.contrato_id = c.id), '[]'::jsonb),
        'creditos', coalesce((select jsonb_agg(jsonb_build_object(
            'data', cr.data, 'valor_centavos', cr.valor_centavos, 'origem', cr.observacao, 'cancelado_em', cr.cancelado_em,
            'usos', (select jsonb_agg(jsonb_build_object('tipo', u.tipo, 'data', u.data, 'valor_centavos', u.valor_centavos) order by u.criado_em)
                       from public.usos_credito u where u.credito_id = cr.id)) order by cr.data)
          from public.creditos_comprador cr where cr.contrato_id = c.id), '[]'::jsonb),
        'emails_enviados', coalesce((select jsonb_agg(jsonb_build_object(
            'em', ev.criado_em, 'assunto', ev.assunto, 'para', ev.destinatario::text, 'situacao', ev.situacao) order by ev.criado_em)
          from public.envios_email ev where ev.contrato_id = c.id), '[]'::jsonb)
      ) order by c.numero)
        from public.contratos c
        join public.vendas v on v.id = c.venda_id
        join public.empreendimentos e on e.id = c.empreendimento_id
        join public.lotes l on l.id = c.lote_id
        join public.quadras q on q.id = l.quadra_id
       where c.comprador_id = co.id), '[]'::jsonb),
    'propostas', coalesce((
      select jsonb_agg(jsonb_build_object('data', pr.criado_em, 'situacao', pr.situacao, 'preco_centavos', pr.preco_centavos) order by pr.criado_em)
        from public.propostas pr where pr.tenant_id = co.tenant_id and co.cpf is not null and pr.cliente_cpf = co.cpf), '[]'::jsonb)
  );
end;
$$;
