import Link from 'next/link'

export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Link href="/" className="text-sm font-semibold uppercase tracking-wide text-primary">
        NorteIA Loteamento
      </Link>
      {children}
    </main>
  )
}
