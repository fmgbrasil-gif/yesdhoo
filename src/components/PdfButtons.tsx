'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { contractToPdf, elementToPdf, type PdfSignature } from '@/lib/pdf-client';

/** Avisa a janela que abriu esta pagina num iframe (fluxo de nova cobranca) que o PDF foi salvo. */
const notify = (ok: boolean, name: string) => { try { window.parent?.postMessage({ type: 'pdf-done', ok, name }, window.location.origin); } catch { /* sem janela pai */ } };

function usePdf(run: () => Promise<void>, fileName: string, auto: boolean) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const started = useRef(false);
  const go = async () => {
    setBusy(true); setErr('');
    try { await run(); notify(true, fileName); } catch { setErr('Não foi possível gerar o PDF. Use Imprimir → Salvar como PDF.'); notify(false, fileName); }
    setBusy(false);
  };
  useEffect(() => { if (auto && !started.current) { started.current = true; setTimeout(go, 600); } }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps
  return { busy, err, go };
}

/** Baixa como PDF o elemento #doc da pagina (fatura ou Pix), com o nome definido. */
export function DownloadDocPdf({ fileName, auto = false, className = '' }: { fileName: string; auto?: boolean; className?: string }) {
  const make = async () => { const el = document.getElementById('doc'); if (!el) throw new Error('sem documento'); await elementToPdf(el, fileName); };
  const { busy, err, go } = usePdf(make, fileName, auto);
  // Permite que a janela pai (assistente de nova cobranca) gere o PDF no contexto desta pagina.
  useEffect(() => { (window as unknown as { __docPdf?: () => Promise<void> }).__docPdf = make; }); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className="inline-flex flex-col items-end print:hidden">
      <button type="button" onClick={go} disabled={busy} className={`inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-60 ${className}`}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Baixar PDF
      </button>
      {err && <span className="mt-1 text-xs text-red-600">{err}</span>}
    </span>
  );
}

export function DownloadContractPdf({ body, fileName, logo, auto = false, sig }: { body: string; fileName: string; logo?: string | null; auto?: boolean; sig?: PdfSignature | null }) {
  const { busy, err, go } = usePdf(() => contractToPdf(body, fileName, logo, sig), fileName, auto);
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" onClick={go} disabled={busy} className="btn-ghost">{busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Baixar PDF</button>
      {err && <span className="mt-1 text-xs text-red-600">{err}</span>}
    </span>
  );
}
