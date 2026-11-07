// Prova que as fronteiras entre pacotes estão ativas: cada caso abaixo DEVE ser recusado
// pelo ESLint. Se algum passar, a regra foi desligada por engano e o CI falha.
import { ESLint } from 'eslint'

const casos = [
  [
    'packages/motor-financeiro/src/_caso.ts',
    "import { createClient } from '@supabase/supabase-js'\nexport const c = createClient",
  ],
  [
    'packages/motor-financeiro/src/_caso.ts',
    "import { x } from '@norteia/dominio'\nexport const c = x",
  ],
  [
    'packages/motor-financeiro/src/_caso.ts',
    "import { readFileSync } from 'node:fs'\nexport const c = readFileSync",
  ],
  ['packages/motor-financeiro/src/_caso.ts', 'export const hoje = new Date()'],
  ['packages/motor-financeiro/src/_caso.ts', 'export const agora = Date.now()'],
  ['packages/dominio/src/_caso.ts', "import { x } from '@norteia/db'\nexport const c = x"],
  ['packages/dominio/src/_caso.ts', "import { useState } from 'react'\nexport const c = useState"],
  ['packages/ui/src/_caso.ts', "import { x } from '@norteia/aplicacao'\nexport const c = x"],
  ['packages/aplicacao/src/_caso.ts', "import { x } from 'next/headers'\nexport const c = x"],
]

const permitidos = [
  [
    'packages/dominio/src/_caso.ts',
    "import { centavos } from '@norteia/motor-financeiro'\nexport const c = centavos",
  ],
  ['packages/aplicacao/src/_caso.ts', "import { x } from '@norteia/db'\nexport const c = x"],
]

const eslint = new ESLint()
let falhas = 0

for (const [arquivo, codigo] of casos) {
  const [r] = await eslint.lintText(codigo, { filePath: arquivo })
  const recusado = r.messages.some((m) =>
    ['no-restricted-imports', 'no-restricted-syntax'].includes(m.ruleId),
  )
  if (!recusado) {
    falhas++
    console.error(`✗ deveria ser recusado: ${arquivo} → ${codigo.split('\n')[0]}`)
  } else {
    console.log(`✓ recusado: ${arquivo} → ${codigo.split('\n')[0]}`)
  }
}

for (const [arquivo, codigo] of permitidos) {
  const [r] = await eslint.lintText(codigo, { filePath: arquivo })
  const recusado = r.messages.some((m) => m.ruleId === 'no-restricted-imports')
  if (recusado) {
    falhas++
    console.error(`✗ deveria ser permitido: ${arquivo} → ${codigo.split('\n')[0]}`)
  } else {
    console.log(`✓ permitido: ${arquivo} → ${codigo.split('\n')[0]}`)
  }
}

if (falhas > 0) {
  console.error(`\n${falhas} verificação(ões) de fronteira falharam.`)
  process.exit(1)
}
console.log('\nFronteiras entre pacotes ativas.')
