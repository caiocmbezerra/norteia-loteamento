import { expect, test } from '@playwright/test'

// Fase 7d: app instalável. O manifesto e os ícones são públicos (antes do login).
test('manifesto e ícones do app instalável', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'teste de API: roda uma vez')
  const manifesto = await request.get('/manifest.webmanifest')
  expect(manifesto.status()).toBe(200)
  const m = await manifesto.json()
  expect(m).toMatchObject({
    name: 'NorteIA Loteamento',
    display: 'standalone',
    start_url: '/painel',
    lang: 'pt-BR',
  })
  for (const icone of m.icons as { src: string }[]) {
    const r = await request.get(icone.src)
    expect(r.status(), icone.src).toBe(200)
    expect(r.headers()['content-type']).toBe('image/png')
  }
})

test('a página aponta o manifesto e o ícone do iPhone', async ({ page }) => {
  await page.goto('/entrar')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  )
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/icones/apple-touch-icon.png',
  )
})
