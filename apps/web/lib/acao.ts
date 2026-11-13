import { ErroAplicacao } from '@norteia/aplicacao'
import { errosPorCampo } from '@norteia/dominio'
import { ZodError } from 'zod'

/** Estado devolvido pelas Server Actions de formulário. */
export interface EstadoFormulario {
  erro?: string
  erros?: Record<string, string>
  valores?: Record<string, string>
  ok?: string
  /** Informação extra ao lado do sucesso (ex.: se o e-mail saiu). */
  detalhe?: string
}

export function valoresDoFormulario(form: FormData): Record<string, string> {
  const valores: Record<string, string> = {}
  for (const [k, v] of form.entries()) if (typeof v === 'string') valores[k] = v
  return valores
}

/** Converte erros conhecidos em estado de formulário; erros inesperados sobem. */
export function estadoDeErro(e: unknown, form: FormData): EstadoFormulario {
  const valores = valoresDoFormulario(form)
  if (e instanceof ZodError)
    return { erros: errosPorCampo(e), valores, erro: 'Confira os campos destacados.' }
  if (e instanceof ErroAplicacao) {
    return e.campo ? { erros: { [e.campo]: e.message }, valores } : { erro: e.message, valores }
  }
  throw e
}
