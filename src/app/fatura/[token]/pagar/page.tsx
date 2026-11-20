import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import { fmtDate, fmtMoney } from '@/lib/money';
import { competenceLabel, invoicePix } from '@/lib/billing';
import { PixCopyBig } from '@/components/PixCopyBig';

type Props = { params: Promise<{ token: string }> };

async function load(token: string) {
  if (!/^[\w-]{20,40}$/.test(token)) return null;
  return db.invoice.findUnique({ where: { publicToken: token }, include: { client: true, tenant: true } });
}

/** Titulo da previa do link no WhatsApp. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const inv = await load((await params).token);
  if (!inv) return { title: 'Pagamento', robots: { index: false, follow: false } };
  const title = `Pagar com Pix · ${fmtMoney(inv.amountCents)}`;
  const description = `Fatura nº ${inv.number} de ${inv.tenant.tradeName || inv.tenant.name} · vence em ${fmtDate(inv.dueDate)}. Toque para copiar o código Pix.`;
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description } };
}

/** Pagina de pagamento para o cliente (celular): copiar o codigo Pix com um toque. */
export default async function PagarPage({ params }: Props) {
  const { token } = await params;
  const inv = await load(token);
  if (!inv) notFound();
  const t = inv.tenant;
  const company = t.tradeName || t.name;
  const pix = inv.status === 'aberta' ? invoicePix(inv, t) : null;
  const qr = pix ? await QRCode.toDataURL(pix, { margin: 1, width: 360, errorCorrectionLevel: 'M' }) : null;
  const logo = fileUrl(t.logo);
  const ref = inv.competence ? competenceLabel(inv.competence) : null;

  return (
    <main className="min-h-screen bg-[#f6f3fb] px-4 py-6 text-[#1d1029]">
      <div className="mx-auto max-w-md space-y-5">
        <header className="flex items-center gap-3">
          {logo && <img src={logo} alt={company} className="h-12 w-auto" />}{/* eslint-disable-line @next/next/no-img-element */}
          <div><p className="font-bold leading-tight">{company}</p><p className="text-xs text-gray-500">Fatura nº {String(inv.number).padStart(6, '0')}{ref ? ` · ${ref}` : ''}</p></div>
        </header>

        <section className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
          <p className="text-sm text-gray-500">{inv.client.tradeName || inv.client.name}</p>
          <p className="mt-1 text-4xl font-black tabular-nums">{fmtMoney(inv.amountCents)}</p>
          <p className="mt-1 text-sm text-gray-500">Vencimento: <b className="text-gray-800">{fmtDate(inv.dueDate)}</b></p>
          {inv.status === 'paga' && <p className="mt-4 rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-700">Esta fatura já está paga. Obrigado!</p>}
          {inv.status === 'cancelada' && <p className="mt-4 rounded-xl bg-gray-100 p-3 font-semibold text-gray-600">Esta fatura foi cancelada.</p>}
          {inv.status === 'aberta' && !pix && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">O Pix desta fatura não está disponível. Fale com {company}.</p>}
        </section>

        {pix && (
          <>
            <PixCopyBig code={pix} />
            <ol className="space-y-1 rounded-2xl bg-white p-4 text-sm text-gray-600 shadow-sm ring-1 ring-black/5">
              <li><b>1.</b> Toque em <b>Copiar código Pix</b>.</li>
              <li><b>2.</b> Abra o app do seu banco e escolha <b>Pix → Pix Copia e Cola</b>.</li>
              <li><b>3.</b> Cole o código, confira o valor e o recebedor (<b>{t.pixName || company}</b>) e confirme.</li>
            </ol>
            <details className="rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-black/5">
              <summary className="cursor-pointer font-semibold">Ver código e QR Code</summary>
              <p className="mt-3 select-all break-all rounded-lg bg-gray-50 p-3 font-mono text-xs">{pix}</p>
              {qr && <img src={qr} alt="QR Code Pix" className="mx-auto mt-3 w-56" />}{/* eslint-disable-line @next/next/no-img-element */}
              <p className="mt-2 text-center text-xs text-gray-400">Pagando pelo computador? Leia o QR Code com o app do banco.</p>
            </details>
          </>
        )}

        <p className="text-center text-sm"><Link href={`/fatura/${token}`} className="font-semibold text-[#6b2fa3] underline">Ver fatura completa</Link></p>
      </div>
    </main>
  );
}
