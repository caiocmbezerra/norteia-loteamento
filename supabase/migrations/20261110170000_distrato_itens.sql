-- Distrato: itens de desconto de cada cliente (documentação, taxas…) e teto de cláusula penal +
-- despesas administrativas (art. 32-A, II). Decisão do dono do produto em 10/11/2026: padrão 10%,
-- ajustável por cliente; cada item diz se conta dentro do teto. // VALIDAR COM ADVOGADO (PL-02)

insert into public.parametros (chave, descricao, tipo, unidade, pendencia_legal) values
  ('distrato.limite_penal', 'Teto de cláusula penal + despesas administrativas no distrato (só avisa quando excedido)', 'decimal', 'fração', 'PL-02');
insert into public.parametro_valores (tenant_id, chave, escopo, escopo_id, valor, vigencia, motivo) values
  (null, 'distrato.limite_penal', 'plataforma', null, '0.10', daterange('2026-01-01', null), 'Sugestão da plataforma (art. 32-A, II: até 10%)');

create table public.itens_desconto_distrato (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 80),
  -- Conta junto com a cláusula penal no teto do art. 32-A, II (despesa administrativa).
  dentro_do_limite boolean not null default true,
  valor_padrao_centavos bigint check (valor_padrao_centavos is null or valor_padrao_centavos >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (tenant_id, nome)
);

comment on table public.itens_desconto_distrato is
  'Custos que cada loteadora desconta no distrato além dos previstos em lei; o valor é confirmado em cada distrato.';

alter table public.itens_desconto_distrato enable row level security;
create policy "ler itens de desconto" on public.itens_desconto_distrato for select to authenticated
  using (privado.pode('carteira.ler', tenant_id) or privado.pode('parametros.ler', tenant_id));
create policy "cadastrar itens de desconto" on public.itens_desconto_distrato for insert to authenticated
  with check (privado.pode('parametros.editar', tenant_id));
create policy "alterar itens de desconto" on public.itens_desconto_distrato for update to authenticated
  using (privado.pode('parametros.editar', tenant_id)) with check (privado.pode('parametros.editar', tenant_id));
revoke delete, truncate on public.itens_desconto_distrato from authenticated, anon;
select privado.instrumentar('public.itens_desconto_distrato');
