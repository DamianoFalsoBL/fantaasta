import type { Metadata, Viewport } from "next";
import { Inter, Barlow_Condensed, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";

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
        <main className="flex-1 w-full">
          {children}
        </main>
      </body>
    </html>
  );
}
