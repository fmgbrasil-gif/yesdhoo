import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { requireUser, screenScope } from '@/lib/auth';
import { db } from '@/lib/db';
import { folderConfig, folderToken } from '@/lib/folder';
import { folderData } from '@/lib/folder-data';
import { FolderView } from '@/components/FolderView';
import { PrintButton } from '@/components/PrintButton';
import { ClientReportSend } from '@/components/ClientReportSend';

export const metadata: Metadata = { title: 'Folder promocional', robots: { index: false, follow: false } };

/** Folder promocional dos pontos (A4), com filtros, impressao e envio do link. */
export default async function RelatorioPontos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const cfg = folderConfig(user.tenant.folder);
  const where = { ...screenScope(user), ...(sp.instaladas ? { deviceToken: { not: null } } : {}), ...(sp.operacao ? { operations: { some: { id: sp.operacao } } } : {}), ...(sp.cidade ? { city: sp.cidade } : {}) };
  const [{ screens, numbers }, operations, cities] = await Promise.all([
    folderData(where, cfg),
    db.operation.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.screen.findMany({ where: { ...screenScope(user), city: { not: null } }, distinct: ['city'], select: { city: true }, orderBy: { city: 'asc' } }),
  ]);
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const link = `${origin}/folder/${folderToken(user.tenantId, { operacao: sp.operacao, cidade: sp.cidade })}`;
  const name = user.tenant.tradeName || user.tenant.name;
  return (
    <main className="min-h-screen bg-[#e9e4f2] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 max-w-[210mm] space-y-3 px-3 print:hidden">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <form className="flex flex-wrap items-end gap-2 text-sm">
            <label className="space-y-1"><span className="block text-xs font-semibold text-gray-600">Operação</span><select name="operacao" defaultValue={sp.operacao ?? ''} className="rounded border border-gray-400 bg-white px-2 py-1"><option value="">Todas</option>{operations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
            <label className="space-y-1"><span className="block text-xs font-semibold text-gray-600">Cidade</span><select name="cidade" defaultValue={sp.cidade ?? ''} className="rounded border border-gray-400 bg-white px-2 py-1"><option value="">Todas</option>{cities.map((c) => <option key={c.city} value={c.city!}>{c.city}</option>)}</select></label>
            <label className="flex items-center gap-1 pb-1"><input type="checkbox" name="instaladas" value="1" defaultChecked={!!sp.instaladas} /> Só telas instaladas</label>
            <button className="rounded bg-[#2a1240] px-3 py-1 font-semibold text-white">Ver</button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            {user.role === 'admin' && <Link href="/folder" className="rounded-lg border border-[#2a1240] bg-white px-4 py-2 text-sm font-semibold text-[#2a1240]">Editar folder</Link>}
            <PrintButton />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 text-sm">
          <span className="text-gray-600">Link do folder{sp.operacao || sp.cidade ? ' (com estes filtros)' : ''} para enviar:</span>
          <ClientReportSend url={link} phone={null} text={`*${name.toUpperCase()} - MÍDIA INDOOR*\n\nOlá! Conheça os nossos pontos de exibição e leve a sua marca para as telas:\n${link}`} />
        </div>
        <p className="text-xs text-gray-600">Para salvar em PDF: Imprimir → “Salvar como PDF”, margens “Nenhuma” e marque “Gráficos de fundo”.</p>
      </div>
      <div className="overflow-x-auto px-2 print:overflow-visible print:px-0"><FolderView tenant={user.tenant} cfg={cfg} screens={screens} numbers={numbers} /></div>
    </main>
  );
}
