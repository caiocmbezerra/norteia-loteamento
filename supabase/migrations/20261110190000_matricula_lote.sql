-- Matrícula de cada lote (L3, decisão do dono do produto em 10/11/2026): o cartório de registro
-- de imóveis abre a matrícula depois do registro do loteamento; o sistema só guarda o número e a
-- data, preenchidos pela equipe da loteadora (mesma permissão de editar o cadastro do lote).
alter table public.lotes
  add column matricula text check (matricula is null or length(trim(matricula)) between 1 and 40),
  add column matricula_aberta_em date,
  add constraint lotes_matricula_data check (matricula_aberta_em is null or matricula is not null);

comment on column public.lotes.matricula is 'Número da matrícula do lote no cartório de registro de imóveis.';
comment on column public.lotes.matricula_aberta_em is 'Data de abertura da matrícula do lote.';
