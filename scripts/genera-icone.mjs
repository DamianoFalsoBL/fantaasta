/**
 * Genera le icone PNG dell'app dalla stessa forma di src/app/icon.svg.
 *
 * Script one-shot: si lancia una volta e produce due file in public/. Non
 * dipende da un browser acceso ne' da librerie: disegna in un buffer e scrive
 * il PNG con zlib, che Node ha gia'.
 *
 * La forma e' quella dell'icona esistente — corpo arrotondato con gradiente
 * viola, display verde, sei tasti — tenuta in coordinate su base 64 come
 * nell'SVG, cosi' le proporzioni restano le stesse a qualunque taglia.
 *
 * Anti-aliasing per supersampling 2x: si disegna al doppio e si media. Senza,
 * gli angoli arrotondati a 192px risultano seghettati.
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

const VIOLA_CHIARO = [0x7c, 0x46, 0xf0]
const VIOLA_SCURO = [0x3d, 0x1f, 0x7a]
const NEON = [0x00, 0xff, 0x87]

/** I rettangoli verdi, in coordinate su base 64 come nell'SVG. */
const FORME = [
  { x: 12, y: 10, w: 40, h: 13, r: 3 },   // display
  { x: 12, y: 31, w: 10, h: 10, r: 2 },   // tasti, due file da tre
  { x: 27, y: 31, w: 10, h: 10, r: 2 },
  { x: 42, y: 31, w: 10, h: 10, r: 2 },
  { x: 12, y: 46, w: 10, h: 10, r: 2 },
  { x: 27, y: 46, w: 10, h: 10, r: 2 },
  { x: 42, y: 46, w: 10, h: 10, r: 2 },
]

/** Un punto sta dentro un rettangolo con gli angoli arrotondati? */
function dentroArrotondato(px, py, { x, y, w, h, r }) {
  if (px < x || py < y || px > x + w || py > y + h) return false
  // Il punto piu' vicino al centro dell'arco corrispondente.
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

function disegna(lato, raggioCorpo = 14) {
  const S = 2                        // supersampling
  const N = lato * S
  const scala = 64 / N               // da pixel a coordinate SVG
  const corpo = { x: 0, y: 0, w: 64, h: 64, r: raggioCorpo }
  const grande = Buffer.alloc(N * N * 4)

  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const sx = (px + 0.5) * scala
      const sy = (py + 0.5) * scala
      const i = (py * N + px) * 4

      if (!dentroArrotondato(sx, sy, corpo)) continue   // resta trasparente

      // Gradiente diagonale, come il linearGradient da (0,0) a (1,1).
      const t = Math.min(1, Math.max(0, (sx / 64 + sy / 64) / 2))
      const dentroForma = FORME.some((f) => dentroArrotondato(sx, sy, f))

      if (dentroForma) {
        grande[i] = NEON[0]; grande[i + 1] = NEON[1]; grande[i + 2] = NEON[2]
      } else {
        grande[i] = Math.round(VIOLA_CHIARO[0] + (VIOLA_SCURO[0] - VIOLA_CHIARO[0]) * t)
        grande[i + 1] = Math.round(VIOLA_CHIARO[1] + (VIOLA_SCURO[1] - VIOLA_CHIARO[1]) * t)
        grande[i + 2] = Math.round(VIOLA_CHIARO[2] + (VIOLA_SCURO[2] - VIOLA_CHIARO[2]) * t)
      }
      grande[i + 3] = 255
    }
  }

  // Riduzione: media di ogni blocco S x S. L'alfa va mediata come il colore,
  // altrimenti i bordi degli angoli restano duri.
  const out = Buffer.alloc(lato * lato * 4)
  for (let y = 0; y < lato; y++) {
    for (let x = 0; x < lato; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let dy = 0; dy < S; dy++) {
        for (let dx = 0; dx < S; dx++) {
          const j = ((y * S + dy) * N + (x * S + dx)) * 4
          const alfa = grande[j + 3] / 255
          r += grande[j] * alfa; g += grande[j + 1] * alfa; b += grande[j + 2] * alfa
          a += grande[j + 3]
        }
      }
      const n = S * S
      const alfaMedia = a / n
      const k = (y * lato + x) * 4
      // Colore non premoltiplicato: si divide per l'alfa media, se c'e'.
      const peso = alfaMedia > 0 ? (a / 255) : 1
      out[k] = Math.round(r / peso)
      out[k + 1] = Math.round(g / peso)
      out[k + 2] = Math.round(b / peso)
      out[k + 3] = Math.round(alfaMedia)
    }
  }
  return out
}

/** Scrive un PNG RGBA senza filtri (filtro 0 su ogni riga). */
function scrivePng(file, lato, pixel) {
  const crcTab = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTab[n] = c >>> 0
  }
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTab[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const pezzo = (tipo, dati) => {
    const lun = Buffer.alloc(4); lun.writeUInt32BE(dati.length)
    const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dati])
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(corpo))
    return Buffer.concat([lun, corpo, c])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(lato, 0); ihdr.writeUInt32BE(lato, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  const righe = Buffer.alloc(lato * (lato * 4 + 1))
  for (let y = 0; y < lato; y++) {
    righe[y * (lato * 4 + 1)] = 0
    pixel.copy(righe, y * (lato * 4 + 1) + 1, y * lato * 4, (y + 1) * lato * 4)
  }

  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pezzo('IHDR', ihdr),
    pezzo('IDAT', zlib.deflateSync(righe, { level: 9 })),
    pezzo('IEND', Buffer.alloc(0)),
  ]))
}

for (const lato of [192, 512]) {
  const file = `public/icon-${lato}.png`
  scrivePng(file, lato, disegna(lato))
  console.log(`${file} — ${(fs.statSync(file).size / 1024).toFixed(1)} KB`)
}

// iOS ignora il manifest e usa `apple-icon`, applicando **la sua** maschera
// arrotondata. Con angoli gia' arrotondati se ne vedrebbero due sovrapposti,
// con una cornice scura in mezzo: qui il corpo e' quadrato pieno (r = 0) e la
// forma la da' il sistema. 180px e' la taglia che iOS chiede.
scrivePng('src/app/apple-icon.png', 180, disegna(180, 0))
console.log(`src/app/apple-icon.png — ${(fs.statSync('src/app/apple-icon.png').size / 1024).toFixed(1)} KB`)
