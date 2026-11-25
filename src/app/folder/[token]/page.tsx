import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { folderConfig, readFolderToken } from '@/lib/folder';
import { folderData } from '@/lib/folder-data';
import { FolderView } from '@/components/FolderView';
import { PrintButton } from '@/components/PrintButton';

export const metadata: Metadata = { title: 'Folder — mídia indoor', robots: { index: false, follow: false } };

/** Folder promocional publico (link assinado) para enviar a anunciantes. */
export default async function FolderPublico({ params }: { params: Promise<{ token: string }> }) {
  const t = readFolderToken((await params).token);
  if (!t) notFound();
  const tenant = await db.tenant.findUnique({ where: { id: t.tenantId } });
  if (!tenant) notFound();
  const cfg = folderConfig(tenant.folder);
  const { screens, numbers } = await folderData({ tenantId: tenant.id, ...(t.operacao ? { operations: { some: { id: t.operacao } } } : {}), ...(t.cidade ? { city: t.cidade } : {}) }, cfg);
  return (
    <main className="min-h-screen bg-[#e9e4f2] py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-3 print:hidden"><PrintButton /></div>
      <div className="overflow-x-auto px-2 print:overflow-visible print:px-0"><FolderView tenant={tenant} cfg={cfg} screens={screens} numbers={numbers} /></div>
    </main>
  );
}
