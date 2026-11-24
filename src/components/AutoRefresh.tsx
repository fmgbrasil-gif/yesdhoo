'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Recarrega os dados da pagina a cada N segundos enquanto `active` (ex.: comando aguardando o aparelho). */
export function AutoRefresh({ active, seconds = 5 }: { active: boolean; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [active, seconds, router]);
  return null;
}
