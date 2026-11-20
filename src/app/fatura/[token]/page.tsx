import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import { fmtDate, fmtMoney } from '@/lib/money';
import { invoiceItems, invoicePix, invoiceState, METHODS, STATE_LABEL } from '@/lib/billing';
import { CopyButton } from '@/components/CopyButton';
import { DevCredit } from '@/components/Brand';

export const metadata: Metadata = { title: 'Fatura', robots: { index: false, follow: false } };

/** Fatura publica: o cliente abre pelo link (sem login), ve os itens e paga com Pix ou boleto. */
export default async function FaturaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{20,40}$/.test(token)) notFound();
  const inv = await db.invoice.findUnique({ where: { publicToken: token }, include: { client: true, tenant: true } });
  if (!inv) notFound();
  const t = inv.tenant;
  const st = invoiceState(inv);
  const open = inv.status === 'aberta';
  const pix = open ? invoicePix(inv, t) : null;
  const qr = pix ? await QRCode.toDataURL(pix, { margin: 1, width: 360, errorCorrectionLevel: 'M' }) : null;
  const items = invoiceItems(inv);
  const color = /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : '#8a52f8';
  const tone: Record<string, string> = { aberta: '#0369a1', vencida: '#b91c1c', paga: '#047857', cancelada: '#52627f' };

  return (
    <main className="min-h-screen bg-ink-50 px-4 py-8 text-ink-800 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-ink-100 print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-center justify-between gap-4 p-6" style={{ borderTop: `6px solid ${color}` }}>
          <div className="flex items-center gap-3">
            {t.logo && <img src={fileUrl(t.logo)!} alt="" className="h-14 w-14 rounded-lg object-contain" />}{/* eslint-disable-line @next/next/no-img-element */}
            <div>
              <p className="text-lg font-bold">{t.name}</p>
              {t.document && <p className="text-xs text-ink-400">CNPJ {t.document}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-ink-400">Fatura nº</p>
            <p className="font-mono text-2xl font-black">{String(inv.number).padStart(5, '0')}</p>
            <span className="badge mt-1 text-white" style={{ background: tone[st] }}>{STATE_LABEL[st]}</span>
          </div>
        </header>

        <section className="grid gap-4 border-y border-ink-100 bg-ink-50/60 p-6 sm:grid-cols-3">
          <div className="sm:col-span-2"><p className="text-xs uppercase tracking-wide text-ink-400">Para</p><p className="font-semibold">{inv.client.name}</p>{inv.client.document && <p className="text-sm text-ink-500">{inv.client.document.length === 11 ? 'CPF' : 'CNPJ'} {inv.client.document}</p>}</div>
          <div><p className="text-xs uppercase tracking-wide text-ink-400">Vencimento</p><p className="text-lg font-bold tabular-nums">{fmtDate(inv.dueDate)}</p></div>
        </section>

        <section className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-400"><th className="pb-2">Descrição</th><th className="pb-2 text-right">Qtd.</th><th className="pb-2 text-right">Valor</th><th className="pb-2 text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {items.map((i, k) => <tr key={k}><td className="py-2 pr-2">{i.description}</td><td className="py-2 text-right">{String(i.quantity).replace('.', ',')}</td><td className="py-2 text-right">{fmtMoney(i.unitCents)}</td><td className="py-2 text-right">{fmtMoney(Math.round(i.quantity * i.unitCents))}</td></tr>)}
              </tbody>
              <tfoot><tr><td colSpan={3} className="pt-4 text-right font-semibold">Total</td><td className="pt-4 text-right text-2xl font-black">{fmtMoney(inv.amountCents)}</td></tr></tfoot>
            </table>
          </div>
          {(inv.notes || t.invoiceNotes) && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-sm text-ink-600">{[inv.notes, t.invoiceNotes].filter(Boolean).join('\n\n')}</p>}
        </section>

        {open && (
          <section className="grid gap-6 border-t border-ink-100 p-6 sm:grid-cols-[200px_1fr]">
            {qr && pix ? (
              <>
                <img src={qr} alt="QR Code Pix para pagamento" width={200} height={200} className="mx-auto rounded-lg ring-1 ring-ink-100" />{/* eslint-disable-line @next/next/no-img-element */}
                <div className="min-w-0 space-y-3">
                  <h2 className="text-lg font-bold">Pague com Pix</h2>
                  <p className="text-sm text-ink-500">Abra o app do seu banco, escolha Pix → Ler QR Code, ou copie o código abaixo em Pix Copia e Cola. O valor já vem preenchido.</p>
                  <p className="break-all rounded-lg bg-ink-50 p-3 font-mono text-xs text-ink-600 select-all">{pix}</p>
                  <CopyButton text={pix} label="Copiar código Pix" />
                </div>
              </>
            ) : <p className="text-sm text-ink-500 sm:col-span-2">Esta empresa ainda não cadastrou uma chave Pix. Fale com {t.name} para combinar o pagamento.</p>}
            {inv.boletoUrl && (
              <div className="space-y-3 border-t border-ink-100 pt-5 sm:col-span-2">
                <h2 className="text-lg font-bold">Ou pague com boleto</h2>
                {inv.boletoLine && <><p className="break-all rounded-lg bg-ink-50 p-3 font-mono text-sm select-all">{inv.boletoLine}</p><CopyButton text={inv.boletoLine} label="Copiar linha digitável" /></>}
                <a href={inv.boletoUrl} target="_blank" rel="noreferrer" className="btn-ghost ml-2 print:hidden">Abrir boleto (PDF)</a>
              </div>
            )}
          </section>
        )}
        {inv.status === 'paga' && <p className="border-t border-ink-100 p-6 text-center font-semibold text-emerald-700">Pagamento recebido em {inv.paidAt?.toLocaleDateString('pt-BR')}{inv.paymentMethod ? ` via ${METHODS[inv.paymentMethod]}` : ''}. Obrigado!</p>}
        {inv.status === 'cancelada' && <p className="border-t border-ink-100 p-6 text-center font-semibold text-ink-500">Esta fatura foi cancelada e não deve ser paga.</p>}
      </div>
      <p className="mt-4 text-center text-xs text-ink-400 print:hidden">Para salvar em PDF, use Imprimir no seu navegador (Ctrl + P).</p>
      <div className="mt-2 flex justify-center"><DevCredit /></div>
    </main>
  );
}
