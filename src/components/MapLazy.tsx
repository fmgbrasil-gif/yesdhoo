'use client';

import dynamic from 'next/dynamic';

// Leaflet depende de `window`, entao o mapa so e carregado no navegador.
export default dynamic(() => import('./Map'), { ssr: false, loading: () => <div className="h-52 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-900" /> });
