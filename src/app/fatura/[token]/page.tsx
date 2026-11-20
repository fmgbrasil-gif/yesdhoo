import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import { fmtDate, fmtMoney } from '@/lib/money';
import { addressLine, fmtCep, fmtDoc, moneyInWords } from '@/lib/docs';
import { invoiceItems, invoicePix, invoiceState, METHODS } from '@/lib/billing';
import { CopyButton } from '@/components/CopyButton';
import { PrintButton } from '@/components/PrintButton';
import { DownloadDocPdf } from '@/components/PdfButtons';
import { invoiceFileName } from '@/lib/doc-names';

export const metadata: Metadata = { title: 'Fatura', robots: { index: false, follow: false } };

/* Mesmo padrao de documento do G-Faturas (estilo DANFE, folha A4). Estilos inline para a impressao sair igual. */
const B = '0.5px solid #000';
const B2 = '1px solid #000';
const LABEL_BG = '#e9e9e9';
const LABEL: CSSProperties = { fontSize: '6.5px', fontWeight: 'bold', color: '#333', textTransform: 'uppercase', letterSpacing: '0.3px', background: LABEL_BG, padding: '1.5px 4px', lineHeight: '1.3' };
const VALUE: CSSProperties = { fontSize: '10px', fontWeight: 'bold', padding: '2px 4px', textTransform: 'uppercase', lineHeight: '1.3' };
const BAR: CSSProperties = { background: '#1a1a1a', color: '#fff', fontSize: '7px', fontWeight: 'bold', padding: '2px 6px', letterSpacing: '1.5px', textTransform: 'uppercase' };
const TH: CSSProperties = { borderBottom: B, borderRight: B, padding: '3px 4px', fontSize: '7px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center', color: '#333' };

function Cell({ label, children, style, valueStyle, colSpan }: { label: string; children: ReactNode; style?: CSSProperties; valueStyle?: CSSProperties; colSpan?: number }) {
  return (
    <td style={{ borderRight: B, borderBottom: B, padding: 0, verticalAlign: 'top', ...style }} colSpan={colSpan}>
      <div style={LABEL}>{label}</div>
      <div style={{ ...VALUE, ...valueStyle }}>{children}</div>
    </td>
  );
}

/** Fatura publica: o cliente abre pelo link (sem login), confere, imprime e paga com Pix ou boleto. */
export default async function FaturaPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ baixar?: string }> }) {
  const { token } = await params;
  const auto = (await searchParams).baixar === '1';
  if (!/^[\w-]{20,40}$/.test(token)) notFound();
  const inv = await db.invoice.findUnique({ where: { publicToken: token }, include: { client: true, tenant: true, subscription: true } });
  if (!inv) notFound();
  const t = inv.tenant;
  const c = inv.client;
  const open = inv.status === 'aberta';
  const pix = open ? invoicePix(inv, t) : null;
  const qr = pix ? await QRCode.toDataURL(pix, { margin: 1, width: 300, errorCorrectionLevel: 'M' }) : null;
  const items = invoiceItems(inv);
  const number = String(inv.number).padStart(6, '0');
  const title = t.invoiceTitle || 'FATURA DE SERVIÇOS';
  const displayName = t.tradeName || t.name;
  const logo = fileUrl(t.logo);
  const extra = [inv.notes, t.invoiceNotes].filter(Boolean).join('\n\n');
  const condition = inv.installment && inv.subscription?.months
    ? `PARCELA ${inv.installment}/${inv.subscription.months}`
    : inv.subscriptionId ? 'RECORRENTE MENSAL' : 'À VISTA';
  const method = inv.status === 'paga' && inv.paymentMethod ? METHODS[inv.paymentMethod] : [pix && 'PIX', inv.boletoUrl && 'BOLETO'].filter(Boolean).join(' / ') || 'PIX';
  const stamp = inv.status === 'cancelada' ? { text: 'CANCELADA', color: 'rgba(220, 38, 38, 0.18)' } : inv.status === 'paga' ? { text: 'PAGA', color: 'rgba(5, 150, 105, 0.16)' } : null;
  const now = new Date();
  const generatedAt = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif' }} className="min-h-screen bg-gray-200 py-8 text-black print:bg-white print:py-0">
      <style>{'@page { size: A4; margin: 0; }'}</style>

      {/* barra so na tela */}
      <div className="mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Fatura nº {number}</h1>
          <p className="text-xs text-gray-500">{displayName} · vencimento {fmtDate(inv.dueDate)} · {fmtMoney(inv.amountCents)}</p>
        </div>
        <div className="flex gap-2"><DownloadDocPdf fileName={invoiceFileName(inv, c)} auto={auto} /><PrintButton /></div>
      </div>

      {/* Pix em destaque na tela, antes da folha */}
      {open && qr && pix && (
        <div className="mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center gap-5 rounded-xl bg-white p-5 shadow print:hidden">
          <img src={qr} alt="QR Code Pix para pagamento" width={150} height={150} />{/* eslint-disable-line @next/next/no-img-element */}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-base font-bold text-gray-800">Pague com Pix: {fmtMoney(inv.amountCents)}</p>
            <p className="text-sm text-gray-500">Abra o app do banco, escolha Pix → Ler QR Code, ou copie o código abaixo em Pix Copia e Cola.</p>
            <p className="select-all break-all rounded bg-gray-100 p-2 font-mono text-[11px] text-gray-600">{pix}</p>
            <CopyButton text={pix} label="Copiar código Pix" />
          </div>
        </div>
      )}

      <div className="overflow-x-auto print:overflow-visible">
        <div id="doc" className="relative mx-auto flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white shadow-xl print:m-0 print:shadow-none" style={{ padding: '6mm 8mm', fontSize: '10px' }}>
          {stamp && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-35deg)', fontSize: '90px', fontWeight: 'bold', color: stamp.color, letterSpacing: '15px', pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap', userSelect: 'none' }}>{stamp.text}</div>
          )}

          {/* 1. canhoto */}
          <div style={{ flexShrink: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: B2 }}>
              <tbody>
                <tr>
                  <td style={{ borderRight: B, padding: 0, verticalAlign: 'top' }}>
                    <div style={{ background: LABEL_BG, padding: '4px 8px', borderBottom: B, fontSize: '7.5px', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center', lineHeight: '1.4' }}>
                      Recebi(emos) de <span style={{ textDecoration: 'underline' }}>{displayName.toUpperCase()}</span> os serviços constantes desta {title.toLowerCase()} indicada ao lado
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        <tr>
                          <td style={{ borderRight: B, padding: '4px 8px', width: '28%', verticalAlign: 'top' }}>
                            <div style={{ fontSize: '6.5px', fontWeight: 'bold', color: '#555', textTransform: 'uppercase' }}>Data de Recebimento</div>
                            <div style={{ borderBottom: '1px solid #000', marginTop: '18px', marginBottom: '4px' }} />
                          </td>
                          <td style={{ padding: '4px 8px', verticalAlign: 'top' }}>
                            <div style={{ fontSize: '6.5px', fontWeight: 'bold', color: '#555', textTransform: 'uppercase' }}>Identificação e Assinatura do Recebedor</div>
                            <div style={{ borderBottom: '1px solid #000', marginTop: '18px', marginBottom: '4px' }} />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                  <td style={{ width: '145px', textAlign: 'center', verticalAlign: 'top', padding: 0 }}>
                    <div style={{ background: '#1a1a1a', color: '#fff', fontSize: '8px', fontWeight: 'bold', padding: '3px', letterSpacing: '2px', textTransform: 'uppercase' }}>{title}</div>
                    <div style={{ padding: '3px 8px', borderBottom: B }}>
                      <div style={{ fontSize: '7px', color: '#555', fontWeight: 'bold' }}>Nº</div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', lineHeight: 1.1 }}>{number}</div>
                    </div>
                    <div style={{ padding: '2px 8px', fontSize: '8px', fontWeight: 'bold' }}>{fmtMoney(inv.amountCents)}</div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ borderTop: '1px dashed #999', margin: '5px 0 6px 0', textAlign: 'center' }}>
              <span style={{ position: 'relative', top: '-7px', background: '#fff', padding: '0 6px', fontSize: '10px', color: '#aaa' }}>&#9986;</span>
            </div>
          </div>

          {/* 2. emitente */}
          <div style={{ flexShrink: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: B2 }}>
              <tbody>
                <tr>
                  <td style={{ width: '13%', padding: '4px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {logo
                      ? <img src={logo} alt="Logo" style={{ maxHeight: '55px', maxWidth: '100%', margin: '0 auto' }} /> /* eslint-disable-line @next/next/no-img-element */
                      : <div style={{ width: '50px', height: '50px', border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', borderRadius: '4px', color: '#bbb', fontSize: '7px' }}>LOGO</div>}
                  </td>
                  <td style={{ borderRight: B, padding: '5px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                    {t.tradeName && <div style={{ fontSize: '14px', fontWeight: 'bold', letterSpacing: '0.5px', marginBottom: '1px', lineHeight: 1.2 }}>{t.tradeName}</div>}
                    <div style={{ fontSize: t.tradeName ? '7.5px' : '13px', fontWeight: 'bold', textTransform: 'uppercase', lineHeight: '1.3', color: t.tradeName ? '#444' : '#000' }}>{t.name}</div>
                    <div style={{ fontSize: '7.5px', marginTop: '3px', color: '#333', lineHeight: 1.4 }}>
                      {addressLine(t) || '—'}
                      {(t.city || t.zipcode) && <><br />{t.city}{t.state ? ` - ${t.state}` : ''}{t.zipcode ? <> &nbsp;|&nbsp; CEP: {fmtCep(t.zipcode)}</> : null}</>}
                    </div>
                    {(t.phone || t.email) && (
                      <div style={{ fontSize: '7px', marginTop: '2px', fontWeight: 'bold', color: '#444' }}>
                        {t.phone && <span>FONE: {t.phone}</span>}{t.phone && t.email && <span>&nbsp;&nbsp;|&nbsp;&nbsp;</span>}{t.email && <span>{t.email}</span>}
                      </div>
                    )}
                  </td>
                  <td style={{ width: '34%', padding: 0, verticalAlign: 'top' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', height: '100%' }}>
                      <tbody>
                        <tr><td colSpan={2} style={{ background: '#1a1a1a', color: '#fff', textAlign: 'center', fontWeight: 'bold', fontSize: '12px', padding: '5px 4px', letterSpacing: '3px', borderBottom: B }}>{title}</td></tr>
                        <tr>
                          <td style={{ borderBottom: B, borderRight: B, padding: 0, verticalAlign: 'top' }}>
                            <div style={LABEL}>CNPJ</div>
                            <div style={{ ...VALUE, textAlign: 'center', fontSize: '9px' }}>{fmtDoc(t.document) || '—'}</div>
                          </td>
                          <td style={{ borderBottom: B, padding: 0, verticalAlign: 'top', width: '35%' }}>
                            <div style={LABEL}>Nº</div>
                            <div style={{ ...VALUE, textAlign: 'center', fontSize: '18px', padding: '1px 4px', lineHeight: 1.1 }}>{number}</div>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ borderRight: B, padding: 0, verticalAlign: 'top' }}>
                            <div style={LABEL}>Inscrição Estadual</div>
                            <div style={{ ...VALUE, textAlign: 'center', fontSize: '9px' }}>{t.stateRegistration || 'ISENTO'}</div>
                          </td>
                          <td style={{ padding: 0, verticalAlign: 'top', textAlign: 'center' }}>
                            <div style={{ ...LABEL, textAlign: 'center' }}>Folha</div>
                            <div style={{ padding: '1px 4px' }}>
                              <div style={{ fontSize: '9px', fontWeight: 'bold' }}>1/1</div>
                              <div style={{ fontSize: '7px', color: '#555', fontWeight: 'bold', marginTop: '1px', borderTop: B, paddingTop: '1px' }}>1ª VIA</div>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 3. natureza da operacao */}
          <div style={{ flexShrink: 0, marginTop: '1.5mm' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: B2 }}>
              <tbody>
                <tr>
                  <Cell label="Natureza da Operação" style={{ width: '40%', borderBottom: 'none' }}>{t.invoiceNature || 'PRESTAÇÃO DE SERVIÇOS'}</Cell>
                  <Cell label="Data de Emissão" style={{ textAlign: 'center', borderBottom: 'none' }}>{inv.createdAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</Cell>
                  <Cell label="Fatura Nº" style={{ textAlign: 'center', borderBottom: 'none' }}>{number}</Cell>
                  <Cell label="Valor da Fatura" style={{ textAlign: 'center', borderBottom: 'none' }}>{fmtMoney(inv.amountCents)}</Cell>
                  <Cell label="Vencimento" style={{ textAlign: 'center', borderRight: 'none', borderBottom: 'none' }}>{fmtDate(inv.dueDate)}</Cell>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 4. destinatario */}
          <div style={{ flexShrink: 0, marginTop: '2mm' }}>
            <div style={BAR}>Destinatário / Cliente</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', borderLeft: B2, borderRight: B2, borderBottom: B2 }}>
              <tbody>
                <tr>
                  <Cell label="Nome / Razão Social" style={{ width: '55%' }} valueStyle={{ fontWeight: 'normal' }}>{c.name}{c.tradeName ? ` (${c.tradeName})` : ''}</Cell>
                  <Cell label="CNPJ / CPF" style={{ width: '22%' }} valueStyle={{ fontWeight: 'normal' }}>{fmtDoc(c.document) || '—'}</Cell>
                  <Cell label="Inscrição Estadual" style={{ borderRight: 'none' }} valueStyle={{ fontWeight: 'normal' }}>{c.stateRegistration || '—'}</Cell>
                </tr>
                <tr>
                  <Cell label="Endereço" valueStyle={{ fontWeight: 'normal' }}>{addressLine(c) || '—'}</Cell>
                  <Cell label="CEP" valueStyle={{ fontWeight: 'normal' }}>{fmtCep(c.zipcode) || '—'}</Cell>
                  <Cell label="Fone / Contato" style={{ borderRight: 'none' }} valueStyle={{ fontWeight: 'normal' }}>{c.phone1 || '—'}</Cell>
                </tr>
                <tr>
                  <Cell label="Município" style={{ borderBottom: 'none' }} valueStyle={{ fontWeight: 'normal' }}>{c.city || '—'}</Cell>
                  <Cell label="UF" style={{ textAlign: 'center', borderBottom: 'none' }} valueStyle={{ fontWeight: 'normal' }}>{c.state || '—'}</Cell>
                  <Cell label="Email" style={{ borderRight: 'none', borderBottom: 'none' }} valueStyle={{ fontWeight: 'normal', textTransform: 'none' }}>{c.email || '—'}</Cell>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 5. valor por extenso */}
          <div style={{ flexShrink: 0, marginTop: '2mm' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: B2 }}>
              <tbody>
                <tr>
                  <td style={{ width: '70px', padding: 0, verticalAlign: 'middle', textAlign: 'center', borderRight: B, background: LABEL_BG }}>
                    <div style={{ fontSize: '7px', fontWeight: 'bold', textTransform: 'uppercase', lineHeight: '1.2', padding: '4px', color: '#333' }}>Valor por<br />Extenso</div>
                  </td>
                  <td style={{ padding: '5px 8px', fontSize: '9.5px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.2px' }}>{moneyInWords(inv.amountCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 5b. pagamento: Pix (com QR) e boleto */}
          <div style={{ flexShrink: 0, marginTop: '2mm' }}>
            <div style={BAR}>Informações de Pagamento</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', borderLeft: B2, borderRight: B2, borderBottom: B2 }}>
              <tbody>
                <tr>
                  <Cell label="Forma de Pagamento" style={{ width: '35%' }}>{method}</Cell>
                  <Cell label="Condição de Pagamento">{condition}</Cell>
                  <Cell label="Vencimento" style={{ borderRight: 'none' }} valueStyle={{ fontWeight: 'normal' }}>{fmtMoney(inv.amountCents)} — {fmtDate(inv.dueDate)}</Cell>
                </tr>
                {(t.pixKey || pix) && (
                  <tr>
                    <Cell label="Titular" style={{ width: '35%' }} valueStyle={{ fontWeight: 'normal' }}>{t.pixName || t.name}</Cell>
                    <Cell label="CNPJ/CPF Titular" valueStyle={{ fontWeight: 'normal' }}>{fmtDoc(t.document) || '—'}</Cell>
                    <Cell label="Chave PIX" style={{ borderRight: 'none' }} valueStyle={{ fontWeight: 'normal', textTransform: 'none' }}>{t.pixKey || 'QR Code ao lado'}</Cell>
                  </tr>
                )}
                {qr && pix && (
                  <tr>
                    <td colSpan={3} style={{ padding: '4px 6px', borderBottom: inv.boletoLine ? B : 'none' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <img src={qr} alt="QR Code Pix" style={{ width: '24mm', height: '24mm', flexShrink: 0 }} />{/* eslint-disable-line @next/next/no-img-element */}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '7px', fontWeight: 'bold', textTransform: 'uppercase', color: '#333' }}>Pix Copia e Cola</div>
                          <div style={{ fontFamily: 'monospace', fontSize: '7px', wordBreak: 'break-all', lineHeight: 1.3 }}>{pix}</div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                {open && inv.boletoLine && (
                  <tr>
                    <Cell label="Boleto — Linha Digitável" colSpan={3} style={{ borderRight: 'none', borderBottom: 'none' }} valueStyle={{ fontFamily: 'monospace', fontSize: '10px' }}>{inv.boletoLine}</Cell>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ flexShrink: 0, border: B, borderWidth: '0 1px 1px 1px', borderColor: '#000', padding: '4px 6px', fontSize: '8px', lineHeight: '1.4', fontStyle: 'italic', color: '#333' }}>
            Reconheço(emos) a exatidão desta {title.toLowerCase()}, na importância acima que pagarei(emos) à <strong>{displayName}</strong> ou à sua ordem na praça e vencimentos indicados.
          </div>

          {/* 6. itens (cresce para preencher a folha) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: '2mm', minHeight: 0 }}>
            <div style={{ ...BAR, flexShrink: 0 }}>Discriminação dos Serviços</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', borderLeft: B2, borderRight: B2, flexShrink: 0 }}>
              <thead>
                <tr style={{ background: LABEL_BG }}>
                  <th style={{ ...TH, width: '30px' }}>#</th>
                  <th style={TH}>Descrição</th>
                  <th style={{ ...TH, width: '45px' }}>Unid.</th>
                  <th style={{ ...TH, width: '45px' }}>Qtd.</th>
                  <th style={{ ...TH, width: '85px' }}>Valor Unit.</th>
                  <th style={{ ...TH, width: '90px', borderRight: 'none' }}>Valor Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} style={{ background: i % 2 === 1 ? '#fafafa' : 'transparent' }}>
                    <td style={{ borderRight: B, borderBottom: B, padding: '3px 4px', fontSize: '8px', textAlign: 'center', color: '#666' }}>{String(i + 1).padStart(2, '0')}</td>
                    <td style={{ borderRight: B, borderBottom: B, padding: '3px 6px', fontSize: '9.5px', textTransform: 'uppercase' }}>{it.description}</td>
                    <td style={{ borderRight: B, borderBottom: B, padding: '3px 4px', fontSize: '9px', textAlign: 'center', textTransform: 'uppercase' }}>{it.unit || 'UN'}</td>
                    <td style={{ borderRight: B, borderBottom: B, padding: '3px 4px', fontSize: '9px', textAlign: 'center' }}>{String(it.quantity).replace('.', ',')}</td>
                    <td style={{ borderRight: B, borderBottom: B, padding: '3px 4px', fontSize: '9px', textAlign: 'right' }}>{fmtMoney(it.unitCents)}</td>
                    <td style={{ borderBottom: B, padding: '3px 4px', fontSize: '9px', textAlign: 'right', fontWeight: 'bold' }}>{fmtMoney(Math.round(it.quantity * it.unitCents))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ flex: 1, borderLeft: B2, borderRight: B2, borderBottom: B2 }} />
          </div>

          {/* 7. totais */}
          <div style={{ flexShrink: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', borderLeft: B2, borderRight: B2, borderBottom: B2 }}>
              <tbody>
                <tr>
                  <td style={{ borderRight: B, padding: '5px 6px', fontSize: '7.5px', lineHeight: '1.4', verticalAlign: 'top', width: '55%', color: '#333', whiteSpace: 'pre-wrap' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '7px', textTransform: 'uppercase', marginBottom: '2px', color: '#000' }}>Informações Fiscais</div>
                    {t.invoiceFiscal || '—'}
                  </td>
                  <td style={{ padding: 0, verticalAlign: 'top' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        <tr>
                          <td style={{ borderBottom: B, padding: 0, verticalAlign: 'top' }}>
                            <div style={LABEL}>Base de Cálculo</div>
                            <div style={{ ...VALUE, textAlign: 'right' }}>{fmtMoney(inv.amountCents)}</div>
                          </td>
                          <td style={{ borderBottom: B, borderLeft: B, padding: 0, verticalAlign: 'top' }}>
                            <div style={LABEL}>Descontos</div>
                            <div style={{ ...VALUE, textAlign: 'right', color: '#666' }}>R$ 0,00</div>
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={2} style={{ padding: 0, background: '#f0f0f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Total da Fatura</span>
                              <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{fmtMoney(inv.amountCents)}</span>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 8. dados adicionais */}
          <div style={{ flexShrink: 0, marginTop: '2mm' }}>
            <div style={BAR}>Dados Adicionais</div>
            <div style={{ borderLeft: B2, borderRight: B2, borderBottom: B2, padding: '5px 8px', fontSize: '8.5px', lineHeight: '1.4', minHeight: '25px', whiteSpace: 'pre-wrap', color: '#222' }}>
              {extra || '—'}
              {inv.status === 'paga' && `\nPAGAMENTO RECEBIDO EM ${inv.paidAt?.toLocaleDateString('pt-BR')}${inv.paymentMethod ? ` VIA ${METHODS[inv.paymentMethod].toUpperCase()}` : ''}.`}
            </div>
          </div>

          {/* 9. rodape */}
          <div style={{ flexShrink: 0, marginTop: '3mm', borderTop: '1px solid #ccc', paddingTop: '3px', fontSize: '6.5px', color: '#999' }}>
            Documento gerado em {generatedAt} &nbsp;|&nbsp; {displayName} — situação: {invoiceState(inv).toUpperCase()}
          </div>
        </div>
      </div>

      {open && inv.boletoUrl && (
        <div className="mx-auto mt-4 max-w-[210mm] px-4 text-center print:hidden">
          <a href={inv.boletoUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-gray-700 underline">Abrir o boleto do banco (PDF)</a>
        </div>
      )}
    </div>
  );
}
