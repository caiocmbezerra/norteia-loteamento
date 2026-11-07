import { describe, expect, it } from 'vitest'
import { ErroAplicacao, traduzirErroBanco } from './erros'

describe('traduzirErroBanco', () => {
  it('traduz falta de permissão da RLS', () => {
    const e = traduzirErroBanco({
      code: '42501',
      message: 'new row violates row-level security policy',
    })
    expect(e).toBeInstanceOf(ErroAplicacao)
    expect(e.message).toBe('Você não tem permissão para esta ação.')
    expect(e.codigo).toBe('sem_permissao')
  })

  it('mantém mensagens de permissão escritas por nós', () => {
    expect(
      traduzirErroBanco({ code: '42501', message: 'Sem permissão para convidar membros.' }).message,
    ).toBe('Sem permissão para convidar membros.')
  })

  it('mantém mensagens de regra de negócio em português e o código da dica', () => {
    const e = traduzirErroBanco({
      code: '23514',
      message: 'O plano contratado permite até 200 lotes sob gestão.',
      hint: 'plano_limite_lotes',
    })
    expect(e.message).toBe('O plano contratado permite até 200 lotes sob gestão.')
    expect(e.codigo).toBe('plano_limite_lotes')
  })

  it('esconde mensagens técnicas do banco', () => {
    expect(
      traduzirErroBanco({ code: '23514', message: 'new row for relation "lotes" violates check' })
        .message,
    ).toBe('Dados inválidos.')
    expect(traduzirErroBanco({ code: 'XX000', message: 'internal' }).codigo).toBe('inesperado')
  })

  it('traduz duplicidade e vínculo', () => {
    expect(traduzirErroBanco({ code: '23505', message: 'duplicate key' }).codigo).toBe('duplicado')
    expect(traduzirErroBanco({ code: '23503', message: 'fk' }).codigo).toBe('em_uso')
  })
})
