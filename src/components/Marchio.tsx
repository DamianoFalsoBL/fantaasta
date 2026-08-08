/**
 * Il marchio, disegnato invece che caricato.
 *
 * Un SVG in linea non costa una richiesta di rete, si adatta al testo che gli
 * sta accanto (`1em`) e resta nitido su qualunque schermo. La stessa forma
 * vive in `src/app/icon.svg`, da cui Next ricava la favicon: sostituendo
 * quei due file si cambia identita' visiva senza toccare altro.
 */
export default function Marchio({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={`h-[1.1em] w-[1.1em] shrink-0 ${className}`}
      role="img"
      aria-label="FantaAsta"
    >
      <defs>
        <linearGradient id="marchio-fondo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c46f0" />
          <stop offset="1" stopColor="#3d1f7a" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#marchio-fondo)" />
      <path
        fill="#00ff87"
        fillRule="evenodd"
        d="M32 12.5 49.5 51.5h-8.2l-2.9-7H25.6l-2.9 7h-8.2L32 12.5Zm0 14.8-3.7 9.4h7.4L32 27.3Z"
      />
    </svg>
  )
}
