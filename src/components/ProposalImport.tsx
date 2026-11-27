'use client';

import { useRef, useState } from 'react';
import { FileSearch, ImagePlus, Loader2 } from 'lucide-react';
import { wizardReadDocs } from '@/app/(painel)/financeiro/wizard';

/**
 * Topo da nova proposta: anexar a logo do cliente e os documentos (cartao CNPJ, contrato social, print do perfil...)
 * para preencher sozinho os campos de cadastro do formulario.
 */
export function ProposalImport({ hasAi }: { hasAi: boolean }) {
  const docs = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // a logo vai para o campo "logo" do formulario (reduzida no navegador, PNG para manter transparencia)
  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    const img = new Image();
    img.src = URL.createObjectURL(f);
    await new Promise((r) => { img.onload = r; img.onerror = r; });
    const k = Math.min(1, 700 / Math.max(img.width || 1, img.height || 1));
    const c = document.createElement('canvas'); c.width = Math.round((img.width || 1) * k); c.height = Math.round((img.height || 1) * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/png'));
    const file = blob ? new File([blob], 'logo.png', { type: 'image/png' }) : f;
    const target = (e.currentTarget.form?.elements.namedItem('logo') as HTMLInputElement | null);
    if (target) { const dt = new DataTransfer(); dt.items.add(file); target.files = dt.files; }
    setPreview(URL.createObjectURL(file));
  };

  const read = async () => {
    const files = [...(docs.current?.files ?? [])];
    if (!files.length) { setMsg({ text: 'Escolha o cartão CNPJ (PDF) ou outros documentos do cliente.', err: true }); return; }
    setBusy(true); setMsg(null);
    const fd = new FormData(); files.forEach((f) => fd.append('docs', f));
    const r = await wizardReadDocs(fd);
    setBusy(false);
    if (!r.ok) { setMsg({ text: r.error, err: true }); return; }
    const form = docs.current!.form!;
    const d = r.draft;
    const set = (name: string, v: string) => { const el = form.elements.namedItem(name) as HTMLInputElement | null; if (el && v) el.value = v; };
    set('companyName', d.name); set('tradeName', d.tradeName); set('document', d.document); set('email', d.email); set('phone', d.phone1);
    set('city', d.city ? `${d.city}${d.state ? '/' + d.state : ''}` : '');
    setMsg({ text: `${r.notes.join(' ')} Campos preenchidos: confira antes de criar a proposta.`.trim() });
  };

  return (
    <div className="space-y-3 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/50 p-4 dark:border-ink-600 dark:bg-ink-900">
      <p className="text-sm font-semibold">Comece anexando a logo e os documentos do cliente: o sistema preenche o cadastro.</p>
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-3">
          <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-xl bg-white text-center text-[11px] font-semibold text-ink-500 ring-1 ring-ink-200 hover:ring-brand-400 dark:bg-ink-800">
            {preview ? <img src={preview} alt="Logo" className="h-full w-full object-contain p-1" /> : <><ImagePlus size={22} /> Anexar logo</>}{/* eslint-disable-line @next/next/no-img-element */}
            <input ref={logoInput} type="file" accept="image/*" className="sr-only" onChange={onLogo} />
          </label>
        </div>
        <div className="space-y-2">
          <input ref={docs} type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" aria-label="Documentos do cliente" className="input" />
          <p className="text-xs text-ink-400">Cartão CNPJ em PDF (dados da Receita){hasAi ? ', contrato social, cartão de visita ou print do Instagram (a IA lê e preenche)' : '. Para ler imagens e outros documentos, cadastre a chave da OpenAI em Minha empresa'}.</p>
          <button type="button" onClick={read} disabled={busy} className="btn-dark">{busy ? <Loader2 size={15} className="animate-spin" /> : <FileSearch size={15} />} Ler documentos e preencher</button>
        </div>
      </div>
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.err ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>{msg.text}</p>}
    </div>
  );
}
