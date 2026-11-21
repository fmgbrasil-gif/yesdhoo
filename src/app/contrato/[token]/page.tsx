import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import { contractFileName } from '@/lib/doc-names';
import { DownloadContractPdf } from '@/components/PdfButtons';

export const metadata: Metadata = { title: 'Contrato', robots: { index: false, follow: false } };

/** Contrato para o cliente ler e baixar em PDF (link enviado por WhatsApp ou e-mail). */
export default async function ContratoPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{20,40}$/.test(token)) notFound();
  const c = await db.contract.findUnique({ where: { publicToken: token }, include: { client: true, tenant: true } });
  if (!c) notFound();
  const logo = fileUrl(c.tenant.logo);
  const fileName = contractFileName(c.client);
  return (
    <main className="min-h-screen bg-gray-200 px-3 py-6 text-black">
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-lg font-bold text-gray-800">{c.title}</h1><p className="text-xs text-gray-500">{c.tenant.tradeName || c.tenant.name}</p></div>
        <DownloadContractPdf body={c.body} fileName={fileName} logo={logo} />
      </div>
      <article className="mx-auto max-w-[210mm] bg-white p-8 shadow sm:p-14" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
        {logo && <img src={logo} alt="" className="mb-6 h-14 w-auto" />}{/* eslint-disable-line @next/next/no-img-element */}
        {c.body.split('\n').map((line, i) => {
          const head = i === 0 || /^CLÁUSULA /.test(line);
          return line.trim() === '' ? <div key={i} className="h-3" /> : <p key={i} className={`text-[13px] leading-relaxed ${i === 0 ? 'mb-2 text-center text-base font-bold' : head ? 'mt-2 font-bold' : 'text-justify'}`}>{line}</p>;
        })}
      </article>
    </main>
  );
}
