import { Button } from '@/components/ui/button'

// Página provisória da Fase 0. Será substituída pelo login e pelo painel na Fase 1.

const FASES = [
  { numero: 0, nome: 'Esqueleto técnico', situacao: 'em andamento' },
  { numero: 1, nome: 'Fundação: acessos, empresas, SPEs, lotes, auditoria', situacao: 'próxima' },
  { numero: 2, nome: 'Motor financeiro e viabilidade', situacao: 'planejada' },
  { numero: 3, nome: 'Custos e obra', situacao: 'planejada' },
  { numero: 4, nome: 'Comercial: mapa, reserva e venda', situacao: 'planejada' },
  { numero: 5, nome: 'Contratos, carteira e cobrança', situacao: 'planejada' },
  { numero: 6, nome: 'Distrato, permutas, sócios e painéis', situacao: 'planejada' },
  { numero: 7, nome: 'Portais, fiscal e contábil', situacao: 'planejada' },
  { numero: 8, nome: 'IA e importação de carteiras', situacao: 'planejada' },
] as const

export default function Inicio() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10 sm:py-16">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">NorteIA</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">NorteIA Loteamento</h1>
        <p className="text-base text-muted-foreground">
          Gestão de loteamentos com um motor financeiro único: cada custo, parcela, aporte e repasse
          atualiza o retorno e a necessidade de caixa de cada empreendimento e de cada sócio.
        </p>
      </header>

      <section aria-labelledby="titulo-fases" className="flex flex-col gap-3">
        <h2 id="titulo-fases" className="text-lg font-semibold">
          Construção
        </h2>
        <ol className="flex flex-col divide-y rounded-lg border bg-card">
          {FASES.map((fase) => (
            <li key={fase.numero} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm">
                <span className="mr-2 font-medium text-muted-foreground">Fase {fase.numero}</span>
                {fase.nome}
              </span>
              <span
                className={
                  fase.situacao === 'em andamento'
                    ? 'shrink-0 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground'
                    : 'shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground'
                }
              >
                {fase.situacao}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div>
        <Button asChild variant="outline">
          <a href="https://github.com/caiocmbezerra/norteia-loteamento/tree/main/docs">
            Ver documentação do projeto
          </a>
        </Button>
      </div>
    </main>
  )
}
