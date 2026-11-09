import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// PDF mínimo de uma página (400 × 200 pt) com um retângulo, montado com os offsets corretos.
function pdfDeTeste(): Buffer {
  const conteudo = '0.8 g 40 40 320 120 re f'
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R >>',
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objetos.forEach((o, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

// Fase 4b (D-008): planta em PDF vira imagem de fundo e o lote desenhado leva à sua página.
test('envia a planta em PDF, desenha um lote e navega pela planta', async ({ page }, info) => {
  test.setTimeout(90_000)
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Pedro Planta')
  await page.getByLabel('E-mail').fill(`planta.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Planta')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Planta')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('2')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Planta')
  const empreendimento = page.url().split('?')[0]!

  await page.getByRole('link', { name: 'Planta', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Planta de lotes')
  await page.getByLabel('Imagem ou PDF da planta').setInputFiles({
    name: 'planta.pdf',
    mimeType: 'application/pdf',
    buffer: pdfDeTeste(),
  })
  await expect(page.getByText(/Pronta para enviar: \d+ × \d+ px/)).toBeVisible({
    timeout: 20_000,
  })
  await page.getByRole('button', { name: 'Enviar planta' }).click()
  await expect(page.getByText('Planta enviada.', { exact: false })).toBeVisible()

  // Contorno do lote 1: três toques na planta
  await expect(page.getByLabel('Lote a desenhar')).toHaveValue(/.+/)
  const editor = page.getByTestId('planta-editor')
  const caixa = (await editor.boundingBox())!
  for (const [x, y] of [
    [0.2, 0.3],
    [0.5, 0.3],
    [0.5, 0.7],
  ] as const)
    await editor.click({ position: { x: caixa.width * x, y: caixa.height * y } })
  await page.getByRole('button', { name: 'Salvar contorno' }).click()
  await expect(page.getByText('Contorno de Quadra A · Lote 1 salvo.')).toBeVisible()
  await expect(page.getByText(/1 de 2 lotes desenhados/)).toBeVisible()

  // O mapa do empreendimento abre na planta; o lote é um link com a situação
  await page.goto(empreendimento)
  await expect(page.getByRole('heading', { name: 'Planta de lotes' })).toBeVisible()
  await expect(page.getByText(/1 lote\(s\) ainda sem contorno/)).toBeVisible()
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([])
  await page.getByRole('link', { name: 'Quadra A, lote 1: Disponível' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quadra A · Lote 1')

  // A grade por quadra continua disponível
  await page.goto(empreendimento)
  await page.getByRole('link', { name: 'Por quadra', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Lotes por quadra' })).toBeVisible()
})
