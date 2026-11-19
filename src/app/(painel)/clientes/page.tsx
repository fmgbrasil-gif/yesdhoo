import type { Client } from '@prisma/client';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import { STATES } from '@/lib/constants';
import { Avatar, Empty, PageHeader, Pagination, pageParams } from '@/components/basic';
import { ActionForm, Confirm, Field, Modal } from '@/components/ui';
import { deleteClient, saveClient } from './actions';

function ClientFields({ c }: { c?: Client }) {
  const f = (name: keyof Client, label: string, cls = '', extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} className={cls}><input name={name} defaultValue={(c?.[name] as string) ?? ''} className="input" {...extra} /></Field>
  );
  return (
    <>
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid grid-cols-6 gap-3">
        <Field label="Tipo" className="col-span-2">
          <select name="type" defaultValue={c?.type ?? 'PJ'} className="input"><option value="PJ">Jurídica</option><option value="PF">Física</option></select>
        </Field>
        {f('document', 'CPF / CNPJ', 'col-span-4')}
        {f('name', 'Nome', 'col-span-6', { required: true, placeholder: 'Ex.: Padaria Pão Quente' })}
        <Field label="Imagem / logo" className="col-span-6"><input type="file" name="image" accept="image/*" className="input" /></Field>
        {f('email', 'E-mail', 'col-span-6', { type: 'email' })}
        {f('phone1', 'Telefone 1', 'col-span-3')}
        {f('phone2', 'Telefone 2', 'col-span-3')}
        {f('road', 'Endereço', 'col-span-4', { placeholder: 'Ex.: Avenida Brasil' })}
        {f('number', 'Número', 'col-span-2')}
        {f('complement', 'Complemento', 'col-span-2')}
        {f('neighborhood', 'Bairro', 'col-span-2')}
        {f('zipcode', 'CEP', 'col-span-2')}
        {f('city', 'Cidade', 'col-span-4')}
        <Field label="Estado" className="col-span-2"><select name="state" defaultValue={c?.state ?? ''} className="input"><option value="">—</option>{STATES.map((uf) => <option key={uf}>{uf}</option>)}</select></Field>
      </div>
    </>
  );
}

export default async function ClientesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { page, size, skip, take } = pageParams(sp);
  const where = { tenantId: user.tenantId, ...(sp.q ? { name: { contains: sp.q } } : {}), ...(sp.doc ? { document: sp.doc.replace(/\D/g, '') } : {}) };
  const [rows, total] = await Promise.all([
    db.client.findMany({ where, skip, take, orderBy: { name: 'asc' }, include: { _count: { select: { medias: true } } } }),
    db.client.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Clientes" crumbs={[{ label: 'Clientes' }]}>
        <Modal trigger={<><Plus size={16} /> Novo cliente</>} title="Novo cliente"><ActionForm action={saveClient}><ClientFields /></ActionForm></Modal>
      </PageHeader>
      <div className="card overflow-hidden">
        <form className="flex flex-wrap gap-2 border-b border-ink-100 p-3 dark:border-ink-700">
          <input name="q" defaultValue={sp.q} placeholder="Buscar por nome..." className="input w-56" aria-label="Nome" />
          <input name="doc" defaultValue={sp.doc} placeholder="Buscar por CPF/CNPJ..." className="input w-56" aria-label="CPF/CNPJ" />
          <button className="btn-ghost"><Search size={15} /> Filtrar</button>
        </form>
        {rows.length === 0 ? <Empty text="Cadastre os anunciantes para organizar as mídias por cliente." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-ink-100 dark:border-ink-700"><tr><th className="th">Cliente</th><th className="th">Cidade</th><th className="th">Telefone</th><th className="th">Mídias</th><th className="th text-right">Ações</th></tr></thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="td"><span className="flex items-center gap-3"><Avatar src={fileUrl(c.image)} name={c.name} /><span><span className="block font-semibold">{c.name}</span><span className="text-xs text-ink-400">{c.email ?? ''}</span></span></span></td>
                    <td className="td text-ink-500">{c.city ? `${c.city}${c.state ? '/' + c.state : ''}` : '—'}</td>
                    <td className="td text-ink-500">{c.phone1 ?? '—'}</td>
                    <td className="td font-semibold">{c._count.medias}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1.5">
                        <Modal trigger={<Pencil size={15} />} triggerClass="btn-icon" titleAttr="Editar" title="Editar cliente"><ActionForm action={saveClient}><ClientFields c={c} /></ActionForm></Modal>
                        <Confirm trigger={<Trash2 size={15} />} titleAttr="Remover" title="Excluir este cliente?" text={`“${c.name}” será excluído. As mídias dele continuam cadastradas como avulsas.`} confirmLabel="Sim, quero excluir" action={deleteClient} fields={{ id: c.id }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} size={size} total={total} params={sp} base="/clientes" />
      </div>
    </>
  );
}
