import { notFound } from 'next/navigation';
import { ExternalLink, MessageCircle, RefreshCw, Trash2 } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import { PageHeader } from '@/components/basic';
import { ActionForm, Confirm, Field, Tabs } from '@/components/ui';
import { deleteContract, refreshContract, reopenContract, saveContract, shareContract } from '../../financeiro/actions';
import { headers } from 'next/headers';
import { CopyButton } from '@/components/CopyButton';
import { SignatureBlock } from '@/components/ContractSign';
import { refusedWhen, signatureInfo } from '@/lib/contract-sign';
import { DownloadContractPdf } from '@/components/PdfButtons';
import { contractFileName } from '@/lib/doc-names';

/** Linhas de clausula e titulos em destaque; o resto como paragrafo. */
function ContractText({ body }: { body: string }) {
  const lines = body.split('\n');
  return (
    <div className="space-y-2 font-serif text-[15px] leading-relaxed text-ink-800 print:text-black">
      {lines.map((l, i) => {
        const t = l.trim();
        if (!t) return <div key={i} className="h-2" />;
        if (i === 0 || /^CL[ÁA]USULA\b/i.test(t) || (t === t.toUpperCase() && /[A-ZÀ-Ú]{4}/.test(t) && t.length < 120))
          return <p key={i} className={`font-sans font-bold uppercase tracking-wide ${i === 0 ? 'pb-2 text-center text-lg' : 'pt-6'}`}>{t}</p>;
        return <p key={i} className="whitespace-pre-wrap text-justify">{t}</p>;
      })}
    </div>
  );
}

export default async function ContratoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ baixar?: string }> }) {
  const { id } = await params;
  const auto = (await searchParams).baixar === '1';
  const user = await requireAdmin();
  const c = await db.contract.findFirst({ where: { id, tenantId: user.tenantId }, include: { client: true } });
  if (!c) notFound();
  const sig = signatureInfo(c);
  const signed = c.signStatus === 'assinado';
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const link = c.publicToken ? `${origin}/contrato/${c.publicToken}` : null;
  const phone = (c.client.phone1 ?? '').replace(/\D/g, '');
  const wa = link ? `https://wa.me/${phone.length >= 10 ? (phone.startsWith('55') && phone.length >= 12 ? phone : '55' + phone) : ''}?text=${encodeURIComponent(`Olá, ${c.client.tradeName || c.client.name}! Segue o contrato da ${user.tenant.tradeName || user.tenant.name} para você ler e assinar:\n${link}`)}` : null;
  return (
    <>
      <PageHeader title={c.title} crumbs={[{ label: 'Financeiro', href: '/financeiro' }, { label: 'Contratos', href: '/financeiro?aba=contratos' }, { label: c.client.name }]}>
        <DownloadContractPdf body={c.body} fileName={contractFileName(c.client)} logo={fileUrl(user.tenant.logo)} auto={auto} sig={sig} />
        {c.operationId && !signed && <Confirm trigger={<><RefreshCw size={15} /> Refazer pelo modelo</>} triggerClass="btn-ghost" titleAttr="Refazer pelo modelo" title="Refazer o contrato pelo modelo padrão?" text="O texto é refeito com o modelo atual, os pontos da operação e os dados atualizados do cliente e da empresa. Edições feitas à mão neste contrato serão perdidas." confirmLabel="Sim, refazer" action={refreshContract} fields={{ id: c.id }} />}
        <Confirm trigger={<><Trash2 size={15} /> Excluir</>} triggerClass="btn-ghost !text-red-600" titleAttr="Excluir contrato" title="Excluir este contrato?" text="O texto do contrato será apagado. As cobranças do cliente não mudam." confirmLabel="Sim, excluir" action={deleteContract} fields={{ id: c.id }} />
      </PageHeader>
      <section className="card mb-4 max-w-3xl space-y-2 p-4 print:hidden">
        <p className="text-sm">Assinatura do cliente: <b className={signed ? 'text-emerald-600' : c.signStatus === 'recusado' ? 'text-red-600' : 'text-amber-600'}>{signed ? `assinado por ${sig?.name} em ${sig?.when}` : c.signStatus === 'recusado' ? `recusado em ${refusedWhen(c)}` : 'aguardando assinatura'}</b></p>
        {c.signStatus === 'recusado' && (
          <>
            {c.refuseReason && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Motivo: {c.refuseReason}</p>}
            <ActionForm action={reopenContract} submit="Liberar para assinar de novo" submitClass="btn-ghost" className="space-y-2"><input type="hidden" name="id" value={c.id} /><p className="text-xs text-ink-400">Ajuste o texto em “Editar texto” e libere: o mesmo link volta a aceitar assinatura.</p></ActionForm>
          </>
        )}
        {link ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all rounded bg-ink-50 px-2 py-1 font-mono text-xs dark:bg-ink-900">{link}</span>
            <CopyButton text={link} label="Copiar link" />
            {!signed && wa && <a href={wa} target="_blank" rel="noreferrer" className="btn bg-emerald-600 text-white hover:bg-emerald-500"><MessageCircle size={15} /> Enviar para assinar</a>}
            <a href={link} target="_blank" rel="noreferrer" className="btn-ghost"><ExternalLink size={15} /> Abrir</a>
          </div>
        ) : <ActionForm action={shareContract} submit="Criar link para o cliente assinar" submitClass="btn-dark" className=""><input type="hidden" name="id" value={c.id} /></ActionForm>}
      </section>
      <p className="mb-4 max-w-3xl rounded-lg bg-brand-50 p-3 text-sm text-ink-700 print:hidden dark:bg-ink-800 dark:text-ink-200">
        {c.operationId ? 'Contrato no modelo padrão, com os pontos da operação.' : 'Texto redigido por IA a partir do cadastro e das condições da cobrança.'} <b>Revise com atenção</b>, preencha os campos marcados com [PREENCHER] e, se possível, peça a validação de um advogado antes de assinar. Use “Baixar PDF” para salvar o arquivo.
      </p>
      <Tabs tabs={[
        { label: 'Visualizar', content: (
          <article className="card mx-auto max-w-3xl p-8 sm:p-12 print:max-w-none print:border-0 print:p-0 print:shadow-none">
            {user.tenant.logo && <img src={fileUrl(user.tenant.logo)!} alt="" className="mx-auto mb-6 h-14 object-contain" />}{/* eslint-disable-line @next/next/no-img-element */}
            <ContractText body={c.body} />
            {sig && <SignatureBlock sig={sig} />}
          </article>
        ) },
        ...(signed ? [] : [{ label: 'Editar texto', content: (
          <ActionForm action={saveContract} submit="Salvar contrato" className="card mx-auto max-w-3xl space-y-4 p-5">
            <input type="hidden" name="id" value={c.id} />
            <Field label="Título"><input name="title" defaultValue={c.title} className="input" /></Field>
            <Field label="Texto do contrato"><textarea name="body" defaultValue={c.body} rows={30} className="input font-mono text-xs leading-relaxed" /></Field>
          </ActionForm>
        ) }]),
      ]} />
    </>
  );
}
