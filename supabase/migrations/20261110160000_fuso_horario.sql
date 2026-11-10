-- A "data de hoje" do banco passa a ser a de São Paulo, a mesma que o app usa (hojeSaoPaulo).
-- Sem isso, entre 21h e meia-noite o banco já está no dia seguinte (UTC) e regras como vigência
-- de tabela, validade de proposta e data padrão da venda divergem da tela. Horários continuam
-- gravados em UTC (timestamptz); só current_date e a exibição mudam de fuso.
alter database postgres set timezone to 'America/Sao_Paulo';
