import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { getUser } from '@/lib/auth';
import { brandCss } from '@/lib/tenant';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import { fmtDate, fmtMoney } from '@/lib/money';
import { invoiceLink } from '@/lib/billing';
import { enforceBilling } from '@/lib/tenant';
import { logout } from '../login/actions';

export default async function BloqueadoPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const t = (await enforceBilling(user.tenantId)) ?? user.tenant;
  if (t.status !== 'bloqueado' || user.superAdmin) redirect('/dashboard');
  const invoices = t.billingClientId
    ? await db.invoice.findMany({ where: { clientId: t.billingClientId, status: 'aberta' }, orderBy: { dueDate: 'asc' } })
    : [];
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <style dangerouslySetInnerHTML={{ __html: brandCss(user.tenant.color) }} />
      <div className="card w-full max-w-lg p-6">
        <div className="mb-4 flex items-center gap-3">
          {t.logo ? <img src={fileUrl(t.logo)!} alt="" className="h-12 w-12 rounded-lg object-contain" /> : <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100 text-red-700"><Lock size={22} /></span>}{/* eslint-disable-line @next/next/no-img-element */}
          <div><p className="text-xs uppercase tracking-wide text-ink-400">{t.name}</p><h1>Acesso suspenso</h1></div>
        </div>
        <p className="text-ink-600 dark:text-ink-200">{t.blockedReason || 'O acesso ao painel foi suspenso pela administração.'}</p>
        <p className="mt-2 text-sm text-ink-400">As telas continuam exibindo a programação atual. Para voltar a gerenciar, regularize a pendência abaixo; após a confirmação do pagamento, o acesso é liberado automaticamente.</p>
        {invoices.length > 0 && (
          <ul className="my-5 divide-y divide-ink-100 rounded-lg border border-ink-100 dark:divide-ink-700 dark:border-ink-700">
            {invoices.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 p-3">
                <span><b>Fatura nº {i.number}</b><span className="block text-sm text-ink-400">vence em {fmtDate(i.dueDate)} · {fmtMoney(i.amountCents)}</span></span>
                <Link href={invoiceLink(i)} target="_blank" className="btn-primary">Pagar com Pix</Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/bloqueado" className="btn-ghost">Já paguei, verificar</Link>
          <form action={logout}><button className="btn-ghost">Sair</button></form>
        </div>
      </div>
    </main>
  );
}
