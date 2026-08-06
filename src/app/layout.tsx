import type { Metadata, Viewport } from "next";
import { Inter, Barlow_Condensed, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import NavBar from "@/components/NavBar";
// Una sola fonte per il numero di versione: quella di package.json, che si
// alza col rilascio. Duplicarla in una costante significherebbe, prima o poi,
// mostrare a schermo una versione diversa da quella pubblicata.
import { version } from "../../package.json";

// Inter per testi e dati: ottima leggibilità a corpo piccolo e cifre tabellari,
// che qui servono ovunque (budget, quotazioni, timer).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Barlow Condensed per titoli, intestazioni tabella ed etichette maiuscole:
// è il carattere condensato che dà l'aria da scheda tecnica.
const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FantaAsta",
  description: "Gestione live dell'asta del fantacalcio",
};

// Tema unico scuro: lo si dichiara anche al browser, così la UI di sistema
// (barra indirizzi su mobile, controlli nativi) si accorda.
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#120b23",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${inter.variable} ${barlow.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Lo sfondo lo imposta il layer base in globals.css: prima c'era un
          `bg-gray-50` che non aveva comunque alcun effetto, perché la regola
          `body` non stratificata lo sovrascriveva. */}
      <body className="min-h-full flex flex-col">
        <NavBar />
        {/* `flex flex-col` serve al piè di pagina: permette alla pagina di
            occupare l'altezza disponibile con `flex-1` invece che con
            `min-h-screen`, che sommandosi a barra e piè di pagina produrrebbe
            uno scorrimento fantasma.

            ATTENZIONE: essendo <main> un contenitore flessibile, i suoi figli
            sono elementi flex, e un margine automatico sull'asse trasversale
            (`mx-auto`) ANNULLA lo stiramento: l'elemento si dimensiona sul
            proprio contenuto invece che sulla larghezza disponibile. Ogni
            contenitore di pagina `mx-auto max-w-*` deve quindi portare anche
            `w-full`, altrimenti la larghezza della pagina cambia al cambiare
            di ciò che contiene. */}
        <main className="flex w-full flex-1 flex-col">
          {children}
        </main>

        <footer className="border-t border-line px-3 py-2 text-center text-[10px] tracking-wide text-ink-dim">
          v{version} · Vibe coded by F4150
        </footer>
        {/* Metriche Vercel: non renderizza nulla, inietta solo lo script che
            raccoglie i Core Web Vitals. Fuori da Vercel resta inerte. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
