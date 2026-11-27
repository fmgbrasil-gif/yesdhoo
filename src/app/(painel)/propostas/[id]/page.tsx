import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { ArrowRight, Copy as CopyIcon, ExternalLink, Pencil, Trash2, Wallet } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtMoney } from '@/lib/money';
import { folderConfig } from '@/lib/folder';
import { networkStats, PROPOSAL_STATUS } from '@/lib/proposal';
import { timeAgo } from '@/lib/util';
import { PageHeader } from '@/components/basic';
import { ActionButton, ActionForm, Confirm, Modal } from '@/components/ui';
import { ProposalFields } from '@/components/ProposalForm';
import { ProposalView } from '@/components/ProposalView';
import { ProposalSend } from '@/components/ProposalSend';
import { deleteProposal, duplicateProposal, saveProposal } from '../actions';
import { SalesAssistant } from '@/components/SalesAssistant';
import { openaiKey } from '@/lib/ai-contract';

const waPhone = (p: string | null) => { const d = (p ?? '').replace(/\D/g, ''); return d.length >= 10 ? (d.startsWith('55') && d.length >= 12 ? d : `55${d}`) : null; };

export default async function PropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdmin();
  const p = await db.proposal.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!p) notFound();
  const net = await networkStats(user.tenantId);
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const url = `${origin}/proposta/${p.publicToken}`;
  const st = PROPOSAL_STATUS[p.status];
  const who = p.tradeName || p.companyName;
  const company = user.tenant.tradeName || user.tenant.name;
  const text = `*PROPOSTA COMERCIAL - ${company.toUpperCase()}*\n\nOlá${p.contactName ? `, ${p.contactName.split(' ')[0]}` : ''}! Preparamos uma proposta especial para a ${who} anunciar nas nossas telas de mídia indoor.\n\nInvestimento mensal: ${fmtMoney(p.monthlyCents)}\n\nVeja a proposta completa e, se estiver de acordo, aceite com a sua assinatura no próprio link:\n${url}`;
  const ok = p.status === 'aceita';
  return (
    <>
      <PageHeader title={<>Proposta nº {String(p.number).padStart(4, '0')} · {who}</>} crumbs={[{ label: 'Propostas', href: '/propostas' }, { label: who }]}>
        <span className={`badge ${st.cls}`}>{st.label}</span>
      </PageHeader>

      {ok ? (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-4 border-2 border-emerald-500 bg-emerald-50 p-5 dark:bg-emerald-950">
          <div>
            <p className="text-lg font-black text-emerald-800 dark:text-emerald-200">Proposta aceita e assinada</p>
            <p className="text-sm text-emerald-900 dark:text-emerald-100">{p.signerName} aceitou {timeAgo(p.acceptedAt)}. O cadastro do cliente já foi criado. Próximo passo: cobrança e contrato.</p>
          </div>
          {p.clientId && <Link href={`/financeiro/nova?cliente=${p.clientId}&proposta=${encodeURIComponent(`nº ${p.number} · ${who}`)}`} className="btn bg-emerald-600 px-5 py-3 text-base font-bold text-white hover:bg-emerald-500">Seguir para cobrança e contrato <ArrowRight size={18} /></Link>}
        </div>
      ) : p.status === 'recusada' ? (
        <div className="card mb-6 border-2 border-red-300 bg-red-50 p-5 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"><b>Proposta recusada</b> {timeAgo(p.refusedAt)}{p.refuseReason ? `: “${p.refuseReason}”` : '.'} Ajuste em Editar (ela volta a rascunho) e envie de novo.</div>
      ) : (
        <div className="card mb-6 border-2 border-sky-200 p-4 text-sm text-ink-600 dark:text-ink-300">
          {p.status === 'enviada' ? <>Enviada {timeAgo(p.sentAt)}{p.viewedAt ? <> · <b>o cliente abriu {timeAgo(p.viewedAt)}</b></> : ' · ainda não aberta pelo cliente'}. Aguardando o aceite.</> : 'Rascunho: confira a proposta abaixo e envie para o cliente.'}
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        <SalesAssistant proposalId={p.id} phone={waPhone(p.phone)} client={who} hasAi={!!openaiKey(user.tenant)} />
        {!ok && <ProposalSend id={p.id} url={url} phone={waPhone(p.phone)} text={text} />}
        <a href={url} target="_blank" rel="noreferrer" className="btn-ghost"><ExternalLink size={16} /> Abrir como o cliente vê</a>
        <Link href={p.clientId ? `/financeiro/nova?cliente=${p.clientId}&proposta=${encodeURIComponent(`nº ${p.number} · ${who}`)}` : '/financeiro/nova'} className="btn-ghost" title={p.clientId ? 'Abre a Nova cobrança com este cliente já escolhido' : 'Abre a Nova cobrança (o cliente ainda não aceitou: cadastre-o por lá)'}><Wallet size={16} /> Gerar nova cobrança</Link>
        {!ok && (
          <Modal trigger={<><Pencil size={16} /> Editar</>} triggerClass="btn-ghost" title={`Editar proposta nº ${p.number}`} wide>
            <ActionForm action={saveProposal}><ProposalFields p={p} net={net} /></ActionForm>
          </Modal>
        )}
        <ActionButton action={duplicateProposal} fields={{ id: p.id }} className="btn-ghost" title="Criar uma cópia desta proposta"><CopyIcon size={16} /> Duplicar</ActionButton>
        {!ok && <Confirm trigger={<><Trash2 size={16} /> Excluir</>} triggerClass="btn-ghost !text-red-600" title="Excluir esta proposta?" text="O link enviado ao cliente deixa de funcionar." action={deleteProposal} fields={{ id: p.id }} confirmLabel="Excluir" />}
      </div>

      <div className="overflow-x-auto rounded-xl bg-[#ece8f4] p-4"><ProposalView p={p} tenant={user.tenant} pages={folderConfig(user.tenant.folder).proposalPages} /></div>
    </>
  );
}
