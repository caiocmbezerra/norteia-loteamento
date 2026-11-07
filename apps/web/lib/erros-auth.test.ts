import { describe, expect, it } from 'vitest'
import { mensagemErroCadastro } from './erros-auth'

describe('mensagemErroCadastro', () => {
  it('explica o e-mail recusado pelo servidor de e-mail', () => {
    expect(mensagemErroCadastro('email_address_invalid')).toContain('Confira o endereço')
  })
  it('explica o limite de envio', () => {
    expect(mensagemErroCadastro('over_email_send_rate_limit')).toContain('alguns minutos')
  })
  it('orienta quem já tem conta', () => {
    expect(mensagemErroCadastro('user_already_exists')).toContain('Entrar')
  })
  it('tem mensagem padrão para códigos desconhecidos ou ausentes', () => {
    expect(mensagemErroCadastro('codigo_novo')).toContain('Tente novamente')
    expect(mensagemErroCadastro(undefined)).toContain('Tente novamente')
  })
})
