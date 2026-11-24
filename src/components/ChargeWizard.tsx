'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Download, ExternalLink, FileSearch, FileSignature, Loader2, Mail, MessageCircle, Plus, Receipt, Send, SkipForward, UserPlus, Users } from 'lucide-react';
import { ChargeFields } from './ChargeForm';
import { PixPanel } from './PixPanel';
import { CnpjLookup } from './CnpjLookup';
import { CopyButton } from './CopyButton';
import { OperationFields, type ScreenOpt } from './OperationFields';
import { Field, SelectAll } from './ui';
import type { ServiceOpt } from './InvoiceItems';
import { contractToPdf } from '@/lib/pdf-client';
import { STATES } from '@/lib/constants';
import type { ClientDraft } from '@/lib/ai-client';
import { wizardCharge, wizardContract, wizardDocs, wizardInvoice, wizardReadDocs, wizardSaveClient, type WizardClient, type WizardDocs } from '@/app/(painel)/financeiro/wizard';
import { upsertOperation, type OperationOpt } from '@/app/(painel)/operacoes/actions';

type Opt = { id: string; name: string; kind: string };
type Charge = { invoiceId: string | null; subscriptionId: string | null; clientId: string; message: string };
type Contract = { contractId: string; title: string; body: string; fileName: string; logo: string | null; publicUrl: string };

const STEPS = ['Cliente', 'Cobrança', 'Contrato', 'Fatura e Pix', 'Enviar'];

function Stepper({ step, max, onGo }: { step: number; max: number; onGo: (i: number) => void }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2" aria-label="Etapas">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <button type="button" disabled={i > max || i === step} onClick={() => onGo(i)} title={i <= max && i !== step ? `Ir para ${s}` : undefined} className="flex items-center gap-2 rounded-full enabled:hover:opacity-80 disabled:cursor-default">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-400 text-on-brand' : 'bg-ink-100 text-ink-400 dark:bg-ink-800'}`} aria-current={i === step ? 'step' : undefined}>
            {i < step || (i <= max && i !== step) ? <Check size={15} /> : i + 1}
          </span>
          <span className={`text-sm font-semibold ${i === step ? '' : 'text-ink-400'}`}>{s}</span>
          </button>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-ink-200 dark:bg-ink-700" />}
        </li>
      ))}
    </ol>
  );
}

/** Campos do cadastro do cliente, ja preenchidos com o que foi lido dos documentos. */
function ClientFields({ d }: { d: Partial<ClientDraft> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <Field label="Tipo de cadastro" className="sm:col-span-3">
        <div className="flex gap-4 pt-2 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="kind" value="cliente" defaultChecked className="accent-violet-500" /> Cliente (anunciante)</label>
          <label className="flex items-center gap-2"><input type="radio" name="kind" value="parceiro" className="accent-violet-500" /> Parceiro (ponto)</label>
        </div>
      </Field>
      <Field label="Pessoa" className="sm:col-span-3"><select name="type" defaultValue={d.type ?? 'PJ'} className="input"><option value="PJ">Jurídica</option><option value="PF">Física</option></select></Field>
      <Field label="CNPJ / CPF" className="sm:col-span-3"><CnpjLookup defaultValue={d.document} /></Field>
      <Field label="Inscrição estadual" className="sm:col-span-3"><input name="stateRegistration" defaultValue={d.stateRegistration} className="input" /></Field>
      <Field label="Razão social / nome" className="sm:col-span-3"><input name="name" required defaultValue={d.name} className="input" /></Field>
      <Field label="Nome fantasia" className="sm:col-span-3"><input name="tradeName" defaultValue={d.tradeName} className="input" /></Field>
      <Field label="Celular / WhatsApp" className="sm:col-span-3"><input name="phone1" defaultValue={d.phone1} className="input" placeholder="(00) 00000-0000" /></Field>
      <Field label="E-mail" className="sm:col-span-3"><input name="email" type="email" defaultValue={d.email} className="input" /></Field>
      <Field label="Endereço" className="sm:col-span-4"><input name="road" defaultValue={d.road} className="input" /></Field>
      <Field label="Número" className="sm:col-span-2"><input name="number" defaultValue={d.number} className="input" /></Field>
      <Field label="Complemento" className="sm:col-span-2"><input name="complement" defaultValue={d.complement} className="input" /></Field>
      <Field label="Bairro" className="sm:col-span-2"><input name="neighborhood" defaultValue={d.neighborhood} className="input" /></Field>
      <Field label="CEP" className="sm:col-span-2"><input name="zipcode" defaultValue={d.zipcode} className="input" /></Field>
      <Field label="Cidade" className="sm:col-span-4"><input name="city" defaultValue={d.city} className="input" /></Field>
      <Field label="UF" className="sm:col-span-2"><select name="state" defaultValue={d.state ?? ''} className="input"><option value="">—</option>{STATES.map((uf) => <option key={uf}>{uf}</option>)}</select></Field>
    </div>
  );
}

/**
 * Nova cobranca em etapas: cliente (cadastro lido dos documentos) -> cobranca -> contrato basico da operacao
 * -> fatura com Pix -> envio (WhatsApp, e-mail ou PDFs) do que estiver marcado.
 */
export function ChargeWizard({ clients, services, operations: initialOps, screens, today, hasAi }: {
  clients: Opt[]; services: ServiceOpt[]; operations: OperationOpt[]; screens: ScreenOpt[]; today: string; hasAi: boolean;
}) {
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // etapa 1
  const [clientMode, setClientMode] = useState<'existente' | 'novo'>('existente');
  const [draft, setDraft] = useState<Partial<ClientDraft> | null>(null);
  const [draftKey, setDraftKey] = useState(0);
  const [docNotes, setDocNotes] = useState<string[]>([]);
  const [client, setClient] = useState<WizardClient | null>(null);
  const [newClient, setNewClient] = useState(false); // cadastrado agora: contrato obrigatorio
  // etapas 2 a 5
  const [charge, setCharge] = useState<Charge | null>(null);
  const [ops, setOps] = useState(initialOps);
  const [opId, setOpId] = useState(initialOps.length === 1 ? initialOps[0].id : '');
  const [newOp, setNewOp] = useState(false);
  const [contract, setContract] = useState<Contract | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [docs, setDocs] = useState<WizardDocs | null>(null);
  const [pick, setPick] = useState({ contrato: true, fatura: true, pix: true });
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const invoiceFrame = useRef<HTMLIFrameElement>(null);
  const pixFrame = useRef<HTMLIFrameElement>(null);

  useEffect(() => { if (invoiceId && !docs) wizardDocs(invoiceId).then((r) => (r.ok ? setDocs(r) : setError(r.error))); }, [invoiceId, docs]);

  const run = async <T,>(fn: () => Promise<T>) => { setBusy(true); setError(''); try { return await fn(); } finally { setBusy(false); } };
  const go = (n: number) => { setError(''); setStep(n); setMaxStep((m) => Math.max(m, n)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const back = (n: number) => <button type="button" className="btn-ghost" onClick={() => go(n)} disabled={busy}><ArrowLeft size={15} /> Voltar</button>;

  // ---- etapa 1: cliente
  const pickExisting = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const id = String(new FormData(e.currentTarget).get('clientId') ?? '');
    const c = clients.find((x) => x.id === id);
    if (!c) { setError('Escolha o cliente.'); return; }
    setClient({ id: c.id, name: c.name, kind: c.kind }); setNewClient(false); go(1);
  };
  const readDocs = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(async () => {
      const r = await wizardReadDocs(fd);
      if (!r.ok) { setError(r.error); return; }
      setDraft(r.draft); setDocNotes(r.notes); setDraftKey((k) => k + 1);
    });
  };
  const saveClient = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(async () => {
      const r = await wizardSaveClient(fd);
      if (!r.ok) { setError(r.error); return; }
      setClient(r.client); setNewClient(true); go(1);
    });
  };

  // ---- etapa 2: cobranca
  const submitCharge = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(async () => {
      const r = await wizardCharge(fd);
      if (!r.ok) { setError(r.error); return; }
      setCharge(r); if (r.invoiceId && !r.subscriptionId) setInvoiceId(r.invoiceId); go(2);
    });
  };

  // ---- etapa 3: contrato
  const saveOp = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(async () => {
      const r = await upsertOperation(fd);
      if (!r.ok) { setError(r.error); return; }
      setOps([...ops, r.operation].sort((a, b) => a.name.localeCompare(b.name))); setOpId(r.operation.id); setNewOp(false);
    });
  };
  const makeContract = () => run(async () => {
    if (!opId) { setError('Escolha a operação do contrato.'); return; }
    const fd = new FormData();
    fd.set('clientId', charge!.clientId); fd.set('operationId', opId);
    if (charge!.subscriptionId) fd.set('subscriptionId', charge!.subscriptionId);
    if (charge!.invoiceId) fd.set('invoiceId', charge!.invoiceId);
    const r = await wizardContract(fd);
    if (!r.ok) { setError(r.error); return; }
    setContract(r);
  });

  // ---- etapa 4: fatura
  const makeInvoice = () => run(async () => {
    const r = await wizardInvoice(charge!.subscriptionId!);
    if (!r.ok) { setError(r.error); return; }
    setInvoiceId(r.invoiceId);
  });

  // ---- etapa 5: envio
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  // sem emojis: o link do WhatsApp (wa.me) estraga alguns deles em certos aparelhos
  const links = () => [
    pick.contrato && contract && `*CONTRATO* (leia e assine)\n${origin}${contract.publicUrl}`,
    pick.fatura && docs && `*FATURA*\n${origin}${docs.invoiceUrl}`,
    pick.pix && docs && `*PAGAR COM PIX* (toque no link para copiar o código)\n${origin}${docs.payUrl}`,
  ].filter(Boolean) as string[];
  const message = () => docs ? [
    `Olá, *${docs.clientName}*!`,
    `Seguem os documentos da *${docs.company}*.`,
    '',
    links().join('\n\n'),
    '',
    `*VALOR:* ${docs.amount}`,
    `*VENCIMENTO:* ${docs.due} (${docs.ref})`,
  ].join('\n') : '';
  const download = async (kind: 'contrato' | 'pix' | 'fatura') => {
    try {
      if (kind === 'contrato') { if (contract) await contractToPdf(contract.body, contract.fileName, contract.logo); }
      else {
        const frame = kind === 'pix' ? pixFrame.current : invoiceFrame.current;
        const make = (frame?.contentWindow as (Window & { __docPdf?: () => Promise<void> }) | null)?.__docPdf;
        if (!make) throw new Error('documento ainda carregando');
        await make();
      }
      setSaved((s) => ({ ...s, [kind]: true }));
    } catch {
      setError('Não foi possível gerar o PDF. Aguarde os documentos carregarem e tente de novo.');
    }
  };
  const downloadPicked = async () => {
    if (pick.contrato && contract) await download('contrato');
    if (pick.fatura) await download('fatura');
    if (pick.pix) await download('pix');
  };
  const nothing = !(pick.contrato && contract) && !pick.fatura && !pick.pix;
  const wa = docs ? `https://wa.me/${docs.phone ?? ''}?text=${encodeURIComponent(message())}` : '#';
  const mail = docs ? `mailto:${docs.email ?? ''}?subject=${encodeURIComponent(`${docs.company} — fatura nº ${docs.number} (${docs.ref})`)}&body=${encodeURIComponent(message().replace(/\*/g, ''))}` : '#';

  return (
    <div className="card p-5 sm:p-6">
      <Stepper step={step} max={maxStep} onGo={go} />
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200" role="alert">{error}</p>}

      {step === 0 && charge && client && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Users size={18} /> Cliente</h2>
          <p className="rounded-lg bg-ink-50 p-3 text-sm dark:bg-ink-900">Cliente: <b>{client.name}</b>. A cobrança já foi criada para este cliente, por isso ele não pode mais ser trocado aqui. Para cobrar outro cliente, comece uma <a href="/financeiro/nova" className="font-semibold text-brand-600 underline">nova cobrança</a>.</p>
          <div className="flex justify-end"><button type="button" className="btn-primary" onClick={() => go(1)}>Avançar</button></div>
        </div>
      )}

      {step === 0 && !charge && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Users size={18} /> Cliente</h2>
          <div className="flex gap-1 rounded-lg bg-ink-100 p-1 dark:bg-ink-900" role="radiogroup" aria-label="Cliente">
            {([['existente', 'Cliente já cadastrado'], ['novo', 'Cadastrar novo cliente']] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={clientMode === k} onClick={() => { setClientMode(k); setError(''); if (k === 'novo' && !draft) { setDraft({}); setDraftKey((x) => x + 1); } }}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold ${clientMode === k ? 'bg-white shadow-sm dark:bg-ink-700' : 'text-ink-500 dark:text-ink-300'}`}>{l}</button>
            ))}
          </div>
          {clientMode === 'existente' ? (
            <form onSubmit={pickExisting} className="space-y-4">
              <Field label="Cliente ou parceiro">
                <select name="clientId" required className="input" defaultValue={client && clients.some((c) => c.id === client.id) ? client.id : ''}>
                  <option value="" disabled>Selecione...</option>
                  {['cliente', 'parceiro'].map((k) => (
                    <optgroup key={k} label={k === 'cliente' ? 'Clientes' : 'Parceiros'}>
                      {clients.filter((c) => c.kind === k).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <div className="flex justify-end"><button className="btn-primary">Avançar</button></div>
            </form>
          ) : (
            <div className="space-y-4">
              <form onSubmit={readDocs} className="space-y-3 rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-4 dark:border-ink-600 dark:bg-ink-900">
                <p className="text-sm"><b>Opção 1 — envie documentos:</b> cartão CNPJ e, se quiser, outros documentos (contrato social, comprovante de endereço, cartão de visita). {hasAi ? 'A IA lê os documentos e preenche o cadastro.' : 'O sistema encontra o CNPJ no PDF e busca os dados na Receita. Para ler imagens e outros documentos, cadastre a chave da OpenAI em Minha empresa.'}</p>
                <input type="file" name="docs" multiple required accept="application/pdf,image/png,image/jpeg,image/webp" aria-label="Documentos do cliente" className="input" />
                <div className="flex flex-wrap justify-end gap-2">
                  <button className="btn-dark" disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <FileSearch size={15} />} Ler documentos</button>
                </div>
              </form>
              {draft && (
                <form key={draftKey} onSubmit={saveClient} className="space-y-4">
                  <p className="text-sm"><b>Opção 2 — pelo CNPJ:</b> digite o CNPJ e use <b>Buscar dados</b>, ou <b>Consultar no site da Receita</b> e depois <b>Importar cartão CNPJ (PDF)</b>. Também dá para preencher à mão.</p>
                  {docNotes.length > 0 && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{docNotes.join(' ')} Confira os dados antes de salvar.</p>}
                  <ClientFields d={draft} />
                  <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Salvar cliente e avançar</button></div>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {step === 1 && client && charge && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Receipt size={18} /> Cobrança</h2>
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{charge.message}</p>
          <p className="text-sm text-ink-500">A cobrança de <b>{client.name}</b> já foi criada. Para alterar valores ou vencimento, use o botão de editar a cobrança no Financeiro depois de concluir.</p>
          <div className="flex justify-between gap-2">{back(0)}<button type="button" className="btn-primary" onClick={() => go(2)}>Avançar</button></div>
        </div>
      )}

      {step === 1 && client && !charge && (
        <form onSubmit={submitCharge} className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Receipt size={18} /> Cobrança</h2>
          <ChargeFields clients={clients} today={today} services={services} fixedClient={client} />
          <div className="flex justify-between gap-2">
            <button type="button" className="btn-ghost" onClick={() => go(0)} disabled={busy}>Voltar</button>
            <button className="btn-primary" disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" />}Criar cobrança e avançar</button>
          </div>
        </form>
      )}

      {step === 2 && charge && (
        <div className="space-y-4">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{charge.message}</p>
          <h2 className="flex items-center gap-2 text-lg font-bold"><FileSignature size={18} /> Contrato</h2>
          {contract ? (
            <div className="space-y-3">
              <p className="text-sm">Contrato <b>{contract.title}</b> gerado.</p>
              <div className="flex flex-wrap gap-2">
                <a href={contract.publicUrl} target="_blank" rel="noreferrer" className="btn-ghost"><ExternalLink size={15} /> Ver contrato</a>
                <a href={`/contratos/${contract.contractId}`} target="_blank" rel="noreferrer" className="btn-ghost">Editar texto</a>
                <button type="button" className="btn-ghost" onClick={() => download('contrato')}>{saved.contrato ? <Check size={15} className="text-emerald-600" /> : <Download size={15} />} Baixar PDF</button>
              </div>
              <div className="flex justify-between gap-2">{back(1)}<button type="button" className="btn-primary" onClick={() => go(3)}>Avançar</button></div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-ink-500">Contrato básico, sempre no mesmo padrão: dados das partes, valor mensal, vigência por prazo indeterminado, proibição de conteúdo ofensivo, responsabilidade total do contratante pelo conteúdo e cancelamento com aviso de 30 dias, sem multa.</p>
              <Field label="Para qual operação é este contrato?" hint="Os pontos da operação entram no contrato">
                <div className="flex flex-wrap gap-2">
                  <select value={opId} onChange={(e) => setOpId(e.target.value)} aria-label="Operação" className="input max-w-md flex-1">
                    <option value="">{ops.length ? 'Selecione a operação...' : 'Nenhuma operação cadastrada'}</option>
                    {ops.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.screenIds.length} ponto{o.screenIds.length === 1 ? '' : 's'})</option>)}
                  </select>
                  <button type="button" className="btn-ghost" onClick={() => setNewOp(!newOp)} aria-expanded={newOp}><Plus size={15} /> Nova operação</button>
                </div>
              </Field>
              {newOp && (
                <form onSubmit={saveOp} className="space-y-3 rounded-lg border border-ink-100 bg-ink-50 p-4 dark:border-ink-700 dark:bg-ink-900">
                  <OperationFields screens={screens} />
                  <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setNewOp(false)}>Cancelar</button><button className="btn-dark" disabled={busy}>Salvar operação</button></div>
                </form>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <span className="mr-auto">{back(1)}</span>
                {newClient
                  ? <span className="self-center text-xs text-ink-400">Cliente novo: o contrato é obrigatório.</span>
                  : <button type="button" className="btn-ghost" onClick={() => go(3)} disabled={busy}><SkipForward size={15} /> Pular contrato</button>}
                <button type="button" className="btn-primary" onClick={makeContract} disabled={busy || !opId}>{busy ? <Loader2 size={15} className="animate-spin" /> : <FileSignature size={15} />} Gerar contrato</button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && charge && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Receipt size={18} /> Fatura e Pix</h2>
          {!invoiceId ? (
            <div className="space-y-3 rounded-lg bg-ink-50 p-4 dark:bg-ink-900">
              <p className="text-sm">A fatura desta cobrança ainda não foi gerada. Gere agora para enviar ao cliente junto com o Pix.</p>
              <button type="button" className="btn-primary" onClick={makeInvoice} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Receipt size={15} />} Gerar fatura</button>
            </div>
          ) : (
            <>
              <PixPanel invoiceId={invoiceId} />
              {docs && <div className="overflow-hidden rounded-lg border border-ink-100 dark:border-ink-700"><iframe ref={invoiceFrame} src={docs.invoiceUrl} title="Fatura" className="h-[60vh] w-full bg-white" /></div>}
            </>
          )}
          {charge.subscriptionId && <p className="text-xs text-ink-400">As próximas faturas desta cobrança, com o Pix, são geradas automaticamente no último dia de cada mês e ficam no Financeiro para baixar e enviar.</p>}
          <div className="flex justify-between gap-2">{back(2)}<button type="button" className="btn-primary" onClick={() => go(4)} disabled={!invoiceId}>Avançar</button></div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Send size={18} /> Enviar ao cliente</h2>
          {!docs ? <p className="flex items-center gap-2 text-sm text-ink-400"><Loader2 size={15} className="animate-spin" /> Preparando os documentos...</p> : (
            <>
              <fieldset className="space-y-2 rounded-lg border border-ink-100 p-4 dark:border-ink-700">
                <legend className="label px-1">Documentos</legend>
                <SelectAll total={contract ? 3 : 2} selected={(contract && pick.contrato ? 1 : 0) + (pick.fatura ? 1 : 0) + (pick.pix ? 1 : 0)} onChange={(on) => setPick({ contrato: on, fatura: on, pix: on })} className="border-b border-ink-100 pb-2 dark:border-ink-700" />
                {contract && <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={pick.contrato} onChange={(e) => setPick({ ...pick, contrato: e.target.checked })} className="h-4 w-4 accent-violet-600" /> Contrato <span className="text-xs text-ink-400">{contract.fileName}</span></label>}
                <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={pick.fatura} onChange={(e) => setPick({ ...pick, fatura: e.target.checked })} className="h-4 w-4 accent-violet-600" /> Fatura <span className="text-xs text-ink-400">{docs.invoiceFile}</span></label>
                <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={pick.pix} onChange={(e) => setPick({ ...pick, pix: e.target.checked })} className="h-4 w-4 accent-violet-600" /> Pix de pagamento <span className="text-xs text-ink-400">{docs.pixFile}</span></label>
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <a href={nothing ? undefined : wa} target="_blank" rel="noreferrer" aria-disabled={nothing} className={`btn bg-emerald-600 text-white hover:bg-emerald-500 ${nothing ? 'pointer-events-none opacity-50' : ''}`}><MessageCircle size={15} /> Enviar pelo WhatsApp</a>
                <a href={nothing ? undefined : mail} aria-disabled={nothing} className={`btn-ghost ${nothing ? 'pointer-events-none opacity-50' : ''}`}><Mail size={15} /> Enviar por e-mail</a>
                <button type="button" className="btn-dark" onClick={downloadPicked} disabled={nothing}><Download size={15} /> Baixar PDFs</button>
                <CopyButton text={message()} label="Copiar mensagem" />
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-ink-500">
                {Object.entries(saved).filter(([, v]) => v).map(([k]) => <span key={k} className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700"><Check size={12} /> {k === 'contrato' ? contract?.fileName : k === 'fatura' ? docs.invoiceFile : docs.pixFile}</span>)}
              </div>
              {!docs.phone && <p className="text-xs text-ink-400">O cadastro do cliente não tem celular: o WhatsApp abre para você escolher o contato.</p>}
              {!docs.email && <p className="text-xs text-ink-400">O cadastro do cliente não tem e-mail: o e-mail abre para você digitar o destinatário.</p>}
              <p className="text-xs text-ink-400">O WhatsApp e o e-mail levam os links dos documentos marcados. Se o navegador perguntar, permita baixar vários arquivos deste site.</p>
              {/* fatura e Pix fora da tela, so para gerar os PDFs */}
              <iframe ref={invoiceFrame} src={docs.invoiceUrl} title="Fatura (PDF)" aria-hidden tabIndex={-1} style={{ position: 'absolute', left: '-10000px', top: 0, width: '900px', height: '1300px' }} />
              <iframe ref={pixFrame} src={docs.pixUrl} title="Documento do Pix" aria-hidden tabIndex={-1} style={{ position: 'absolute', left: '-10000px', top: 0, width: '900px', height: '1300px' }} />
            </>
          )}
          <div className="flex justify-between gap-2">{back(3)}<Link href="/financeiro" className="btn-primary">Concluir</Link></div>
        </div>
      )}
    </div>
  );
}
