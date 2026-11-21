import { notFound } from 'next/navigation';
import { RefreshCw, Trash2 } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import { PageHeader } from '@/components/basic';
import { ActionForm, Confirm, Field, Tabs } from '@/components/ui';
import { deleteContract, refreshContract, saveContract } from '../../financeiro/actions';
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
          return <p key={i} className={`font-sans font-bold ${i === 0 ? 'text-center text-lg' : 'pt-3'}`}>{t}</p>;
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
  return (
    <>
      <PageHeader title={c.title} crumbs={[{ label: 'Financeiro', href: '/financeiro' }, { label: 'Contratos', href: '/financeiro?aba=contratos' }, { label: c.client.name }]}>
        <DownloadContractPdf body={c.body} fileName={contractFileName(c.client)} logo={fileUrl(user.tenant.logo)} auto={auto} />
        {c.operationId && <Confirm trigger={<><RefreshCw size={15} /> Refazer pelo modelo</>} triggerClass="btn-ghost" titleAttr="Refazer pelo modelo" title="Refazer o contrato pelo modelo padrão?" text="O texto é refeito com o modelo atual, os pontos da operação e os dados atualizados do cliente e da empresa. Edições feitas à mão neste contrato serão perdidas." confirmLabel="Sim, refazer" action={refreshContract} fields={{ id: c.id }} />}
        <Confirm trigger={<><Trash2 size={15} /> Excluir</>} triggerClass="btn-ghost !text-red-600" titleAttr="Excluir contrato" title="Excluir este contrato?" text="O texto do contrato será apagado. As cobranças do cliente não mudam." confirmLabel="Sim, excluir" action={deleteContract} fields={{ id: c.id }} />
      </PageHeader>
      <p className="mb-4 max-w-3xl rounded-lg bg-brand-50 p-3 text-sm text-ink-700 print:hidden dark:bg-ink-800 dark:text-ink-200">
        {c.operationId ? 'Contrato no modelo padrão, com os pontos da operação.' : 'Texto redigido por IA a partir do cadastro e das condições da cobrança.'} <b>Revise com atenção</b>, preencha os campos marcados com [PREENCHER] e, se possível, peça a validação de um advogado antes de assinar. Use “Baixar PDF” para salvar o arquivo.
      </p>
      <Tabs tabs={[
        { label: 'Visualizar', content: (
          <article className="card mx-auto max-w-3xl p-8 sm:p-12 print:max-w-none print:border-0 print:p-0 print:shadow-none">
            {user.tenant.logo && <img src={fileUrl(user.tenant.logo)!} alt="" className="mx-auto mb-6 h-14 object-contain" />}{/* eslint-disable-line @next/next/no-img-element */}
            <ContractText body={c.body} />
          </article>
        ) },
        { label: 'Editar texto', content: (
          <ActionForm action={saveContract} submit="Salvar contrato" className="card mx-auto max-w-3xl space-y-4 p-5">
            <input type="hidden" name="id" value={c.id} />
            <Field label="Título"><input name="title" defaultValue={c.title} className="input" /></Field>
            <Field label="Texto do contrato"><textarea name="body" defaultValue={c.body} rows={30} className="input font-mono text-xs leading-relaxed" /></Field>
          </ActionForm>
        ) },
      ]} />
    </>
  );
}
