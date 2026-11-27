import Link from 'next/link';
import { FileImage, Plus, Trash2 } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtMoney } from '@/lib/money';
import { timeAgo } from '@/lib/util';
import { fileUrl } from '@/lib/storage';
import { folderConfig } from '@/lib/folder';
import { PROPOSAL_STATUS } from '@/lib/proposal';
import { Empty, PageHeader } from '@/components/basic';
import { ActionForm, Confirm, Field, Modal } from '@/components/ui';
import { PhotoInput } from '@/components/PhotoInput';
import { deleteProposal, saveProposalPages } from './actions';
import { SalesAssistant } from '@/components/SalesAssistant';
import { openaiKey } from '@/lib/ai-contract';

export default async function PropostasPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const status = sp.status && PROPOSAL_STATUS[sp.status] ? sp.status : undefined;
  const [rows, counts] = await Promise.all([
    db.proposal.findMany({ where: { tenantId: user.tenantId, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 }),
    db.proposal.groupBy({ by: ['status'], where: { tenantId: user.tenantId }, _count: true }),
  ]);
  const count = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const pages = folderConfig(user.tenant.folder).proposalPages;
  const tab = (k: string | undefined, label: string, n: number) => (
    <Link key={label} href={k ? `/propostas?status=${k}` : '/propostas'} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${status === k ? 'bg-ink-900 text-white dark:bg-brand-400 dark:text-on-brand' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700'}`}>{label} <span className="opacity-70">{n}</span></Link>
  );
  return (
    <>
      <PageHeader title="Propostas comerciais" crumbs={[{ label: 'Gestão' }, { label: 'Propostas' }]}>
        <Modal trigger={<><FileImage size={16} /> Páginas do folder</>} triggerClass="btn-ghost" title="Páginas do folder anexadas às propostas" wide>
          <ActionForm action={saveProposalPages} submit="Salvar páginas">
            <p className="text-sm text-ink-500">Estas páginas (imagens A4 em pé) entram no fim de toda proposta que tiver “Anexar o folder” marcado. Até 8 páginas.</p>
            <div className="grid grid-cols-4 gap-2">
              {pages.map((k) => (
                <label key={k} className="space-y-1 text-xs"><img src={fileUrl(k) ?? ''} alt="" className="aspect-[210/297] w-full rounded-lg object-cover ring-1 ring-ink-100" />{/* eslint-disable-line @next/next/no-img-element */}
                  <span className="flex items-center gap-1"><input type="checkbox" name="remove_page" value={k} className="accent-red-600" /> Remover</span></label>
              ))}
            </div>
            <Field label="Acrescentar páginas" hint="Imagens JPG/PNG em pé (A4). Exporte cada página do PDF como imagem."><PhotoInput name="pages" max={8} size={1500} /></Field>
          </ActionForm>
        </Modal>
        <SalesAssistant hasAi={!!openaiKey(user.tenant)} />
        <Link href="/propostas/nova" className="btn-primary"><Plus size={16} /> Nova proposta</Link>
      </PageHeader>
      <p className="mb-4 max-w-3xl text-sm text-ink-500">Monte a proposta do cliente pretendido, envie pelo WhatsApp e acompanhe. Quando o cliente <b>aceita e assina</b>, a proposta fica <b className="text-emerald-600">verde</b>, o cadastro dele é criado e libera o botão <b>Seguir para cobrança e contrato</b>.</p>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-ink-100 p-3 dark:border-ink-700">
          {tab(undefined, 'Todas', Object.values(count).reduce((a, n) => a + n, 0))}
          {Object.entries(PROPOSAL_STATUS).map(([k, v]) => tab(k, v.label + 's', count[k] ?? 0))}
        </div>
        {rows.length === 0 ? <Empty text="Nenhuma proposta ainda. Clique em Nova proposta." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr><th className="th">Nº</th><th className="th">Cliente</th><th className="th text-right">Valor mensal</th><th className="th">Situação</th><th className="th">Criada</th><th className="th"></th></tr></thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {rows.map((p) => (
                  <tr key={p.id} className={p.status === 'aceita' ? 'bg-emerald-50/60 dark:bg-emerald-950/30' : ''}>
                    <td className="td font-mono text-ink-500">{String(p.number).padStart(4, '0')}</td>
                    <td className="td"><Link href={`/propostas/${p.id}`} className="font-semibold hover:underline">{p.tradeName || p.companyName}</Link><span className="block text-xs text-ink-400">{[p.segment, p.city].filter(Boolean).join(' · ')}</span></td>
                    <td className="td text-right font-semibold tabular-nums">{fmtMoney(p.monthlyCents)}</td>
                    <td className="td"><span className={`badge ${PROPOSAL_STATUS[p.status]?.cls}`}>{PROPOSAL_STATUS[p.status]?.label}</span>{p.viewedAt && p.status === 'enviada' && <span className="block text-xs text-ink-400">vista {timeAgo(p.viewedAt)}</span>}</td>
                    <td className="td text-ink-500">{timeAgo(p.createdAt)}</td>
                    <td className="td"><span className="flex justify-end gap-1.5"><Link href={`/propostas/${p.id}`} className="btn-ghost !py-1.5">Abrir</Link>
                      <Confirm trigger={<Trash2 size={15} />} triggerClass="btn-icon !text-red-600" titleAttr="Excluir proposta" title={`Excluir a proposta nº ${p.number} (${p.tradeName || p.companyName})?`} confirmLabel="Excluir" action={deleteProposal} fields={{ id: p.id }}
                        text={p.status === 'aceita' ? 'Esta proposta já foi ACEITA e assinada pelo cliente: o registro do aceite será apagado. O cadastro do cliente e as cobranças continuam. O link enviado deixa de funcionar.' : 'O link enviado ao cliente deixa de funcionar. Esta operação não pode ser desfeita.'} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
