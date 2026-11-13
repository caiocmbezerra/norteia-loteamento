-- Lembrete de vencimento: o botão "Ver no portal" só vai para quem já tem acesso ao portal.
-- Sem boleto pendente e sem portal, o e-mail orienta a falar com a loteadora (antes o link
-- levava a uma página de "não encontrado").

create or replace function public.enviar_lembretes_vencimento(p_hoje date default current_date)
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
             c.id as contrato_id, co.nome, co.email, co.token_descadastro, co.usuario_id is not null as tem_portal,
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
      -- Boleto/Pix pendente; senão o portal, só para quem já tem acesso a ele.
      v_link := coalesce(r.link_fatura, case when r.tem_portal then v_site || '/portal/contratos/' || r.contrato_id end);
      v_html := format(
        '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937;max-width:560px">'
        '<p>Olá, %s,</p><p>%s</p>'
        '<p style="margin:16px 0;padding:12px;border:1px solid #e5e7eb;border-radius:8px">%s<br>%s<br><strong>%s</strong></p>'
        '%s'
        '<p style="color:#6b7280;font-size:12px;margin-top:24px">Mensagem automática de %s. '
        'Não quer mais receber lembretes por e-mail? <a href="%s">Descadastrar</a>.</p></div>',
        privado.html(split_part(r.nome, ' ', 1)), v_intro,
        privado.html(r.empreendimento), privado.html(r.lote), privado.moeda(r.saldo),
        case when v_link is null
          then format('<p>Para receber o boleto ou o Pix desta parcela, entre em contato com %s.</p>', privado.html(t.nome))
          else format('<p><a href="%s" style="display:inline-block;background:#166534;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">%s</a></p>',
                      privado.html(v_link), case when r.link_fatura is not null then 'Pagar com boleto ou Pix' else 'Ver no portal' end) end,
        privado.html(t.nome), privado.html(v_site || '/descadastrar/' || r.token_descadastro)
      );
      v_texto := format(E'Olá, %s,\n\n%s\n\n%s · %s · %s\n\n%s\n\nPara não receber mais lembretes: %s',
        split_part(r.nome, ' ', 1), regexp_replace(v_intro, '<[^>]+>', '', 'g'),
        r.empreendimento, r.lote, privado.moeda(r.saldo),
        coalesce(v_link, 'Para receber o boleto ou o Pix, entre em contato com ' || t.nome || '.'), v_site || '/descadastrar/' || r.token_descadastro);
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
