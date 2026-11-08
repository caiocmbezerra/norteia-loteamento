import { describe, expect, it } from 'vitest'
import {
  ErroModelo,
  TIPOS_DOCUMENTO,
  modeloPadrao,
  preencherModelo,
  textoDoDocumento,
} from './index'

const dados = {
  vendedora_razao_social: 'Loteadora Exemplo SPE Ltda',
  comprador_nome: 'Joana Compradora',
  lote_numero: '7',
  lote_quadra: 'B',
  venda_preco: 'R$ 90.000,00',
  parcelas: [
    { numero: '1', vencimento: '10/12/2026', valor: 'R$ 899,27' },
    { numero: '2', vencimento: '10/01/2027', valor: 'R$ 899,27' },
  ],
}

describe('modelos de documento', () => {
  it('todos os modelos padrão preenchem sem erro', () => {
    for (const tipo of TIPOS_DOCUMENTO) {
      const texto = textoDoDocumento(preencherModelo(modeloPadrao(tipo), dados))
      expect(texto).toContain('Loteadora Exemplo SPE Ltda')
      expect(texto).not.toMatch(/\{[a-z_#/]+\}/)
    }
  })

  it('contrato traz os dados e uma linha por parcela', () => {
    const texto = textoDoDocumento(preencherModelo(modeloPadrao('contrato'), dados))
    expect(texto).toContain('Joana Compradora')
    expect(texto).toContain('Lote 7 da Quadra B')
    expect(texto).toContain('10/12/2026')
    expect(texto).toContain('10/01/2027')
  })

  it('recusa arquivo que não é Word ou com marcador quebrado', () => {
    expect(() => preencherModelo(new Uint8Array([1, 2, 3]), dados)).toThrow(ErroModelo)
  })
})
