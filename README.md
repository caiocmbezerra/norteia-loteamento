# NorteIA Loteamento

Plataforma SaaS para pequenos e médios loteadores, com um **motor financeiro único**: cada custo, parcela, aporte e repasse alimenta, em tempo real, o retorno e a necessidade de caixa de cada empreendimento e de cada sócio.

- Arquitetura: [`docs/arquitetura.md`](docs/arquitetura.md)
- Domínio e regras de negócio: [`docs/dominio.md`](docs/dominio.md)
- Roadmap: [`docs/roadmap.md`](docs/roadmap.md)
- Decisões: [`docs/decisoes.md`](docs/decisoes.md)
- Pendências legais e tributárias: [`docs/pendencias-legais.md`](docs/pendencias-legais.md)

## Estrutura

```
apps/web                    Next.js (painel, campo mobile, portais)
packages/motor-financeiro   Motor puro: dinheiro, fluxo, TIR, VPL, payback (100% coberto)
packages/dominio            Regras, entidades, formatos pt-BR
packages/projecao           Registros do banco → lançamentos do fluxo
packages/integracoes        Portas e adaptadores (Asaas, Clicksign, WhatsApp…)
packages/db                 Tipos e repositórios do Supabase
packages/aplicacao          Casos de uso
packages/ui                 Componentes compartilhados
supabase/                   Migrations, testes pgTAP, Edge Functions, seed
```

## Desenvolvimento

Requisitos: Node 22, pnpm 10 e Docker (para o Supabase local).

```bash
pnpm install
pnpm dev                    # http://localhost:3000
pnpm test                   # testes unitários (motor exige 100% de cobertura)
pnpm lint                   # inclui as fronteiras entre pacotes
pnpm test:fronteiras        # prova que as fronteiras estão ativas
pnpm typecheck
pnpm exec supabase start    # banco local
pnpm db:test                # testes pgTAP
pnpm test:e2e               # Playwright (celular e desktop)
```

## Convenções

- Interface, mensagens, commits e documentação em **português do Brasil**.
- Commits pequenos no formato `tipo(escopo): descrição` — ex.: `feat(motor): calcula payback descontado`.
- Dinheiro sempre em `Centavos` (inteiro); cálculos com `Decimal`. Nunca `number` com casas decimais.
- Regras de negócio citadas pelo número (`RN-F03`) no código e nos testes.
- Pontos legais incertos: `// VALIDAR COM CONTADOR` ou `// VALIDAR COM ADVOGADO`, listados em `docs/pendencias-legais.md`.
- Schema do banco muda **somente** por migration versionada em `supabase/migrations`.
