-- Índices para chaves estrangeiras apontadas pelo verificador de desempenho do Supabase.

create index corretores_usuario_idx on public.corretores (usuario_id) where usuario_id is not null;
create index importacoes_empreendimento_idx on public.importacoes (tenant_id, empreendimento_id);
create index plano_versoes_empreendimento_fk_idx on public.plano_versoes (tenant_id, empreendimento_id);
create index regras_contabeis_conta_debito_idx on public.regras_contabeis (tenant_id, conta_debito);
create index regras_contabeis_conta_credito_idx on public.regras_contabeis (tenant_id, conta_credito);
create index vendas_importacao_idx on public.vendas (importacao_id) where importacao_id is not null;
