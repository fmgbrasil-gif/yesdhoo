import type { Client } from '@prisma/client';
import { Pencil, Plus, Power, Search, Trash2 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { db, like } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import { STATES } from '@/lib/constants';
import { fmtMoney } from '@/lib/money';
import Link from 'next/link';
import { Avatar, Empty, PageHeader, Pagination, pageParams } from '@/components/basic';
import { ActionForm, Confirm, Field, Modal } from '@/components/ui';
import { deleteClient, saveClient, toggleClient } from './actions';
import { CnpjLookup } from '@/components/CnpjLookup';

function ClientFields({ c }: { c?: Client }) {
  const f = (name: keyof Client, label: string, cls = '', extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} className={cls}><input name={name} defaultValue={(c?.[name] as string) ?? ''} className="input" {...extra} /></Field>
  );
  return (
    <>
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid grid-cols-6 gap-3">
        <Field label="Cadastro" className="col-span-6">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="kind" value="cliente" defaultChecked={c?.kind !== 'parceiro'} className="accent-violet-500" /> Cliente (anunciante, compra mídia)</label>
            <label className="flex items-center gap-2"><input type="radio" name="kind" value="parceiro" defaultChecked={c?.kind === 'parceiro'} className="accent-violet-500" /> Parceiro (local onde fica a tela)</label>
          </div>
        </Field>
        <Field label="Tipo" className="col-span-2">
          <select name="type" defaultValue={c?.type ?? 'PJ'} className="input"><option value="PJ">Jurídica</option><option value="PF">Física</option></select>
        </Field>
        <Field label="CPF / CNPJ" hint="Com CNPJ, os dados são buscados na Receita Federal" className="col-span-4"><CnpjLookup defaultValue={c?.document} /></Field>
        {f('name', 'Nome / razão social', 'col-span-6', { required: true, placeholder: 'Ex.: Padaria Pão Quente Ltda' })}
        {f('tradeName', 'Nome fantasia', 'col-span-3')}
        {f('stateRegistration', 'Inscrição estadual', 'col-span-3')}
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
  const kind = sp.tipo === 'parceiro' || sp.tipo === 'cliente' ? sp.tipo : undefined;
  const where = { tenantId: user.tenantId, ...(kind ? { kind } : {}), ...(sp.q ? { name: like(sp.q) } : {}), ...(sp.doc ? { document: sp.doc.replace(/\D/g, '') } : {}) };
  const counts = Object.fromEntries((await db.client.groupBy({ by: ['kind'], where: { tenantId: user.tenantId }, _count: true })).map((g) => [g.kind, g._count]));
  const tab = (k: string | undefined, label: string, n: number) => (
    <Link href={k ? `/clientes?tipo=${k}` : '/clientes'} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${kind === k ? 'bg-ink-900 text-white dark:bg-brand-400 dark:text-on-brand' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700'}`}>{label} <span className="opacity-70">{n}</span></Link>
  );
  const [rows, total] = await Promise.all([
    db.client.findMany({ where, skip, take, orderBy: [{ active: 'desc' }, { name: 'asc' }], include: { _count: { select: { medias: true } }, subscriptions: { where: { status: 'ativa' }, select: { amountCents: true, mode: true } } } }),
    db.client.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Clientes e parceiros" crumbs={[{ label: 'Clientes e parceiros' }]}>
        <Link href="/financeiro/nova" className="btn-primary" title="Clientes novos são cadastrados pela Nova cobrança, junto com a cobrança e o contrato"><Plus size={16} /> Novo cliente</Link>
      </PageHeader>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-ink-100 p-3 dark:border-ink-700">{tab(undefined, 'Todos', (counts.cliente ?? 0) + (counts.parceiro ?? 0))}{tab('cliente', 'Clientes', counts.cliente ?? 0)}{tab('parceiro', 'Parceiros', counts.parceiro ?? 0)}</div>
        <form className="flex flex-wrap gap-2 border-b border-ink-100 p-3 dark:border-ink-700">
          {kind && <input type="hidden" name="tipo" value={kind} />}
          <input name="q" defaultValue={sp.q} placeholder="Buscar por nome..." className="input w-56" aria-label="Nome" />
          <input name="doc" defaultValue={sp.doc} placeholder="Buscar por CPF/CNPJ..." className="input w-56" aria-label="CPF/CNPJ" />
          <button className="btn-ghost"><Search size={15} /> Filtrar</button>
        </form>
        {rows.length === 0 ? <Empty text="Cadastre os anunciantes para organizar as mídias por cliente." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-ink-100 dark:border-ink-700"><tr><th className="th">Cliente</th><th className="th">Cidade</th><th className="th">Telefone</th><th className="th">Mídias</th><th className="th">Cobrança mensal</th><th className="th text-right">Ações</th></tr></thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {rows.map((c) => (
                  <tr key={c.id} className={c.active ? '' : 'opacity-60'}>
                    <td className="td"><span className="flex items-center gap-3"><Avatar src={fileUrl(c.image)} name={c.name} /><span><span className="block font-semibold">{c.name}</span><span className="text-xs text-ink-400"><span className={`badge mr-1 ${c.kind === 'parceiro' ? 'bg-sky-100 text-sky-700' : 'bg-brand-100 text-brand-700'}`}>{c.kind === 'parceiro' ? 'Parceiro' : 'Cliente'}</span>{!c.active && <span className="badge mr-1 bg-red-100 text-red-700">Desativado</span>}{c.email ?? ''}</span></span></span></td>
                    <td className="td text-ink-500">{c.city ? `${c.city}${c.state ? '/' + c.state : ''}` : '—'}</td>
                    <td className="td text-ink-500">{c.phone1 ?? '—'}</td>
                    <td className="td font-semibold">{c._count.medias}</td>
                    <td className="td text-ink-500 tabular-nums">{c.subscriptions.length ? <>{fmtMoney(c.subscriptions.reduce((a, s) => a + s.amountCents, 0))}<span className="block text-xs">{c.subscriptions.length} cobrança(s) ativa(s)</span></> : '—'}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1.5">
                        <Modal trigger={<Pencil size={15} />} triggerClass="btn-icon" titleAttr="Editar" title="Editar cliente"><ActionForm action={saveClient}><ClientFields c={c} /></ActionForm></Modal>
                        {c.active ? (
                          <Modal trigger={<Power size={15} />} triggerClass="btn-icon !text-red-600" titleAttr="Desativar" title={`Desativar ${c.name}?`}>
                            <ActionForm action={toggleClient} submit="Desativar" submitClass="btn-danger" cancel>
                              <input type="hidden" name="id" value={c.id} />
                              <p className="text-sm text-ink-500">Os vídeos e imagens de {c.name} param de rodar em todas as telas em até 1 minuto. Nada é apagado: ao reativar, eles voltam às playlists onde estavam.</p>
                              {c.subscriptions.length > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="cancelCharges" defaultChecked className="h-4 w-4" /> Cancelar também as {c.subscriptions.length} cobrança(s) recorrente(s) e as faturas futuras</label>}
                            </ActionForm>
                          </Modal>
                        ) : (
                          <Modal trigger={<Power size={15} />} triggerClass="btn-icon !text-emerald-600" titleAttr="Reativar" title={`Reativar ${c.name}?`}>
                            <ActionForm action={toggleClient} submit="Reativar" cancel><input type="hidden" name="id" value={c.id} /><p className="text-sm text-ink-500">Os conteúdos voltam a rodar nas telas onde estavam. Cobranças canceladas não voltam sozinhas.</p></ActionForm>
                          </Modal>
                        )}
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
