import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { folderConfig } from '@/lib/folder';
import { ProposalView } from '@/components/ProposalView';
import { ProposalSign } from '@/components/ProposalSign';
import { PrintButton } from '@/components/PrintButton';

export const metadata: Metadata = { title: 'Proposta comercial', robots: { index: false, follow: false } };

/** Proposta publica: o cliente le, aceita com assinatura (no topo) ou recusa. */
export default async function PropostaPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{20,40}$/.test(token)) notFound();
  const p = await db.proposal.findUnique({ where: { publicToken: token }, include: { tenant: true } });
  if (!p) notFound();
  if (!p.viewedAt) await db.proposal.update({ where: { id: p.id }, data: { viewedAt: new Date() } });
  const expired = !!p.validUntil && p.validUntil < new Date().toISOString().slice(0, 10);
  const pending = p.status === 'rascunho' || p.status === 'enviada';
  return (
    <main className="min-h-screen bg-[#ece8f4] px-3 py-4 sm:py-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden"><PrintButton /></div>
      {pending && !expired && <ProposalSign token={token} company={p.tradeName || p.companyName} />}
      {pending && expired && <p className="mx-auto mb-6 max-w-[210mm] rounded-2xl bg-amber-50 p-4 text-center text-sm font-semibold text-amber-900 print:hidden">Esta proposta venceu. Fale com a gente para receber uma proposta atualizada.</p>}
      {p.status === 'aceita' && <p className="mx-auto mb-6 max-w-[210mm] rounded-2xl bg-emerald-600 p-4 text-center font-bold text-white print:hidden">Proposta aceita! Obrigado, {p.signerName?.split(' ')[0]}. Em breve você recebe o contrato.</p>}
      {p.status === 'recusada' && <p className="mx-auto mb-6 max-w-[210mm] rounded-2xl bg-red-50 p-4 text-center text-sm font-semibold text-red-700 print:hidden">Proposta recusada. Se quiser, fale com a gente para ajustarmos.</p>}
      <div><ProposalView p={p} tenant={p.tenant} pages={folderConfig(p.tenant.folder).proposalPages} /></div>
    </main>
  );
}
