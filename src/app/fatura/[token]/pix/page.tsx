import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import { fmtDate, fmtMoney } from '@/lib/money';
import { fmtDoc } from '@/lib/docs';
import { competenceLabel, invoicePix } from '@/lib/billing';
import { pixFileName } from '@/lib/doc-names';
import { CopyButton } from '@/components/CopyButton';
import { DownloadDocPdf } from '@/components/PdfButtons';

export const metadata: Metadata = { title: 'Pix', robots: { index: false, follow: false } };

/** Documento de cobranca Pix (uma pagina A4) para enviar ao cliente junto com a fatura. */
export default async function PixPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ baixar?: string }> }) {
  const { token } = await params;
  const auto = (await searchParams).baixar === '1';
  if (!/^[\w-]{20,40}$/.test(token)) notFound();
  const inv = await db.invoice.findUnique({ where: { publicToken: token }, include: { client: true, tenant: true } });
  if (!inv) notFound();
  const t = inv.tenant;
  const pix = inv.status === 'aberta' ? invoicePix(inv, t) : null;
  const qr = pix ? await QRCode.toDataURL(pix, { margin: 1, width: 520, errorCorrectionLevel: 'M' }) : null;
  const logo = fileUrl(t.logo);
  const ref = inv.competence ? competenceLabel(inv.competence) : `vencimento ${fmtDate(inv.dueDate)}`;

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif' }} className="min-h-screen bg-gray-200 py-8 text-black print:bg-white print:py-0">
      <style>{'@page { size: A4; margin: 0; }'}</style>
      <div className="mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <div><h1 className="text-lg font-bold text-gray-800">Pix — fatura nº {String(inv.number).padStart(6, '0')}</h1><p className="text-xs text-gray-500">{inv.client.name} · {fmtMoney(inv.amountCents)}</p></div>
        <div className="flex gap-2">{pix && <CopyButton text={pix} label="Copiar código Pix" />}<DownloadDocPdf fileName={pixFileName(inv, inv.client)} auto={auto && !!pix} /></div>
      </div>
      <div className="overflow-x-auto print:overflow-visible">
        <div id="doc" className="mx-auto flex h-[297mm] w-[210mm] flex-col bg-white shadow-xl print:shadow-none" style={{ padding: '16mm 18mm' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', borderBottom: '2px solid #1a1a1a', paddingBottom: '10px' }}>
            {logo && <img src={logo} alt="" style={{ height: '56px', maxWidth: '160px', objectFit: 'contain' }} />}{/* eslint-disable-line @next/next/no-img-element */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{t.tradeName || t.name}</div>
              <div style={{ fontSize: '11px', color: '#444' }}>{t.name}{t.document ? ` · CNPJ ${fmtDoc(t.document)}` : ''}</div>
            </div>
            <div style={{ background: '#1a1a1a', color: '#fff', fontWeight: 'bold', letterSpacing: '3px', padding: '6px 14px', fontSize: '14px' }}>PIX</div>
          </div>

          <div style={{ marginTop: '14mm', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '2px', color: '#555' }}>Cobrança via Pix · {ref}</div>
            <div style={{ fontSize: '40px', fontWeight: 'bold', margin: '6px 0 2px' }}>{fmtMoney(inv.amountCents)}</div>
            <div style={{ fontSize: '13px', color: '#333' }}>Vencimento: <b>{fmtDate(inv.dueDate)}</b> &nbsp;·&nbsp; Fatura nº {String(inv.number).padStart(6, '0')}</div>
            <div style={{ fontSize: '13px', color: '#333', marginTop: '4px' }}>Pagador: <b>{inv.client.name}</b>{inv.client.document ? ` · ${fmtDoc(inv.client.document)}` : ''}</div>
          </div>

          {qr && pix ? (
            <>
              <div style={{ margin: '10mm auto 0', border: '1px solid #ddd', borderRadius: '8px', padding: '8px' }}>
                <img src={qr} alt="QR Code Pix" style={{ width: '82mm', height: '82mm', display: 'block' }} />{/* eslint-disable-line @next/next/no-img-element */}
              </div>
              <div style={{ marginTop: '8mm' }}>
                <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Pix Copia e Cola</div>
                <div style={{ fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', background: '#f3f3f3', border: '1px solid #ddd', borderRadius: '6px', padding: '8px', lineHeight: 1.5 }}>{pix}</div>
              </div>
              <ol style={{ marginTop: '8mm', fontSize: '12px', color: '#333', lineHeight: 1.7, paddingLeft: '18px', listStyle: 'decimal' }}>
                <li>Abra o aplicativo do seu banco e entre na área Pix.</li>
                <li>Escolha <b>Ler QR Code</b> e aponte para o código acima, ou <b>Pix Copia e Cola</b> e cole o código.</li>
                <li>Confira o valor e o recebedor ({t.pixName || t.name}) e confirme.</li>
              </ol>
            </>
          ) : (
            <p style={{ marginTop: '20mm', textAlign: 'center', fontSize: '14px', color: '#555' }}>
              {inv.status === 'paga' ? 'Esta fatura já foi paga. Obrigado!' : inv.status === 'cancelada' ? 'Esta fatura foi cancelada.' : 'A chave Pix desta empresa ainda não foi cadastrada.'}
            </p>
          )}
          <div style={{ marginTop: 'auto', borderTop: '1px solid #ccc', paddingTop: '4px', fontSize: '9px', color: '#999' }}>Chave Pix: {t.pixKey ?? '—'} · Documento gerado em {new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
        </div>
      </div>
    </div>
  );
}
