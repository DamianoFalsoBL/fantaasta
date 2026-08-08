/**
 * Il marchio, disegnato invece che caricato.
 *
 * Un SVG in linea non costa una richiesta di rete, si adatta al testo che gli
 * sta accanto (`1em`) e resta nitido su qualunque schermo. La stessa forma
 * vive in `src/app/icon.svg`, da cui Next ricava la favicon: i due file vanno
 * tenuti identici, altrimenti la scheda del browser e la barra del sito
 * mostrano due segni diversi.
 *
 * `id` del gradiente: dev'essere unico nel documento. Qui il componente
 * compare una volta sola, nella NavBar; se un giorno se ne mettesse più d'uno
 * nella stessa pagina, l'id andrebbe reso univoco con useId().
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

      {/* Display */}
      <rect x="12" y="10" width="40" height="13" rx="3" fill="#00ff87" />

      {/* Tasti: due file da tre. A icona piccola una griglia 3x4 diventa
          una macchia, e la calcolatrice smette di riconoscersi. */}
      <g fill="#00ff87">
        <rect x="12" y="31" width="10" height="10" rx="2" />
        <rect x="27" y="31" width="10" height="10" rx="2" />
        <rect x="42" y="31" width="10" height="10" rx="2" />
        <rect x="12" y="46" width="10" height="10" rx="2" />
        <rect x="27" y="46" width="10" height="10" rx="2" />
        <rect x="42" y="46" width="10" height="10" rx="2" />
      </g>
    </svg>
  )
}
