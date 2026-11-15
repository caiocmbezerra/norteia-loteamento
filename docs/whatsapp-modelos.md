# Modelos de mensagem do WhatsApp (Cloud API da Meta)

Modelos a cadastrar na conta do WhatsApp Business da plataforma, em **Gerenciador do WhatsApp →
Modelos de mensagem → Criar modelo**. Todos são da categoria **Utilidade** (avisos sobre um
contrato que o comprador já tem), idioma **Português (BR)**. A Meta aprova cada modelo antes do
uso; as variáveis `{{1}}`, `{{2}}`… são preenchidas pelo sistema em cada envio.

Regras seguidas: mensagem curta, sem promoção, com a loteadora identificada, e saída clara para
quem não quer mais receber (RN-K10). Horários e frequência a confirmar com o advogado de cada
cliente. // VALIDAR COM ADVOGADO (PL-16)

O envio pelo sistema seguirá o do e-mail (D-115): desligado até a loteadora ligar em Parâmetros,
uma vez por parcela e etapa, com registro de cada mensagem e respeito ao descadastro.

---

## 1. `lembrete_vencimento`

- **Categoria:** Utilidade · **Idioma:** pt_BR
- **Cabeçalho:** nenhum
- **Corpo:**

```
Olá, {{1}}! Aqui é da {{2}}.
A parcela {{3}} do seu lote ({{4}}) vence em {{5}}, no valor de {{6}}.
Boleto e Pix: {{7}}
Se já pagou, desconsidere esta mensagem.
```

- **Rodapé:** `Para não receber mais lembretes, responda SAIR.`
- **Exemplo para a Meta:** {{1}} Ana · {{2}} Loteadora Exemplo · {{3}} 11 · {{4}} Residencial
  Exemplo, Quadra A, Lote 1 · {{5}} 15/12/2026 · {{6}} R$ 899,27 · {{7}}
  https://www.norteialoteamento.com.br/portal

## 2. `parcela_vence_hoje`

- **Corpo:**

```
Olá, {{1}}! Aqui é da {{2}}.
A parcela {{3}} do seu lote ({{4}}) vence hoje, no valor de {{5}}.
Boleto e Pix: {{6}}
Se já pagou, desconsidere esta mensagem.
```

- **Rodapé:** `Para não receber mais lembretes, responda SAIR.`

## 3. `parcela_em_atraso`

- **Corpo:**

```
Olá, {{1}}! Aqui é da {{2}}.
Não identificamos o pagamento da parcela {{3}} do seu lote ({{4}}), vencida em {{5}}.
Para pagar com boleto ou Pix, acesse: {{6}}
Se já pagou, desconsidere esta mensagem. Dúvidas, fale com a gente por aqui.
```

- **Rodapé:** `Para não receber mais lembretes, responda SAIR.`

## 4. `resposta_chamado`

- **Corpo:**

```
Olá, {{1}}! A {{2}} respondeu ao seu chamado "{{3}}".
Veja a resposta e continue a conversa no portal: {{4}}
```

## 5. `convite_portal`

- **Corpo:**

```
Olá! A {{1}} convidou você para acompanhar o seu contrato pelo celular: parcelas, segunda via
do boleto e extratos.
Para entrar, use o mesmo e-mail em que recebeu o convite: {{2}}
```

---

## Depois da aprovação

1. Me envie, pelo formulário seguro, o **token permanente** do usuário do sistema e me informe o
   **ID do número de telefone** (não é segredo; aparece em WhatsApp → Configuração da API).
2. Eu ligo o envio no sistema com esses modelos, desligado até cada loteadora ativar em
   Parâmetros, e faço um envio de teste para um número seu.
3. O "SAIR" passa a descadastrar o comprador automaticamente (aviso de mensagem recebida da Meta).
