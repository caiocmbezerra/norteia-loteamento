-- Correções de achados da auditoria de QA (docs/qa-norteia-loteamento/07-relatorio-execucao.md),
-- autorizadas pelo dono do produto em 15/11/2026.
--   A-06: status "permuta" do lote só nasce de um contrato de permuta física (RN-T01, RN-C04).
--   A-08: o plano contratado (tenants.plano_id) não é alterado pelo próprio cliente (RN-G07).
--   A-09: participações de sócios conferidas sob trava por SPE (sem 120% em corrida, D-067).

-- ── A-06 ────────────────────────────────────────────────────────────────────
-- Antes, pelo cadastro, um lote podia virar ou deixar de ser "permuta" livremente; com isso um
-- lote entregue ao dono da terra voltava ao estoque e podia ser vendido. Agora:
--   • entrar em "permuta" só por criar_permuta (que liga app.transicao_lote);
--   • sair de "permuta" é recusado enquanto o lote estiver numa permuta física vigente;
--   • lote marcado "permuta" sem contrato (cadastros antigos) pode ser liberado pelo cadastro.
create or replace function privado.validar_status_lote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.transicao_lote', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.status in ('reservado', 'vendido', 'permuta') then
    raise exception 'Lote não pode ser cadastrado como %; use o fluxo comercial ou a permuta.', new.status
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status in ('reservado', 'vendido') or old.status in ('reservado', 'vendido') then
      raise exception 'Transição de % para % só pelo fluxo comercial ou distrato (RN-C04).',
        old.status, new.status
        using errcode = 'check_violation';
    end if;
    if new.status = 'permuta' then
      raise exception 'Lote só passa a permuta por um contrato de permuta física (RN-T01).'
        using errcode = 'check_violation', hint = 'permuta';
    end if;
    if old.status = 'permuta' and exists (
      select 1 from public.permuta_lotes pl join public.permutas p on p.id = pl.permuta_id
       where pl.lote_id = old.id and p.tipo = 'fisica' and p.situacao = 'vigente'
    ) then
      raise exception 'Lote de permuta física vigente não volta ao estoque (RN-T01).'
        using errcode = 'check_violation', hint = 'permuta';
    end if;
  end if;
  return new;
end;
$$;

-- ── A-08 ────────────────────────────────────────────────────────────────────
-- A política "dono altera o tenant" libera a linha inteira; o plano é contrato com a plataforma.
-- Pela API (authenticated/anon) o plano não muda; a troca é feita pela plataforma (SQL/serviço).
create function privado.proteger_plano()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plano_id is distinct from old.plano_id and current_user in ('authenticated', 'anon') then
    raise exception 'O plano é alterado pela plataforma, não pelo cliente (RN-G07).'
      using errcode = 'insufficient_privilege', hint = 'plano';
  end if;
  return new;
end;
$$;
create trigger proteger_plano before update on public.tenants
  for each row execute function privado.proteger_plano();

-- ── A-09 ────────────────────────────────────────────────────────────────────
-- A soma ≤ 100% era conferida sem trava: duas definições simultâneas na mesma SPE passavam.
-- A trava por SPE serializa as definições (mesmo padrão de verificar_limite_lotes).
create or replace function public.definir_participacao(p_spe uuid, p_socio uuid, p_percentual numeric, p_inicio date, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.spes;
  v_id uuid;
  v_total numeric;
begin
  select * into s from public.spes where id = p_spe;
  if s.id is null or not privado.pode('socios.gerenciar', s.tenant_id) then
    raise exception 'Sem permissão para alterar participações.' using errcode = 'insufficient_privilege';
  end if;
  -- Serializa as definições da mesma SPE até o fim da transação (A-09).
  perform pg_advisory_xact_lock(hashtextextended('participacoes:' || s.id::text, 0));
  if not exists (select 1 from public.socios where id = p_socio and tenant_id = s.tenant_id) then
    raise exception 'Sócio não encontrado.' using errcode = 'foreign_key_violation';
  end if;
  if p_inicio is null or length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe a data de início e o motivo.' using errcode = 'check_violation';
  end if;
  perform set_config('app.carteira', 'on', true);
  perform set_config('app.motivo', p_motivo, true);
  delete from public.participacoes where spe_id = s.id and socio_id = p_socio and lower(vigencia) >= p_inicio;
  update public.participacoes set vigencia = daterange(lower(vigencia), p_inicio)
   where spe_id = s.id and socio_id = p_socio and vigencia @> p_inicio;
  if coalesce(p_percentual, 0) > 0 then
    insert into public.participacoes (tenant_id, spe_id, socio_id, percentual, vigencia, motivo)
    values (s.tenant_id, s.id, p_socio, p_percentual, daterange(p_inicio, null), trim(p_motivo))
    returning id into v_id;
  end if;
  -- Nenhuma data com participações somando mais de 100%.
  select max(t) into v_total from (
    select sum(p.percentual) as t
      from public.participacoes p
      join (select distinct lower(vigencia) as d from public.participacoes where spe_id = s.id) datas
        on p.vigencia @> datas.d
     where p.spe_id = s.id
     group by datas.d
  ) x;
  if v_total > 1 then
    raise exception 'As participações da SPE passariam de 100%%.' using errcode = 'check_violation', hint = 'percentual';
  end if;
  perform set_config('app.carteira', '', true);
  return v_id;
end;
$$;
