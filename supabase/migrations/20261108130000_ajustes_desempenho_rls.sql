-- Ajustes apontados pelos verificadores de desempenho do Supabase (D-025).

-- 1. auth.uid() avaliado uma vez por consulta, não por linha.
drop policy "usuário lê o próprio perfil e o de colegas" on public.perfis;
create policy "usuário lê o próprio perfil e o de colegas" on public.perfis
  for select to authenticated using (id = (select auth.uid()) or privado.e_colega(id));

drop policy "usuário altera o próprio perfil" on public.perfis;
create policy "usuário altera o próprio perfil" on public.perfis
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy "membro vê a si mesmo; dono vê todos" on public.membros;
create policy "membro vê a si mesmo; dono vê todos" on public.membros
  for select to authenticated
  using (usuario_id = (select auth.uid()) or privado.pode('membros.gerenciar', tenant_id));

drop policy "membro vê os próprios papéis; dono vê todos" on public.atribuicoes_papel;
create policy "membro vê os próprios papéis; dono vê todos" on public.atribuicoes_papel
  for select to authenticated using (
    privado.pode('membros.gerenciar', tenant_id)
    or exists (
      select 1 from public.membros m
       where m.id = atribuicoes_papel.membro_id and m.usuario_id = (select auth.uid())
    )
  );

-- 2. Uma política de leitura por tabela: escrita separada por operação.
do $$
declare
  t text;
begin
  foreach t in array array['etapas', 'quadras', 'lotes'] loop
    execute format('drop policy "editar %s" on public.%I', t, t);
    execute format(
      'create policy "criar %1$s" on public.%1$I for insert to authenticated
         with check (privado.pode(''empreendimento.editar'', tenant_id, ''empreendimento'', empreendimento_id))', t);
    execute format(
      'create policy "alterar %1$s" on public.%1$I for update to authenticated
         using (privado.pode(''empreendimento.editar'', tenant_id, ''empreendimento'', empreendimento_id))
         with check (privado.pode(''empreendimento.editar'', tenant_id, ''empreendimento'', empreendimento_id))', t);
    execute format(
      'create policy "excluir %1$s" on public.%1$I for delete to authenticated
         using (privado.pode(''empreendimento.editar'', tenant_id, ''empreendimento'', empreendimento_id))', t);
  end loop;
end;
$$;

-- 3. Índices para as chaves estrangeiras.
create index atribuicoes_papel_membro_idx on public.atribuicoes_papel (tenant_id, membro_id);
create index convites_tenant_idx on public.convites (tenant_id);
create index empreendimentos_gleba_idx on public.empreendimentos (tenant_id, gleba_id) where gleba_id is not null;
create index empreendimentos_tenant_spe_idx on public.empreendimentos (tenant_id, spe_id);
create index lotes_tenant_empreendimento_idx on public.lotes (tenant_id, empreendimento_id);
create index lotes_quadra_fk_idx on public.lotes (tenant_id, empreendimento_id, quadra_id);
create index parametro_valores_tenant_idx on public.parametro_valores (tenant_id);
create index plano_funcionalidades_funcionalidade_idx on public.plano_funcionalidades (funcionalidade);
create index quadras_etapa_idx on public.quadras (tenant_id, empreendimento_id, etapa_id) where etapa_id is not null;
create index spes_tenant_empresa_idx on public.spes (tenant_id, empresa_id);
create index tenants_plano_idx on public.tenants (plano_id);

-- Substituídos pelos índices compostos acima.
drop index public.spes_empresa_idx;
drop index public.empreendimentos_spe_idx;
