/** Erro de caso de uso com mensagem pronta para o usuário (pt-BR). */
export class ErroAplicacao extends Error {
  override readonly name = 'ErroAplicacao'
  constructor(
    message: string,
    readonly codigo: string = 'erro',
    readonly campo?: string,
  ) {
    super(message)
  }
}

interface ErroBanco {
  code?: string
  message: string
  hint?: string | null
}

/**
 * Traduz erros do Postgres/PostgREST. As exceções lançadas pelas nossas funções e
 * gatilhos já vêm em português; as do próprio banco ganham uma mensagem amigável.
 */
export function traduzirErroBanco(erro: ErroBanco): ErroAplicacao {
  switch (erro.code) {
    case '42501':
      return new ErroAplicacao(
        erro.message.startsWith('new row violates') || erro.message.startsWith('permission denied')
          ? 'Você não tem permissão para esta ação.'
          : erro.message,
        'sem_permissao',
      )
    case '23505':
      return new ErroAplicacao('Já existe um registro com esses dados.', 'duplicado')
    case '23503':
      return new ErroAplicacao(
        'Este registro está ligado a outros e não pode ser removido.',
        'em_uso',
      )
    case '23514':
    case '22023':
    case 'P0001':
      return new ErroAplicacao(
        /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(erro.message) ? erro.message : 'Dados inválidos.',
        erro.hint ?? 'invalido',
      )
    default:
      return new ErroAplicacao(
        'Não foi possível concluir a operação. Tente novamente.',
        'inesperado',
      )
  }
}
