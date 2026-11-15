-- Revisão do fim do ciclo (advisors do Supabase em 15/11/2026): índices que cobrem chaves
-- estrangeiras compostas ainda sem índice próprio. Os demais alertas são intencionais
-- (funções públicas com proteção própria; funções de negócio que conferem permissão por dentro).
create index if not exists medicoes_conta_idx on public.medicoes (tenant_id, conta_id);
create index if not exists tabela_preco_itens_tenant_lote_idx on public.tabela_preco_itens (tenant_id, lote_id);
create index if not exists usos_credito_recebimento_idx on public.usos_credito (tenant_id, recebimento_id) where recebimento_id is not null;
