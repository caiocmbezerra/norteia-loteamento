-- Quem entra pela primeira vez com um convite de portal pendente para o próprio e-mail (já
-- confirmado) passa a ver o portal sem depender do link: o convite foi enviado para esse e-mail,
-- a mesma garantia de aceitá-lo pelo link. Evita que o comprador caia no cadastro de loteadora.
create function public.aceitar_convites_pendentes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  c public.convites_portal;
  v_n integer := 0;
begin
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;
  for c in
    select * from public.convites_portal
     where email = v_email and aceito_em is null and expira_em > now()
     order by criado_em
     for update
  loop
    if c.tipo = 'comprador' then
      update public.compradores set usuario_id = v_uid where id = c.alvo_id and usuario_id is null;
    elsif c.tipo = 'socio' then
      update public.socios set usuario_id = v_uid where id = c.alvo_id and usuario_id is null;
    else
      update public.permutantes set usuario_id = v_uid where id = c.alvo_id and usuario_id is null;
    end if;
    if found then
      update public.convites_portal set aceito_em = now(), aceito_por = v_uid where id = c.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.aceitar_convites_pendentes() from public, anon;
grant execute on function public.aceitar_convites_pendentes() to authenticated;
