'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, PenLine, XCircle } from 'lucide-react';
import { SignaturePad } from './ContractSign';
import { acceptProposal, refuseProposal } from '@/app/proposta/[token]/actions';

/** Barra do topo da proposta: Aceitar (nome, documento, rubrica) ou Recusar. */
export function ProposalSign({ token, company }: { token: string; company: string }) {
  const [mode, setMode] = useState<'escolher' | 'aceitar' | 'recusar'>('escolher');
  const [sig, setSig] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const submit = (fn: typeof acceptProposal) => async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError('');
    const fd = new FormData(e.currentTarget);
    if (fn === acceptProposal) fd.set('signature', sig);
    setBusy(true);
    const r = await fn(token, fd);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
  };
  const input = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal';
  return (
    <section className="mx-auto mb-6 max-w-[210mm] rounded-2xl bg-white p-5 shadow ring-2 ring-[#e6288a]/30 sm:p-6 print:hidden">
      {mode === 'escolher' && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-lg font-black text-[#1d1340]">Gostou da proposta?</p>
            <p className="text-sm text-gray-500">Aceite agora com sua assinatura eletrônica. Em seguida enviamos o contrato.</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <button type="button" onClick={() => setMode('aceitar')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl sm:flex-none bg-emerald-600 px-6 py-3 font-bold text-white shadow hover:bg-emerald-500"><CheckCircle2 size={18} /> Aceitar proposta</button>
            <button type="button" onClick={() => setMode('recusar')} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-red-600 ring-1 ring-red-200 hover:bg-red-50"><XCircle size={18} /> Recusar</button>
          </div>
        </div>
      )}
      {mode === 'aceitar' && (
        <form onSubmit={submit(acceptProposal)} className="space-y-4">
          <h2 className="text-lg font-black text-[#1d1340]">Aceitar a proposta para {company}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-gray-700">Nome completo do responsável<input name="name" required autoComplete="name" className={input} /></label>
            <label className="text-sm font-semibold text-gray-700">CPF ou CNPJ<input name="doc" required inputMode="numeric" className={input} /></label>
          </div>
          <div><p className="mb-1 text-sm font-semibold text-gray-700">Assinatura (rubrica)</p><SignaturePad onChange={setSig} /></div>
          <label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" name="accept" required className="mt-0.5 h-4 w-4 accent-emerald-600" /> Li e aceito esta proposta comercial. Reconheço esta assinatura eletrônica como válida. O contrato será enviado em seguida.</label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => { setMode('escolher'); setError(''); }} className="rounded-lg px-4 py-2 font-semibold text-gray-600 hover:bg-gray-100">Voltar</button>
            <button disabled={busy || !sig} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />} Aceitar e assinar</button>
          </div>
        </form>
      )}
      {mode === 'recusar' && (
        <form onSubmit={submit(refuseProposal)} className="space-y-4">
          <h2 className="text-lg font-black text-[#1d1340]">Recusar a proposta</h2>
          <label className="block text-sm font-semibold text-gray-700">O que precisa mudar? (opcional)<textarea name="reason" rows={3} maxLength={1000} className={input} /></label>
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
