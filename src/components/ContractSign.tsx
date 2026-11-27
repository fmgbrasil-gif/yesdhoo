'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eraser, Loader2, PenLine, XCircle } from 'lucide-react';
import { refuseContract, signContract } from '@/app/contrato/[token]/actions';
import type { PdfSignature } from '@/lib/pdf-client';

/** Campo para o cliente desenhar a rubrica com o dedo ou o mouse. */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokes = useRef(0);
  useEffect(() => {
    const c = ref.current!; const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!; ctx.scale(ratio, ratio); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111827';
  }, []);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e: React.PointerEvent) => { e.preventDefault(); ref.current!.setPointerCapture(e.pointerId); drawing.current = true; const ctx = ref.current!.getContext('2d')!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const ctx = ref.current!.getContext('2d')!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); strokes.current++; };
  const up = () => { if (!drawing.current) return; drawing.current = false; onChange(strokes.current > 8 ? ref.current!.toDataURL('image/png') : ''); };
  const clear = () => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); strokes.current = 0; onChange(''); };
  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed border-gray-300 bg-white">
        <canvas ref={ref} aria-label="Campo da rubrica" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} className="h-44 w-full touch-none cursor-crosshair rounded-xl" />
        <span className="pointer-events-none absolute bottom-10 left-6 right-6 border-b border-gray-300" />
        <span className="pointer-events-none absolute bottom-3 left-6 text-xs text-gray-400">Desenhe sua rubrica acima da linha</span>
      </div>
      <button type="button" onClick={clear} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800"><Eraser size={14} /> Limpar</button>
    </div>
  );
}

/** Rodape do contrato publico: Assinar (nome, documento, rubrica, aceite) ou Recusar. */
export function ContractSign({ token }: { token: string }) {
  const [mode, setMode] = useState<'escolher' | 'assinar' | 'recusar'>('escolher');
  const [sig, setSig] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const submit = (fn: typeof signContract) => async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError('');
    const fd = new FormData(e.currentTarget);
    if (fn === signContract) fd.set('signature', sig);
    setBusy(true);
    const r = await fn(token, fd);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
  };
  return (
    <section className="mx-auto mt-6 max-w-[210mm] rounded-2xl bg-white p-6 shadow sm:p-8 print:hidden">
      {mode === 'escolher' && (
        <div className="text-center">
          <h2 className="text-lg font-bold text-gray-900">Leu o contrato até o fim?</h2>
          <p className="mt-1 text-sm text-gray-500">Assine eletronicamente com sua rubrica ou recuse.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => setMode('assinar')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow hover:bg-emerald-500"><PenLine size={18} /> Assinar</button>
            <button type="button" onClick={() => setMode('recusar')} className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-red-600 ring-1 ring-red-200 hover:bg-red-50"><XCircle size={18} /> Recusar</button>
          </div>
        </div>
      )}
      {mode === 'assinar' && (
        <form onSubmit={submit(signContract)} className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Assinar contrato</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-gray-700">Nome completo<input name="name" required autoComplete="name" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal" /></label>
            <label className="text-sm font-semibold text-gray-700">CPF ou CNPJ<input name="doc" required inputMode="numeric" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal" /></label>
          </div>
          <div><p className="mb-1 text-sm font-semibold text-gray-700">Assinatura (rubrica)</p><SignaturePad onChange={setSig} /></div>
          <label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" name="accept" required className="mt-0.5 h-4 w-4 accent-emerald-600" /> Li o contrato e concordo com todas as cláusulas. Reconheço esta assinatura eletrônica como válida.</label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => { setMode('escolher'); setError(''); }} className="rounded-lg px-4 py-2 font-semibold text-gray-600 hover:bg-gray-100">Voltar</button>
            <button disabled={busy || !sig} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />} Assinar e enviar</button>
          </div>
        </form>
      )}
      {mode === 'recusar' && (
        <form onSubmit={submit(refuseContract)} className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Recusar contrato</h2>
          <label className="block text-sm font-semibold text-gray-700">Motivo (opcional)<textarea name="reason" rows={3} maxLength={1000} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal" placeholder="Conte o que precisa mudar" /></label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => { setMode('escolher'); setError(''); }} className="rounded-lg px-4 py-2 font-semibold text-gray-600 hover:bg-gray-100">Voltar</button>
            <button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 font-bold text-white hover:bg-red-500 disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />} Confirmar recusa</button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Bloco da assinatura eletronica (no contrato publico e no painel). */
export function SignatureBlock({ sig }: { sig: PdfSignature }) {
  return (
    <div className="mt-8 rounded-xl border border-gray-300 p-4 text-[12px] text-gray-700" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <p className="mb-2 font-bold text-gray-900">ASSINATURA ELETRÔNICA DO CONTRATANTE</p>
      <img src={sig.image} alt={`Rubrica de ${sig.name}`} className="h-20 w-auto" />{/* eslint-disable-line @next/next/no-img-element */}
      <div className="mb-2 w-72 max-w-full border-t border-gray-800" />
      <p>Assinado por: <b>{sig.name}</b> — {sig.doc}</p>
      <p>Data e hora: {sig.when}{sig.ip ? ` · IP ${sig.ip}` : ''}</p>
      {sig.hash && <p className="break-all text-[10px] text-gray-500">Código de verificação (SHA-256 do texto): {sig.hash}</p>}
    </div>
  );
}
