-- Fase 2b: estudos de viabilidade e plano original imutável (RN-F16).
-- O cálculo é feito pelo motor (packages/motor-financeiro); o banco guarda premissas e,
-- na aprovação, uma "foto" imutável das premissas e dos indicadores.

-- Permissões novas
insert into public.papel_permissoes (papel, permissao) values
  ('dono', 'financeiro.ler'),
  ('financeiro', 'financeiro.ler'),
  ('contador', 'financeiro.ler'),
  ('engenharia', 'financeiro.ler'),
  ('socio_leitura', 'financeiro.ler'),
  ('dono', 'viabilidade.editar'),
  ('financeiro', 'viabilidade.editar'),
  ('engenharia', 'viabilidade.editar'),
  ('dono', 'plano.aprovar');

-- Parâmetro tributário usado pela viabilidade (sem valor padrão: depende do regime — PL-07).
insert into public.parametros (chave, descricao, tipo, unidade, pendencia_legal) values
  ('tributario.aliquota_sobre_recebido', 'Alíquota total de tributos sobre o valor recebido (regime da SPE)', 'decimal', 'fração', 'PL-07');

create type public.viabilidade_situacao as enum ('rascunho', 'aprovada', 'arquivada');

create table public.viabilidades (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  empreendimento_id uuid not null,
  nome text not null check (length(trim(nome)) >= 2),
  situacao public.viabilidade_situacao not null default 'rascunho',
  -- Premissas no formato do motor (decimais como texto). Validadas pela aplicação (zod).
  premissas jsonb not null check (jsonb_typeof(premissas) = 'object'),
  tma_mensal numeric(12, 8) not null check (tma_mensal > -1),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, id),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete cascade
);

create index viabilidades_empreendimento_idx on public.viabilidades (tenant_id, empreendimento_id);

-- Foto imutável do plano aprovado. Versão 1 = plano original; seguintes = revisões.
create table public.plano_versoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  empreendimento_id uuid not null,
  viabilidade_id uuid not null,
  versao integer not null check (versao >= 1),
  premissas jsonb not null,
  tma_mensal numeric(12, 8) not null,
  -- Indicadores e fluxo mensal calculados pelo motor no momento da aprovação.
  resumo jsonb not null,
  motivo text,
  aprovado_em timestamptz not null default now(),
  aprovado_por uuid not null,
  unique (empreendimento_id, versao),
  foreign key (tenant_id, empreendimento_id) references public.empreendimentos (tenant_id, id) on delete restrict,
  foreign key (tenant_id, viabilidade_id) references public.viabilidades (tenant_id, id) on delete restrict,
  check (versao = 1 or length(trim(coalesce(motivo, ''))) >= 5)
);

create index plano_versoes_viabilidade_idx on public.plano_versoes (tenant_id, viabilidade_id);

comment on table public.plano_versoes is
  'RN-F16: plano original (versão 1) e revisões. Imutável: só inserção, pela função aprovar_viabilidade.';

create function privado.plano_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Versões do plano são imutáveis; crie uma revisão (RN-F16).'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger plano_imutavel
  before update or delete on public.plano_versoes
  for each row execute function privado.plano_imutavel();

-- ---------------------------------------------------------------------------
-- Aprovação (RN-F16): só o dono; revisão exige motivo; a viabilidade fica "aprovada".
-- ---------------------------------------------------------------------------

create function public.aprovar_viabilidade(p_viabilidade uuid, p_resumo jsonb, p_motivo text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.viabilidades;
  v_versao integer;
begin
  select * into v from public.viabilidades where id = p_viabilidade for update;
  if v.id is null or not privado.pode('plano.aprovar', v.tenant_id, 'empreendimento', v.empreendimento_id) then
    raise exception 'Somente o dono aprova o plano do empreendimento.' using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('plano:' || v.empreendimento_id::text, 0));
  select coalesce(max(versao), 0) + 1 into v_versao
    from public.plano_versoes where empreendimento_id = v.empreendimento_id;

  if v_versao > 1 and length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da revisão do plano (RN-F16).' using errcode = 'check_violation';
  end if;

  perform set_config('app.motivo', coalesce(p_motivo, 'Aprovação do plano original'), true);

  insert into public.plano_versoes
    (tenant_id, empreendimento_id, viabilidade_id, versao, premissas, tma_mensal, resumo, motivo, aprovado_por)
  values
    (v.tenant_id, v.empreendimento_id, v.id, v_versao, v.premissas, v.tma_mensal, p_resumo, p_motivo, auth.uid());

  update public.viabilidades set situacao = 'arquivada'
   where empreendimento_id = v.empreendimento_id and situacao = 'aprovada' and id <> v.id;
  update public.viabilidades set situacao = 'aprovada' where id = v.id;

  return v_versao;
end;
$$;

revoke execute on function public.aprovar_viabilidade(uuid, jsonb, text) from public, anon;
grant execute on function public.aprovar_viabilidade(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: dados financeiros não são visíveis ao corretor (RN-C07).
-- ---------------------------------------------------------------------------

alter table public.viabilidades enable row level security;
alter table public.plano_versoes enable row level security;

create policy "ler viabilidades" on public.viabilidades for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id, 'empreendimento', empreendimento_id));
create policy "criar viabilidades" on public.viabilidades for insert to authenticated
  with check (privado.pode('viabilidade.editar', tenant_id, 'empreendimento', empreendimento_id));
-- Estudo aprovado não muda: para alterar, crie outro estudo e aprove como revisão.
create policy "alterar viabilidades em rascunho" on public.viabilidades for update to authenticated
  using (situacao = 'rascunho' and privado.pode('viabilidade.editar', tenant_id, 'empreendimento', empreendimento_id))
  with check (situacao = 'rascunho' and privado.pode('viabilidade.editar', tenant_id, 'empreendimento', empreendimento_id));
create policy "excluir viabilidades em rascunho" on public.viabilidades for delete to authenticated
  using (situacao = 'rascunho' and privado.pode('viabilidade.editar', tenant_id, 'empreendimento', empreendimento_id));

create policy "ler plano" on public.plano_versoes for select to authenticated
  using (privado.pode('financeiro.ler', tenant_id, 'empreendimento', empreendimento_id));
revoke insert, update, delete, truncate on public.plano_versoes from authenticated, anon;

select privado.instrumentar('public.viabilidades');

-- plano_versoes não tem colunas de alteração (é imutável): só auditoria.
create trigger auditar after insert on public.plano_versoes
  for each row execute function privado.auditar();
