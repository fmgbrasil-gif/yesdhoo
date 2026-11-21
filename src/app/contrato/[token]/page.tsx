import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import { contractFileName } from '@/lib/doc-names';
import { DownloadContractPdf } from '@/components/PdfButtons';
import { ContractSign, SignatureBlock } from '@/components/ContractSign';
import { refusedWhen, signatureInfo } from '@/lib/contract-sign';

/** Previa do link no WhatsApp: empresa e convite para assinar. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const c = /^[\w-]{20,40}$/.test(token) ? await db.contract.findUnique({ where: { publicToken: token }, include: { tenant: true } }) : null;
  const company = c ? c.tenant.tradeName || c.tenant.name : '';
  const title = c ? `Contrato — ${company}` : 'Contrato';
  const description = !c ? '' : c.signStatus === 'assinado' ? 'Contrato assinado. Toque para ver e baixar o PDF.' : 'Toque para ler o contrato e assinar com sua rubrica.';
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description } };
}

/** Contrato para o cliente ler e baixar em PDF (link enviado por WhatsApp ou e-mail). */
export default async function ContratoPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{20,40}$/.test(token)) notFound();
  const c = await db.contract.findUnique({ where: { publicToken: token }, include: { client: true, tenant: true } });
  if (!c) notFound();
  const logo = fileUrl(c.tenant.logo);
  const fileName = contractFileName(c.client);
  const sig = signatureInfo(c);
  return (
    <main className="min-h-screen bg-gray-200 px-3 py-6 text-black">
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-lg font-bold text-gray-800">{c.title}</h1><p className="text-xs text-gray-500">{c.tenant.tradeName || c.tenant.name}</p></div>
        <DownloadContractPdf body={c.body} fileName={fileName} logo={logo} sig={sig} />
      </div>
      {c.signStatus === 'assinado' && <p className="mx-auto mb-4 max-w-[210mm] rounded-xl bg-emerald-600 px-4 py-3 text-center font-semibold text-white">✓ Contrato assinado. Obrigado! Baixe o PDF para guardar sua via.</p>}
      {c.signStatus === 'recusado' && <p className="mx-auto mb-4 max-w-[210mm] rounded-xl bg-red-600 px-4 py-3 text-center font-semibold text-white">Contrato recusado em {refusedWhen(c)}. A {c.tenant.tradeName || c.tenant.name} vai entrar em contato.</p>}
      <article className="mx-auto max-w-[210mm] bg-white p-8 shadow sm:p-14" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
        {logo && <img src={logo} alt="" className="mb-6 h-14 w-auto" />}{/* eslint-disable-line @next/next/no-img-element */}
        {c.body.split('\n').map((line, i) => {
          const head = i === 0 || /^CLÁUSULA /.test(line);
          return line.trim() === '' ? <div key={i} className="h-3" /> : <p key={i} className={`leading-relaxed ${i === 0 ? 'mb-4 text-center text-lg font-bold uppercase tracking-wide' : head ? 'mb-1 mt-6 text-[13.5px] font-bold uppercase tracking-wide text-gray-900' : 'text-justify text-[13px]'}`}>{line}</p>;
        })}
        {sig && <SignatureBlock sig={sig} />}
      </article>
      {c.signStatus === 'pendente' && <ContractSign token={token} />}
    </main>
  );
}
