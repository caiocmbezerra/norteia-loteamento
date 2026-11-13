/**
 * Vista aérea ilustrada de um loteamento (quadras, lotes, avenida, lago e áreas verdes), usada
 * no fundo das telas públicas. Desenho próprio em SVG: leve, nítido em qualquer tela e sem
 * dependência de imagem externa.
 */
const LOTE = ['#f4efe0', '#ece4cd', '#dfe9cf', '#f2dcae', '#e6efe0']
const TELHADO = ['#c8693f', '#b5523a', '#8f5b3b', '#d48a54']

// Pseudoaleatório determinístico (o desenho é igual no servidor e no navegador).
const sorteio = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function Quadra({ x, y, semente }: { x: number; y: number; semente: number }) {
  const lotes = []
  for (let linha = 0; linha < 2; linha++) {
    for (let col = 0; col < 6; col++) {
      const i = semente * 12 + linha * 6 + col
      const lx = x + 4 + col * 22
      const ly = y + 4 + linha * 30
      const casa = sorteio(i) > 0.55
      lotes.push(
        <g key={`${linha}-${col}`}>
          <rect
            x={lx}
            y={ly}
            width={20}
            height={28}
            rx={1.5}
            fill={LOTE[Math.floor(sorteio(i + 7) * LOTE.length)]}
          />
          {casa && (
            <>
              <rect
                x={lx + 4}
                y={ly + (linha === 0 ? 4 : 12)}
                width={12}
                height={11}
                rx={1}
                fill={TELHADO[Math.floor(sorteio(i + 3) * TELHADO.length)]}
              />
              <rect
                x={lx + 4}
                y={ly + (linha === 0 ? 4 : 12)}
                width={12}
                height={5}
                rx={1}
                fill="#ffffff"
                opacity={0.18}
              />
            </>
          )}
          {!casa && sorteio(i + 11) > 0.6 && (
            <circle cx={lx + 10} cy={ly + 14} r={4} fill="#4f8a4c" opacity={0.9} />
          )}
        </g>,
      )
    }
  }
  return (
    <g>
      <rect x={x} y={y} width={140} height={68} rx={4} fill="#c9c2b0" />
      {lotes}
    </g>
  )
}

function Arvores({ pontos }: { pontos: [number, number, number][] }) {
  return (
    <g>
      {pontos.map(([cx, cy, r], i) => (
        <g key={i}>
          <circle cx={cx + 2} cy={cy + 3} r={r} fill="#173f28" opacity={0.35} />
          <circle cx={cx} cy={cy} r={r} fill={i % 3 === 0 ? '#3f7d45' : '#356f3d'} />
          <circle cx={cx - r / 3} cy={cy - r / 3} r={r / 2.4} fill="#5c9a57" opacity={0.7} />
        </g>
      ))}
    </g>
  )
}

export function IlustracaoLoteamento({ className }: { className?: string }) {
  const quadras: { x: number; y: number }[] = []
  for (let qy = 0; qy < 6; qy++)
    for (let qx = 0; qx < 4; qx++) quadras.push({ x: 40 + qx * 158, y: 60 + qy * 92 })
  const arvores: [number, number, number][] = []
  for (let i = 0; i < 70; i++) {
    const borda = i % 2 === 0
    arvores.push([
      borda ? 10 + sorteio(i) * 60 : 560 + sorteio(i) * 90,
      30 + sorteio(i + 50) * 760,
      7 + sorteio(i + 90) * 7,
    ])
  }
  return (
    <svg
      viewBox="0 0 680 820"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="il-campo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8fbf7a" />
          <stop offset="1" stopColor="#6fa564" />
        </linearGradient>
        <radialGradient id="il-lago" cx="0.4" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#7cc3dc" />
          <stop offset="1" stopColor="#3f8fb0" />
        </radialGradient>
      </defs>
      <rect width="680" height="820" fill="url(#il-campo)" />
      <g transform="rotate(-10 340 410)">
        {/* Ruas internas sob as quadras */}
        <rect x="30" y="50" width="640" height="560" rx="10" fill="#d7d1c2" />
        {quadras.map((q, i) => (
          <Quadra key={i} x={q.x} y={q.y} semente={i} />
        ))}
        {/* Praça central */}
        <rect x="356" y="244" width="140" height="68" rx="8" fill="#5c9a57" />
        <circle cx="426" cy="278" r="16" fill="#e9e2cc" />
        <circle cx="426" cy="278" r="7" fill="#7cc3dc" />
      </g>
      {/* Avenida de acesso */}
      <path
        d="M-20 760 C 160 700, 260 640, 330 560 S 470 380, 720 300"
        stroke="#e7e1d1"
        strokeWidth="34"
        fill="none"
      />
      <path
        d="M-20 760 C 160 700, 260 640, 330 560 S 470 380, 720 300"
        stroke="#ffffff"
        strokeWidth="2"
        strokeDasharray="14 12"
        fill="none"
        opacity="0.9"
      />
      {/* Lago e área verde */}
      <ellipse cx="120" cy="720" rx="150" ry="80" fill="#5a9a5a" />
      <ellipse cx="115" cy="725" rx="118" ry="58" fill="url(#il-lago)" />
      <ellipse cx="95" cy="712" rx="40" ry="10" fill="#ffffff" opacity="0.25" />
      <Arvores pontos={arvores} />
      <Arvores
        pontos={[
          [250, 740, 12],
          [280, 760, 10],
          [40, 640, 11],
          [205, 650, 9],
          [610, 640, 13],
          [640, 690, 11],
        ]}
      />
    </svg>
  )
}
