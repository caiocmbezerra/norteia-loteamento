import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { gerarExtratoPdf } from './extrato-pdf'

const base = {
  titulo: 'Extrato do contrato nº 12',
  identificacao: [
    ['Loteadora', 'Loteadora Ação & Cia'],
    ['Comprador', 'João Conceição'],
  ] as [string, string][],
  resumo: [['Saldo a pagar', 'R$ 81.000,00']] as [string, string][],
  rodape: 'Emitido em 10/11/2026 — NorteIA',
}

describe('gerarExtratoPdf', () => {
  it('gera um PDF válido com acentos do português', async () => {
    const bytes = await gerarExtratoPdf({
      ...base,
      parcelas: [
        {
          numero: '1',
          vencimento: '10/12/2026',
          valor: 'R$ 900,00',
          pago: 'R$ 0,00',
          situacao: 'Aberta',
        },
      ],
      pagamentos: [],
    })
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getTitle()).toBe('Extrato do contrato nº 12')
  })

  it('quebra em várias páginas quando há muitas parcelas', async () => {
    const parcelas = Array.from({ length: 150 }, (_, i) => ({
      numero: String(i + 1),
      vencimento: '10/12/2026',
      valor: 'R$ 900,00',
      pago: 'R$ 900,00',
      situacao: 'Paga',
    }))
    const pagamentos = parcelas.map((p) => ({
      data: '10/12/2026',
      parcela: p.numero,
      valor: p.valor,
    }))
    const doc = await PDFDocument.load(await gerarExtratoPdf({ ...base, parcelas, pagamentos }))
    expect(doc.getPageCount()).toBeGreaterThan(3)
  })
})
