import Link from 'next/link';
import { MonitorUp } from 'lucide-react';
import { requireUser, screenScope } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseJson } from '@/lib/util';
import { mediaFormData } from '@/lib/form-data';
import { LIBRARY_SECTIONS, MEDIA_TYPES } from '@/lib/constants';
import { PageHeader } from '@/components/basic';
import { ActionForm, Modal, MultiPicker } from '@/components/ui';
import { includeLibrary } from '../midias/actions';

export default async function BibliotecaPage({ searchParams }: { searchParams: Promise<{ secao?: string }> }) {
  const sp = await searchParams;
  const section = sp.secao && LIBRARY_SECTIONS[sp.secao] ? sp.secao : 'marca';
  const user = await requireUser();
  const [items, data] = await Promise.all([
    db.media.findMany({ where: { tenantId: null, library: section, active: true }, orderBy: { name: 'asc' }, include: { items: { where: { screen: screenScope(user) }, select: { screenId: true } } } }),
    mediaFormData(user),
  ]);
  return (
    <>
      <PageHeader title="Conteúdos dinâmicos" crumbs={[{ label: 'Conteúdos' }, { label: 'Conteúdos dinâmicos' }]} />
      <p className="mb-4 max-w-2xl text-sm text-ink-500">Conteúdos prontos, mantidos pela plataforma, para deixar a programação mais atrativa entre um anúncio e outro.</p>
      <div className="mb-5 flex flex-wrap gap-1">
        {Object.entries(LIBRARY_SECTIONS).map(([k, label]) => (
          <Link key={k} href={`/biblioteca?secao=${k}`} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${k === section ? 'bg-ink-900 text-white dark:bg-brand-400 dark:text-ink-900' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700'}`}>{label}</Link>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((m) => {
          const cfg = parseJson<Record<string, string>>(m.config, {});
          const on = [...new Set(m.items.map((i) => i.screenId))];
          return (
            <article key={m.id} className="card overflow-hidden">
              <div className="flex aspect-video flex-col items-center justify-center gap-2 p-5 text-center" style={{ background: cfg.bg ?? '#0b1120', color: cfg.textColor ?? cfg.color ?? '#fff' }}>
                <p className="text-lg font-black leading-tight" style={{ color: cfg.titleColor ?? cfg.color }}>{cfg.title ?? m.name}</p>
                <p className="line-clamp-3 text-xs opacity-90">{cfg.text ?? MEDIA_TYPES[m.type]}</p>
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{m.name}</p><p className="text-xs text-ink-400">{MEDIA_TYPES[m.type]} · {m.duration}s · em {on.length} tela(s)</p></div>
                <Modal trigger={<><MonitorUp size={15} /> Telas</>} triggerClass="btn-ghost shrink-0" title={`Incluir “${m.name}” nas telas`}>
                  <ActionForm action={includeLibrary} submit="Aplicar">
                    <input type="hidden" name="id" value={m.id} />
                    <p className="text-sm text-ink-500">Marque as telas que devem exibir este conteúdo. Desmarque para remover.</p>
                    <MultiPicker name="screens" options={data.screens} defaultValue={on} placeholder="Busque pelo nome da tela..." />
                  </ActionForm>
                </Modal>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
