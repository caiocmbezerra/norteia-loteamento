import { Cabecalho } from '@/components/cabecalho'
import { exigirContexto } from '@/lib/contexto'

export default async function LayoutInterno({ children }: { children: React.ReactNode }) {
  const ctx = await exigirContexto()
  return (
    <>
      <Cabecalho ctx={ctx} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:py-8">
        {children}
      </main>
    </>
  )
}
