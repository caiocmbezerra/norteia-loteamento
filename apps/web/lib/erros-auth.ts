/**
 * Mensagens em português para os erros do Supabase Auth no cadastro.
 * Códigos: https://supabase.com/docs/guides/auth/debugging/error-codes
 */
const MENSAGENS: Record<string, string> = {
  email_address_invalid:
    'Este e-mail não parece válido para receber mensagens. Confira o endereço.',
  email_address_not_authorized:
    'O envio de e-mails de confirmação ainda não está liberado para este endereço. Fale com o suporte da NorteIA.',
  over_email_send_rate_limit: 'Muitos cadastros em pouco tempo. Tente de novo em alguns minutos.',
  over_request_rate_limit: 'Muitas tentativas em pouco tempo. Tente de novo em alguns minutos.',
  weak_password:
    'Essa senha é muito comum ou já apareceu em vazamentos de dados na internet. Escolha outra, misturando letras, números e símbolos.',
  user_already_exists: 'Já existe uma conta com este e-mail. Use “Entrar”.',
  email_exists: 'Já existe uma conta com este e-mail. Use “Entrar”.',
  signup_disabled: 'Novos cadastros estão temporariamente desativados.',
}

export function mensagemErroCadastro(codigo: string | undefined): string {
  return (
    (codigo && MENSAGENS[codigo]) ||
    'Não foi possível criar a conta agora. Tente novamente em instantes.'
  )
}
