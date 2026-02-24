import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import GlobalFooter from '@/components/GlobalFooter';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Perizia Analyzer — Analisi perizie d\'asta in 30 secondi',
  description:
    'Carica la perizia PDF. Ottieni rischi, costi nascosti e valore reale. Lo strumento decisionale per investitori immobiliari professionali.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className={`${inter.className} flex flex-col min-h-screen`}>
        <Providers>
          <div className="flex-1">{children}</div>
          <GlobalFooter />
        </Providers>
      </body>
    </html>
  );
}
