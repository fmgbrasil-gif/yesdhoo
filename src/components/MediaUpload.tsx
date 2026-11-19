'use client';

import { useState } from 'react';
import { upload } from '@vercel/blob/client';

type Meta = { kind: 'image' | 'video'; width?: number; height?: number; duration?: number; size: number; thumb?: string };

/** Le dimensoes/duracao no navegador e, para video, captura um quadro como miniatura. */
function inspect(file: File): Promise<Meta> {
  const url = URL.createObjectURL(file);
  const done = (m: Meta) => { URL.revokeObjectURL(url); return m; };
  if (file.type.startsWith('image/')) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(done({ kind: 'image', width: img.naturalWidth, height: img.naturalHeight, size: file.size }));
      img.onerror = () => resolve(done({ kind: 'image', size: file.size }));
      img.src = url;
    });
  }
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true;
    const base = (): Meta => ({ kind: 'video', width: v.videoWidth || undefined, height: v.videoHeight || undefined, duration: Number.isFinite(v.duration) ? v.duration : undefined, size: file.size });
    const timer = setTimeout(() => resolve(done(base())), 8000);
    v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
    v.onseeked = () => {
      clearTimeout(timer);
      const m = base();
      try {
        const c = document.createElement('canvas');
        c.width = 480; c.height = Math.round((480 * v.videoHeight) / Math.max(1, v.videoWidth));
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
        m.thumb = c.toDataURL('image/jpeg', 0.7);
      } catch { /* sem miniatura */ }
      resolve(done(m));
    };
    v.onerror = () => { clearTimeout(timer); resolve(done({ kind: 'video', size: file.size })); };
    v.src = url;
  });
}

/**
 * Campo de arquivo de midia. No modo local e um <input type="file"> comum (o servidor grava o arquivo).
 * No modo nuvem o navegador envia direto para o armazenamento e o formulario leva so o endereco.
 */
export function MediaUpload({ name, remote }: { name: string; remote: boolean }) {
  const [state, setState] = useState<{ url?: string; meta?: Meta; progress?: number; error?: string }>({});
  if (!remote) return <input type="file" name={name} accept="image/*,video/*" className="input" />;

  const onPick = async (file?: File) => {
    if (!file) return setState({});
    setState({ progress: 0 });
    try {
      const meta = await inspect(file);
      const safe = file.name.normalize('NFD').replace(/[^\w.-]+/g, '-').slice(-60);
      const blob = await upload(`midias/${safe}`, file, { access: 'public', handleUploadUrl: '/api/upload', multipart: file.size > 20 * 1024 * 1024, onUploadProgress: (p) => setState((s) => ({ ...s, progress: Math.round(p.percentage) })) });
      setState({ url: blob.url, meta });
    } catch (e) {
      setState({ error: `Não foi possível enviar o arquivo. ${(e as Error).message}` });
    }
  };

  return (
    <div>
      <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" className="input" onChange={(e) => onPick(e.target.files?.[0])} aria-label="Arquivo de mídia" />
      {state.url && <input type="hidden" name={`${name}_url`} value={state.url} />}
      {state.meta && <input type="hidden" name={`${name}_meta`} value={JSON.stringify(state.meta)} />}
      {/* enquanto envia, um campo obrigatorio vazio impede salvar o formulario pela metade */}
      {state.progress !== undefined && !state.url && <input required value="" onChange={() => {}} className="sr-only" aria-hidden tabIndex={-1} />}
      <span className="mt-1 block text-xs text-ink-400" role="status">
        {state.error ? <span className="text-red-600">{state.error}</span> : state.url ? 'Arquivo enviado. Clique em Salvar para concluir.' : state.progress !== undefined ? `Enviando... ${state.progress}%` : ''}
      </span>
    </div>
  );
}
