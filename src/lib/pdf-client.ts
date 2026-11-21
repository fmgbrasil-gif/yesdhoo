'use client';

/** Nome de arquivo seguro: "Fatura CEI ESCOLA 11-2026.pdf" */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

/** Captura um elemento A4 da pagina (fatura, Pix) e salva como PDF de uma pagina. */
export async function elementToPdf(el: HTMLElement, fileName: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  await document.fonts?.ready;
  await Promise.all([...el.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: el.scrollWidth });
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const w = 210;
  const h = Math.min(297, (canvas.height * w) / canvas.width);
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h);
  pdf.save(safeName(fileName));
}

/** Contrato em texto: paginas A4 com quebra automatica, titulo e clausulas em negrito, logo no topo. */
export type PdfSignature = { image: string; name: string; doc: string; when: string; ip?: string | null; hash?: string | null };

export async function contractToPdf(body: string, fileName: string, logoUrl?: string | null, sig?: PdfSignature | null) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 20, W = 210 - M * 2, BOTTOM = 297 - 18;
  let y = M;
  if (logoUrl) {
    try {
      const img = await loadImage(logoUrl);
      const h = 16, w = (img.width / img.height) * h;
      pdf.addImage(img, 'PNG', (210 - w) / 2, y, w, h);
      y += h + 8;
    } catch { /* sem logo */ }
  }
  const lines = body.split('\n');
  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (!t) { y += 3; return; }
    const heading = i === 0 || /^CL[ÁA]USULA\b/i.test(t) || (t === t.toUpperCase() && /[A-ZÀ-Ú]{4}/.test(t) && t.length < 120);
    pdf.setFont('helvetica', heading ? 'bold' : 'normal');
    pdf.setFontSize(i === 0 ? 13 : heading ? 10.5 : 10);
    const parts = pdf.splitTextToSize(heading ? t.toUpperCase() : t, W) as string[];
    const lh = i === 0 ? 6.2 : 5;
    if (heading && i > 0) y += 5; // mais espaco antes de cada clausula
    for (const p of parts) {
      if (y + lh > BOTTOM) { pdf.addPage(); y = M; }
      pdf.text(p, i === 0 ? 105 : M, y, { align: i === 0 ? 'center' : 'left', maxWidth: W });
      y += lh;
    }
    if (i === 0) y += 3;
  });
  if (sig) {
    // bloco da assinatura eletronica do cliente, no fim do contrato
    if (y + 62 > BOTTOM) { pdf.addPage(); y = M; }
    y += 6;
    pdf.setDrawColor(150); pdf.setLineWidth(0.3); pdf.roundedRect(M, y, W, 56, 2, 2);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text('ASSINATURA ELETRÔNICA DO CONTRATANTE', M + 4, y + 7);
    try { const img = await loadImage(sig.image); const h = 20, w = Math.min(70, (img.width / img.height) * h); pdf.addImage(img, 'PNG', M + 4, y + 10, w, h); } catch { /* sem imagem */ }
    pdf.setDrawColor(0); pdf.line(M + 4, y + 31, M + 90, y + 31);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    const lines = [
      `Assinado por: ${sig.name} — ${sig.doc}`,
      `Data e hora: ${sig.when}${sig.ip ? ` · IP ${sig.ip}` : ''}`,
      ...(sig.hash ? [`Código de verificação (SHA-256 do texto): ${sig.hash}`] : []),
    ];
    let yy = y + 37;
    for (const l of lines) for (const part of pdf.splitTextToSize(l, W - 8) as string[]) { pdf.text(part, M + 4, yy); yy += 4.6; }
    y += 60;
  }
  const n = pdf.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    pdf.setPage(p); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(120);
    pdf.text(`Página ${p} de ${n}`, 105, 297 - 10, { align: 'center' });
    pdf.setTextColor(0);
  }
  pdf.save(safeName(fileName));
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
