import Link from 'next/link';
import { headers } from 'next/headers';
import { KeyRound, Lock, LockOpen, Pencil, Plus } from 'lucide-react';
import type { Tenant } from '@prisma/client';
import { requireSuperAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { localDate, timeAgo } from '@/lib/util';
import { fileUrl } from '@/lib/storage';
import { fmtMoney } from '@/lib/money';
import { MoneyInput } from '@/components/MoneyInput';
import { enforceBilling } from '@/lib/tenant';
import { Avatar, Empty, PageHeader } from '@/components/basic';
import { ActionForm, Field, Modal } from '@/components/ui';
import { blockTenant, createTenant, resetTenantAdmin, unblockTenant, updateTenant } from './actions';

function TenantFields({ t, fee, dueDay }: { t?: Tenant; fee?: number | null; dueDay?: number | null }) {
  return (
    <>
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome da empresa"><input name="name" required defaultValue={t?.name} className="input" placeholder="Ex.: Mídia Norte DOOH" /></Field>
        <Field label="CNPJ"><input name="document" defaultValue={t?.document ?? ''} className="input" inputMode="numeric" /></Field>
        <Field label="Endereço de acesso" hint="Usado em /login?empresa=..."><input name="slug" defaultValue={t?.slug ?? ''} className="input" placeholder="gerado a partir do nome" /></Field>
        <Field label="Limite de telas do plano"><input type="number" name="planScreens" min={1} defaultValue={t?.planScreens ?? 10} className="input" /></Field>
        <Field label="Cor da marca"><input type="color" name="color" defaultValue={t?.color ?? '#8a52f8'} className="h-10 w-full rounded-lg" /></Field>
        <Field label="Logo" hint="PNG, JPG ou WEBP até 2 MB"><input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="input" /></Field>
      </div>
      <div className="grid gap-3 rounded-lg bg-ink-50 p-3 sm:grid-cols-3 dark:bg-ink-900">
        <p className="text-sm font-semibold sm:col-span-3">Cobrança desta empresa</p>
        <Field label="Mensalidade" hint="0,00 = sem mensalidade"><MoneyInput name="monthlyFee" defaultCents={fee} /></Field>
        <Field label="Dia do vencimento"><input type="number" name="dueDay" min={1} max={28} defaultValue={dueDay ?? 10} className="input" /></Field>
        <Field label="Bloquear após (dias de atraso)" hint="Em branco = nunca bloquear sozinho"><input type="number" name="autoBlockDays" min={0} max={90} defaultValue={t ? (t.autoBlockDays ?? '') : 5} className="input" /></Field>
      </div>
    </>
  );
}

export default async function PlataformaPage() {
  const me = await requireSuperAdmin();
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const ids = (await db.tenant.findMany({ where: { isPlatform: false }, select: { id: true } })).map((t) => t.id);
  for (const id of ids) await enforceBilling(id); // aplica o bloqueio automatico antes de mostrar a lista
  const today = localDate();
  const tenants = await db.tenant.findMany({
    where: { isPlatform: false }, orderBy: { name: 'asc' },
    include: { _count: { select: { screens: true } }, users: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true, email: true, role: true, lastLoginAt: true, mustChangePassword: true } } },
  });
  const billing = await db.client.findMany({
    where: { id: { in: tenants.map((t) => t.billingClientId).filter((x): x is string => !!x) } },
    include: { invoices: { where: { status: 'aberta' }, select: { amountCents: true, dueDate: true } }, subscriptions: { where: { status: 'ativa', mode: 'recorrente' }, take: 1 } },
  });
  // mensalidade = cobranca recorrente ativa da empresa
  const bill = Object.fromEntries(billing.map((c) => [c.id, { ...c, monthlyFeeCents: c.subscriptions[0]?.amountCents ?? null, dueDay: c.subscriptions[0]?.dueDay ?? null }]));
  const active = tenants.filter((t) => t.status === 'ativo').length;
  const mrr = tenants.reduce((a, t) => a + (t.billingClientId && t.status === 'ativo' ? bill[t.billingClientId]?.monthlyFeeCents ?? 0 : 0), 0);

  return (
    <>
      <PageHeader title="Empresas clientes" crumbs={[{ label: 'Plataforma' }, { label: 'Empresas clientes' }]}>
        <Link href="/financeiro" className="btn-ghost">Faturas das empresas</Link>
        <Modal trigger={<><Plus size={16} /> Nova empresa</>} title="Nova empresa" wide>
          <ActionForm action={createTenant} submit="Criar empresa">
            <p className="text-sm text-ink-500">A empresa recebe um painel próprio e independente, com a logo e a cor dela. Ela é cadastrada também como cliente em <b>{me.tenant.name}</b>, para você faturar a mensalidade pelo Financeiro.</p>
            <TenantFields />
            <div className="grid gap-3 sm:grid-cols-3">
              <p className="text-sm font-semibold sm:col-span-3">Administrador da empresa</p>
              <Field label="Nome"><input name="adminName" required className="input" /></Field>
              <Field label="E-mail"><input name="adminEmail" type="email" required className="input" /></Field>
              <Field label="Senha provisória" hint="Trocada no primeiro acesso"><input name="adminPassword" required minLength={8} autoComplete="new-password" className="input" /></Field>
            </div>
          </ActionForm>
        </Modal>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs font-semibold uppercase text-ink-400">Empresas ativas</p><p className="text-2xl font-black">{active}<span className="text-base font-normal text-ink-400"> de {tenants.length}</span></p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase text-ink-400">Receita mensal recorrente</p><p className="text-2xl font-black tabular-nums">{fmtMoney(mrr)}</p><p className="text-xs text-ink-400">soma das mensalidades das ativas</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase text-red-600">Bloqueadas</p><p className="text-2xl font-black text-red-600">{tenants.length - active}</p></div>
      </div>

      <div className="card overflow-hidden">
        {tenants.length === 0 ? <Empty title="Nenhuma empresa ainda" text="Crie a primeira empresa para alugar o sistema." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead className="border-b border-ink-100 dark:border-ink-700"><tr><th className="th">Empresa</th><th className="th">Situação</th><th className="th">Telas</th><th className="th">Mensalidade</th><th className="th">Em aberto</th><th className="th">Último acesso</th><th className="th text-right">Ações</th></tr></thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                {tenants.map((t) => {
                  const c = t.billingClientId ? bill[t.billingClientId] : undefined;
                  const open = c?.invoices ?? [];
                  const late = open.filter((i) => i.dueDate < today);
                  const last = t.users.map((u) => u.lastLoginAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];
                  return (
                    <tr key={t.id}>
                      <td className="td">
                        <span className="flex items-center gap-3">
                          <Avatar src={fileUrl(t.logo)} name={t.name} square />
                          <span className="min-w-0"><span className="block font-semibold">{t.name}</span><span className="block truncate text-xs text-ink-400">{t.slug ? `${origin.replace(/^https?:\/\//, '')}/login?empresa=${t.slug}` : '—'}</span></span>
                        </span>
                      </td>
                      <td className="td">
                        {t.status === 'ativo' ? <span className="badge bg-emerald-100 text-emerald-700">Ativa</span> : <span className="badge bg-red-100 text-red-700">Bloqueada{t.blockedAuto ? ' (atraso)' : ''}</span>}
                        {t.blockedReason && <span className="block max-w-[220px] text-xs text-ink-400">{t.blockedReason}</span>}
                      </td>
                      <td className="td tabular-nums">{t._count.screens}/{t.planScreens}</td>
                      <td className="td tabular-nums">{c?.monthlyFeeCents ? <>{fmtMoney(c.monthlyFeeCents)}<span className="block text-xs text-ink-400">dia {c.dueDay}{t.autoBlockDays != null ? ` · bloqueia após ${t.autoBlockDays}d` : ''}</span></> : '—'}</td>
                      <td className="td tabular-nums">{open.length ? <>{fmtMoney(open.reduce((a, i) => a + i.amountCents, 0))}{late.length > 0 && <span className="block text-xs font-semibold text-red-600">{late.length} vencida(s)</span>}</> : <span className="text-ink-400">nada</span>}</td>
                      <td className="td text-ink-500">{timeAgo(last)}</td>
                      <td className="td">
                        <div className="flex justify-end gap-1.5">
                          <Modal trigger={<Pencil size={15} />} triggerClass="btn-icon" titleAttr="Editar" title={`Editar ${t.name}`} wide>
                            <ActionForm action={updateTenant}><TenantFields t={t} fee={c?.monthlyFeeCents} dueDay={c?.dueDay} /></ActionForm>
                          </Modal>
                          <Modal trigger={<KeyRound size={15} />} triggerClass="btn-icon" titleAttr="Redefinir acesso" title={`Redefinir acesso — ${t.name}`}>
                            <ActionForm action={resetTenantAdmin} submit="Definir senha provisória">
                              <input type="hidden" name="id" value={t.id} />
                              <Field label="Usuário"><select name="userId" className="input">{t.users.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.email}{u.role === 'admin' ? ' (admin)' : ''}</option>)}</select></Field>
                              <Field label="Nova senha provisória" hint="A pessoa troca no próximo acesso; as sessões abertas caem"><input name="password" required minLength={8} autoComplete="new-password" className="input" /></Field>
                            </ActionForm>
                          </Modal>
                          {t.status === 'ativo' ? (
                            <Modal trigger={<Lock size={15} />} triggerClass="btn-icon !text-red-600" titleAttr="Bloquear acesso" title={`Bloquear ${t.name}?`}>
                              <ActionForm action={blockTenant} submit="Bloquear acesso" submitClass="btn-danger" cancel>
                                <input type="hidden" name="id" value={t.id} />
                                <p className="text-sm text-ink-500">Ninguém da empresa consegue entrar no painel até o desbloqueio. As telas continuam tocando a última programação, para não prejudicar os anunciantes dela.</p>
                                <Field label="Motivo (aparece para a empresa)"><input name="reason" className="input" defaultValue={late.length ? 'Pendência financeira. Regularize a fatura para liberar o acesso.' : ''} /></Field>
                              </ActionForm>
                            </Modal>
                          ) : (
                            <Modal trigger={<LockOpen size={15} />} triggerClass="btn-icon !text-emerald-600" titleAttr="Desbloquear" title={`Desbloquear ${t.name}?`}>
                              <ActionForm action={unblockTenant} submit="Desbloquear" cancel><input type="hidden" name="id" value={t.id} /><p className="text-sm text-ink-500">A empresa volta a acessar o painel na hora.</p></ActionForm>
                            </Modal>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="mt-4 max-w-3xl text-sm text-ink-500">As mensalidades das empresas são faturadas pelo seu <Link href="/financeiro" className="font-semibold underline">Financeiro</Link> (geradas automaticamente todo mês). Quando uma fatura passa do vencimento além da tolerância escolhida, a empresa é bloqueada sozinha e vê a fatura com o Pix na tela de bloqueio; ao registrar o pagamento, ela é liberada automaticamente.</p>
    </>
  );
}
