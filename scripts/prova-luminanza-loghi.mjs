/**
 * Quali stemmi spariscono sul fondo scuro del sito?
 *
 * node scripts/prova-luminanza-loghi.mjs
 *
 * Serve a decidere quali vanno in `STEMMI_TUTTI_NERI` dentro
 * `src/components/LogoSquadra.tsx`, che li inverte. La trappola e' gia' stata
 * pagata con la Juventus: stemma tutto nero, su fondo #1a1033 invisibile.
 *
 * Si legge il PNG direttamente invece di disegnarlo su canvas nel browser: il
 * numero e' lo stesso e non dipende da un server di sviluppo acceso.
 *
 * **`invert` vale solo sui disegni in nero pieno.** Su uno stemma a colori non
 * schiarisce: ne ribalta le tinte, e il risultato e' irriconoscibile. Per
 * questo si guardano due numeri e non uno: la luminanza media dice quanto e'
 * scuro, la percentuale di pixel chiari dice se c'e' comunque qualcosa che si
 * stacca dal fondo.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

/** Decodifica un PNG a 8 bit (colorType 2 = RGB, 3 = palette, 6 = RGBA). */
function leggiPng(file) {
  const buf = fs.readFileSync(file)
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('non e un PNG')

  let pos = 8
  let larghezza = 0, altezza = 0, profondita = 0, tipo = 0
  const pezzi = []
  let palette = null, alfaPalette = null

  while (pos < buf.length) {
    const lung = buf.readUInt32BE(pos)
    const nome = buf.toString('ascii', pos + 4, pos + 8)
    const dati = buf.subarray(pos + 8, pos + 8 + lung)
    if (nome === 'IHDR') {
      larghezza = dati.readUInt32BE(0)
      altezza = dati.readUInt32BE(4)
      profondita = dati[8]
      tipo = dati[9]
      if (dati[12] !== 0) throw new Error('interlacciato, non gestito')
    } else if (nome === 'PLTE') palette = Buffer.from(dati)
    // tRNS: in una tavolozza l'alfa non sta accanto al colore, sta qui, un
    // byte per indice. Senza, lo sfondo trasparente degli stemmi verrebbe
    // contato come nero e li farebbe risultare tutti scurissimi.
    else if (nome === 'tRNS') alfaPalette = Buffer.from(dati)
    else if (nome === 'IDAT') pezzi.push(dati)
    else if (nome === 'IEND') break
    pos += 12 + lung
  }

  if (profondita !== 8) throw new Error(`profondita ${profondita} bit, non gestita`)
  if (![2, 3, 6].includes(tipo)) throw new Error(`colorType ${tipo}, non gestito`)
  if (tipo === 3 && !palette) throw new Error('tavolozza dichiarata ma assente')

  const canali = tipo === 6 ? 4 : tipo === 3 ? 1 : 3
  const grezzi = zlib.inflateSync(Buffer.concat(pezzi))
  const perRiga = larghezza * canali
  const pixel = Buffer.alloc(altezza * perRiga)

  // Defiltraggio: ogni riga ha un byte di filtro davanti (PNG, sezione 9).
  for (let y = 0; y < altezza; y++) {
    const filtro = grezzi[y * (perRiga + 1)]
    const riga = grezzi.subarray(y * (perRiga + 1) + 1, (y + 1) * (perRiga + 1))
    for (let x = 0; x < perRiga; x++) {
      const a = x >= canali ? pixel[y * perRiga + x - canali] : 0
      const b = y > 0 ? pixel[(y - 1) * perRiga + x] : 0
      const c = x >= canali && y > 0 ? pixel[(y - 1) * perRiga + x - canali] : 0
      let v = riga[x]
      if (filtro === 1) v += a
      else if (filtro === 2) v += b
      else if (filtro === 3) v += (a + b) >> 1
      else if (filtro === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      pixel[y * perRiga + x] = v & 0xff
    }
  }
  // Con la tavolozza ogni byte e' un indice: si espande in RGBA, cosi' il
  // conteggio a valle e' identico per tutti i formati.
  if (tipo === 3) {
    const rgba = Buffer.alloc(larghezza * altezza * 4)
    for (let i = 0; i < larghezza * altezza; i++) {
      const idx = pixel[i]
      rgba[i * 4] = palette[idx * 3]
      rgba[i * 4 + 1] = palette[idx * 3 + 1]
      rgba[i * 4 + 2] = palette[idx * 3 + 2]
      rgba[i * 4 + 3] = alfaPalette && idx < alfaPalette.length ? alfaPalette[idx] : 255
    }
    return { larghezza, altezza, canali: 4, pixel: rgba }
  }

  return { larghezza, altezza, canali, pixel }
}

const cartella = 'public/loghi'
const righe = []

for (const nome of fs.readdirSync(cartella).filter((f) => f.endsWith('.png')).sort()) {
  try {
    const { larghezza, altezza, canali, pixel } = leggiPng(path.join(cartella, nome))
    let somma = 0, opachi = 0, chiari = 0
    for (let i = 0; i < larghezza * altezza; i++) {
      const p = i * canali
      const alfa = canali === 4 ? pixel[p + 3] : 255
      if (alfa < 32) continue          // i pixel trasparenti non si vedono
      opachi++
      const L = 0.2126 * pixel[p] + 0.7152 * pixel[p + 1] + 0.0722 * pixel[p + 2]
      somma += L
      if (L > 128) chiari++
    }
    righe.push({
      nome: nome.replace('.png', ''),
      lum: Math.round(somma / Math.max(opachi, 1)),
      chiari: Math.round((chiari / Math.max(opachi, 1)) * 100),
      dim: `${larghezza}x${altezza}`,
    })
  } catch (e) {
    righe.push({ nome: nome.replace('.png', ''), errore: e.message })
  }
}

righe.sort((a, b) => (a.lum ?? 999) - (b.lum ?? 999))

console.log('stemma                          lum  chiari  dimensioni')
for (const r of righe) {
  if (r.errore) { console.log(`${r.nome.padEnd(30)} -- ${r.errore}`); continue }
  const spia = r.lum < 40 && r.chiari < 10 ? '  <-- SPARISCE sul fondo scuro' : ''
  console.log(`${r.nome.padEnd(30)} ${String(r.lum).padStart(3)}  ${String(r.chiari).padStart(4)}%  ${r.dim}${spia}`)
}

const arischio = righe.filter((r) => !r.errore && r.lum < 40 && r.chiari < 10)
console.log(`\n${righe.length} stemmi letti · da invertire: ${arischio.length ? arischio.map((r) => r.nome).join(', ') : 'nessuno'}`)
