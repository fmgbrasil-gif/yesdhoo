import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { Empty, PageHeader } from '@/components/basic';
import { ActionForm, Confirm, Modal } from '@/components/ui';
import { OperationFields } from '@/components/OperationFields';
import { screenOptions } from '@/lib/operations';
import { deleteOperation, saveOperation } from './actions';

export const metadata = { title: 'Operações' };

export default async function OperacoesPage() {
  const user = await requireAdmin();
  const [ops, screens, accounts] = await Promise.all([
    db.operation.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, include: { screens: { select: { id: true, name: true }, orderBy: { name: 'asc' } }, account: { select: { name: true } }, _count: { select: { contracts: true } } } }),
    screenOptions(user.tenantId),
    db.bankAccount.findMany({ where: { tenantId: user.tenantId, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Operações" crumbs={[{ label: 'Operações' }]}>
        <Modal trigger={<><Plus size={16} /> Nova operação</>} title="Nova operação" wide><ActionForm action={saveOperation}><OperationFields screens={screens} accounts={accounts} /></ActionForm></Modal>
      </PageHeader>
      <p className="mb-4 max-w-3xl text-sm text-ink-500">Uma operação é um conjunto de pontos (telas) que o contrato contempla. Na Nova cobrança, você escolhe a operação e os pontos dela entram no contrato.</p>
      {ops.length === 0 ? <div className="card"><Empty title="Nenhuma operação" text="Crie a primeira operação e marque os pontos parceiros que ela contempla." /></div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ops.map((o) => (
            <div key={o.id} className="card p-5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div><h2 className="font-bold">{o.name}</h2>{o.description && <p className="text-sm text-ink-500">{o.description}</p>}</div>
                <div className="flex gap-1">
                  <Modal trigger={<Pencil size={15} />} triggerClass="btn-icon" titleAttr="Editar" title={`Editar ${o.name}`} wide>
                    <ActionForm action={saveOperation}><OperationFields screens={screens} accounts={accounts} op={{ id: o.id, name: o.name, description: o.description, screenIds: o.screens.map((s) => s.id), accountId: o.accountId }} /></ActionForm>
                  </Modal>
                  <Confirm trigger={<Trash2 size={15} />} titleAttr="Excluir" title={`Excluir ${o.name}?`} text={o._count.contracts ? `Os ${o._count.contracts} contrato(s) já gerados continuam salvos.` : 'Os pontos (telas) não são apagados.'} action={deleteOperation} fields={{ id: o.id }} />
                </div>
              </div>
              <p className="mb-2 text-xs text-ink-500">Recebimentos entram em: <b>{o.account?.name ?? 'conta padrão'}</b></p>
              <p className="label">{o.screens.length} ponto(s)</p>
              <ul className="mt-1 space-y-0.5 text-sm">{o.screens.slice(0, 8).map((s) => <li key={s.id} className="flex items-center gap-1.5"><MapPin size={13} className="text-brand-500" /> {s.name}</li>)}{o.screens.length > 8 && <li className="text-xs text-ink-400">+ {o.screens.length - 8} ponto(s)</li>}</ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
