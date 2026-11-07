// ESLint do monorepo. Além das regras de qualidade, impõe as fronteiras entre pacotes
// descritas em docs/arquitetura.md §3: o motor não importa nada do projeto nem I/O.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const PACOTES = ['motor-financeiro', 'dominio', 'projecao', 'integracoes', 'db', 'aplicacao', 'ui']
const FRAMEWORKS_E_IO = ['next', 'next/*', 'react', 'react/*', 'react-dom', 'react-dom/*']
const BANCO = ['@supabase/*']
const NODE_IO = ['node:*', 'fs', 'fs/*', 'http', 'https', 'net', 'child_process', 'os', 'path']

/** Proíbe importar os pacotes internos que não estão em `permitidos`. */
function internosProibidos(permitidos) {
  return PACOTES.filter((p) => !permitidos.includes(p)).map((p) => `@norteia/${p}`)
}

function fronteira(pacote, { permitidos = [], extras = [] }) {
  return {
    files: [`packages/${pacote}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [...internosProibidos([pacote, ...permitidos]), ...extras],
              message: `Fronteira violada: @norteia/${pacote} não pode depender disto (docs/arquitetura.md §3).`,
            },
          ],
        },
      ],
    },
  }
}

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      'apps/web/next-env.d.ts',
      'supabase/functions/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs', '*.mjs', '**/*.config.{mjs,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // Fronteiras entre pacotes.
  fronteira('motor-financeiro', { extras: [...BANCO, ...FRAMEWORKS_E_IO, ...NODE_IO] }),
  fronteira('dominio', {
    permitidos: ['motor-financeiro'],
    extras: [...BANCO, ...FRAMEWORKS_E_IO, ...NODE_IO],
  }),
  fronteira('projecao', {
    permitidos: ['motor-financeiro', 'dominio'],
    extras: [...BANCO, ...FRAMEWORKS_E_IO],
  }),
  fronteira('integracoes', { permitidos: ['dominio'], extras: [...BANCO, ...FRAMEWORKS_E_IO] }),
  fronteira('db', { permitidos: ['dominio'], extras: FRAMEWORKS_E_IO }),
  fronteira('aplicacao', {
    permitidos: ['motor-financeiro', 'dominio', 'projecao', 'integracoes', 'db'],
    extras: FRAMEWORKS_E_IO,
  }),
  fronteira('ui', { permitidos: ['dominio'], extras: BANCO }),

  // RN-F15: o motor é determinístico; a data de referência é sempre parâmetro.
  {
    files: ['packages/motor-financeiro/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'RN-F15: o motor não lê o relógio; receba a data de referência como parâmetro.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'RN-F15: o motor não lê o relógio; receba a data de referência como parâmetro.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'RN-F15: o motor é determinístico.',
        },
      ],
    },
  },
)
