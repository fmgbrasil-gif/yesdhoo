import type { Metadata } from 'next';
import './globals.css';
import { APP_NAME } from '@/lib/constants';

export const metadata: Metadata = { title: `${APP_NAME} — Gestão de mídia indoor`, description: 'Plataforma de gestão de telas e mídia Digital Out-of-Home.' };

// aplica o tema salvo antes da primeira pintura
const themeScript = `try{if(localStorage.getItem('yd-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
