'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Download, ExternalLink, FileSignature, Loader2, SkipForward } from 'lucide-react';
import { ChargeFields } from './ChargeForm';
import { PixPanel } from './PixPanel';
import { Field } from './ui';
import type { ServiceOpt } from './InvoiceItems';
import { contractToPdf } from '@/lib/pdf-client';
import { wizardCharge, wizardContract, wizardDocs } from '@/app/(painel)/financeiro/wizard';

type Opt = { id: string; name: string; kind: string };
type Charge = { invoiceId: string | null; subscriptionId: string | null; clientId: string; message: string };
type Contract = { contractId: string; title: string; body: string; fileName: string; logo: string | null };
type Docs = { invoiceUrl: string; pixUrl: string; invoiceFile: string; pixFile: string };

const STEPS = ['Cobrança', 'Contrato', 'Pix', 'Fatura'];

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2" aria-label="Etapas">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-400 text-on-brand' : 'bg-ink-100 text-ink-400 dark:bg-ink-800'}`} aria-current={i === step ? 'step' : undefined}>
            {i < step ? <Check size={15} /> : i + 1}
          </span>
          <span className={`text-sm font-semibold ${i === step ? '' : 'text-ink-400'}`}>{s}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-ink-200 dark:bg-ink-700" />}
        </li>
      ))}
    </ol>
  );
}

/** Fluxo de nova cobranca: cria a cobranca, gera o contrato, mostra o primeiro Pix e entrega a fatura, com os PDFs nomeados. */
export function ChargeWizard({ clients, services, today, hasAi }: { clients: Opt[]; services: ServiceOpt[]; today: string; hasAi: boolean }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [charge, setCharge] = useState<Charge | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [docs, setDocs] = useState<Docs | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const invoiceFrame = useRef<HTMLIFrameElement>(null);
  const pixFrame = useRef<HTMLIFrameElement>(null);

  useEffect(() => { if (step === 3 && charge?.invoiceId && !docs) wizardDocs(charge.invoiceId).then((r) => (r.ok ? setDocs(r) : setError(r.error))); }, [step, charge, docs]);

  const submitCharge = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setError('');
    const r = await wizardCharge(new FormData(e.currentTarget));
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setCharge(r); setStep(1);
  };
  const submitContract = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setError('');
    const fd = new FormData(e.currentTarget);
    fd.set('clientId', charge!.clientId);
    if (charge!.subscriptionId) fd.set('subscriptionId', charge!.subscriptionId);
    const r = await wizardContract(fd);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setContract(r);
  };
  const next = () => { setError(''); setStep(step + 1); };

  const download = async (kind: 'contrato' | 'pix' | 'fatura') => {
    try {
      if (kind === 'contrato' && contract) await contractToPdf(contract.body, contract.fileName, contract.logo);
      else {
        const frame = kind === 'pix' ? pixFrame.current : invoiceFrame.current;
        const make = (frame?.contentWindow as (Window & { __docPdf?: () => Promise<void> }) | null)?.__docPdf;
        if (!make || !docs) throw new Error('documento ainda carregando');
        await make();
      }
      setSaved((s) => ({ ...s, [kind]: true }));
    } catch {
      setError('Não foi possível gerar o PDF. Aguarde a fatura carregar e tente de novo.');
    }
  };
  const downloadAll = async () => { if (contract) await download('contrato'); await download('pix'); await download('fatura'); };

  return (
    <div className="card p-5 sm:p-6">
      <Stepper step={step} />
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200" role="alert">{error}</p>}

      {step === 0 && (
        <form onSubmit={submitCharge} className="space-y-4">
          <ChargeFields clients={clients} today={today} services={services} />
          <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" />}Criar cobrança e avançar</button></div>
        </form>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{charge?.message}</p>
          <h2 className="flex items-center gap-2 text-lg font-bold"><FileSignature size={18} /> Contrato</h2>
          {contract ? (
            <div className="space-y-3">
              <p className="text-sm">Contrato <b>{contract.title}</b> gerado. Revise o texto antes de enviar.</p>
              <div className="flex flex-wrap gap-2">
                <a href={`/contratos/${contract.contractId}`} target="_blank" rel="noreferrer" className="btn-ghost"><ExternalLink size={15} /> Revisar e editar</a>
                <button type="button" className="btn-ghost" onClick={() => download('contrato')}><Download size={15} /> Baixar PDF</button>
                <button type="button" className="btn-primary" onClick={next}>Avançar</button>
              </div>
            </div>
          ) : (
            <form onSubmit={submitContract} className="space-y-4">
              {!hasAi && <p className="rounded-lg bg-brand-50 p-3 text-sm text-ink-700 dark:bg-ink-900 dark:text-ink-200">A geração com IA ainda não foi configurada no servidor. Você pode pular esta etapa.</p>}
              <p className="text-sm text-ink-500">A IA redige o contrato com os dados da sua empresa, do cliente e desta cobrança. Leva de 30 segundos a 2 minutos.</p>
              <Field label="Instruções adicionais (opcional)" hint="Ex.: 3 telas, vídeos de até 15 segundos, exclusividade no segmento"><textarea name="extra" rows={3} maxLength={2000} className="input" /></Field>
              <Field label="Anexos (opcional)" hint="PDF ou imagens, até 5 arquivos e 4 MB no total"><input type="file" name="attachments" multiple accept="application/pdf,image/png,image/jpeg,image/webp,image/gif" className="input" /></Field>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={next} disabled={busy}><SkipForward size={15} /> Pular contrato</button>
                <button className="btn-primary" disabled={busy || !hasAi}>{busy ? <><Loader2 size={15} className="animate-spin" /> Gerando contrato...</> : 'Gerar contrato com IA'}</button>
              </div>
            </form>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Primeira cobrança Pix</h2>
          {charge?.invoiceId ? <PixPanel invoiceId={charge.invoiceId} /> : <p className="text-sm text-ink-500">A primeira fatura desta cobrança será gerada automaticamente até 15 dias antes do vencimento. O Pix aparece no Financeiro quando ela for gerada.</p>}
          <div className="flex justify-end"><button type="button" className="btn-primary" onClick={next}>Avançar</button></div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Fatura e documentos</h2>
          {!charge?.invoiceId ? (
            <p className="text-sm text-ink-500">Ainda não há fatura gerada para esta cobrança.</p>
          ) : !docs ? (
            <p className="flex items-center gap-2 text-sm text-ink-400"><Loader2 size={15} className="animate-spin" /> Preparando a fatura...</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {contract && <button type="button" className="btn-ghost" onClick={() => download('contrato')}>{saved.contrato ? <Check size={15} className="text-emerald-600" /> : <Download size={15} />} {contract.fileName}</button>}
                <button type="button" className="btn-ghost" onClick={() => download('pix')}>{saved.pix ? <Check size={15} className="text-emerald-600" /> : <Download size={15} />} {docs.pixFile}</button>
                <button type="button" className="btn-ghost" onClick={() => download('fatura')}>{saved.fatura ? <Check size={15} className="text-emerald-600" /> : <Download size={15} />} {docs.invoiceFile}</button>
                <button type="button" className="btn-primary" onClick={downloadAll}><Download size={15} /> Baixar todos</button>
              </div>
              <p className="text-xs text-ink-400">Se o navegador perguntar, permita baixar vários arquivos deste site.</p>
              <div className="overflow-hidden rounded-lg border border-ink-100 dark:border-ink-700">
                <iframe ref={invoiceFrame} src={docs.invoiceUrl} title="Fatura" className="h-[70vh] w-full bg-white" />
              </div>
              {/* documento do Pix fora da tela, so para gerar o PDF */}
              <iframe ref={pixFrame} src={docs.pixUrl} title="Documento do Pix" aria-hidden tabIndex={-1} style={{ position: 'absolute', left: '-10000px', top: 0, width: '900px', height: '1300px' }} />
            </>
          )}
          <div className="flex justify-end gap-2">
            {docs && <a href={docs.invoiceUrl} target="_blank" rel="noreferrer" className="btn-ghost"><ExternalLink size={15} /> Abrir fatura</a>}
            <Link href="/financeiro" className="btn-primary">Concluir</Link>
          </div>
        </div>
      )}
    </div>
  );
}
