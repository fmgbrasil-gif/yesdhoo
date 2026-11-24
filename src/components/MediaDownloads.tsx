'use client';

import { useState } from 'react';
import { Check, Download, Loader2 } from 'lucide-react';

type File = { name: string; url: string; label: string };

/** Baixa os arquivos das midias da tela, um de cada vez (sem precisar compactar). */
export function MediaDownloads({ files }: { files: File[] }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const save = async (f: File) => {
    setBusy(f.url);
    try {
      const blob = await (await fetch(f.url)).blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setDone((d) => ({ ...d, [f.url]: true }));
    } catch { window.open(f.url, '_blank'); } finally { setBusy(null); }
  };
  const all = async () => { for (const f of files) await save(f); };
  if (!files.length) return <p className="text-sm text-ink-400">Nenhuma mídia com arquivo (vídeo ou imagem) na playlist desta tela.</p>;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-500">{files.length} arquivo(s). Se o navegador perguntar, permita baixar vários arquivos.</p>
        <button type="button" className="btn-primary" onClick={all} disabled={!!busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Baixar todas</button>
      </div>
      <ul className="max-h-80 divide-y divide-ink-100 overflow-auto rounded-lg border border-ink-100 dark:divide-ink-700 dark:border-ink-700">
        {files.map((f) => (
          <li key={f.url} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{f.name}</span><span className="text-xs text-ink-400">{f.label}</span></span>
            <button type="button" className="btn-ghost !py-1" onClick={() => save(f)} disabled={busy === f.url}>{busy === f.url ? <Loader2 size={14} className="animate-spin" /> : done[f.url] ? <Check size={14} className="text-emerald-600" /> : <Download size={14} />} Baixar</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
