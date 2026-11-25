import Link from 'next/link';
import { MonitorUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { requireUser, screenScope } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseJson } from '@/lib/util';
import { mediaFormData } from '@/lib/form-data';
import { LIBRARY_SECTIONS, MEDIA_TYPES } from '@/lib/constants';
import { PageHeader } from '@/components/basic';
import { ActionForm, Confirm, Modal, MultiPicker } from '@/components/ui';
import { MediaFields } from '@/components/MediaForm';
import { fileUrl } from '@/lib/storage';
import { deleteMedia, includeLibrary, saveMedia } from '../midias/actions';
import { ContentPreview } from '@/components/ContentPreview';
import { mediaForPlayer } from '@/lib/playables';

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
      <PageHeader title="Conteúdos dinâmicos" crumbs={[{ label: 'Conteúdos' }, { label: 'Conteúdos dinâmicos' }]}>
        {user.superAdmin && (
          <Modal trigger={<><Plus size={16} /> Adicionar vídeo ou imagem</>} title="Adicionar aos Conteúdos dinâmicos">
            <ActionForm action={saveMedia}><MediaFields type="arquivo" data={data} library={section} /></ActionForm>
          </Modal>
        )}
      </PageHeader>
      <p className="mb-4 max-w-2xl text-sm text-ink-500">Conteúdos prontos, mantidos pela plataforma, para deixar a programação mais atrativa entre um anúncio e outro.</p>
      <div className="mb-5 flex flex-wrap gap-1">
        {Object.entries(LIBRARY_SECTIONS).map(([k, label]) => (
          <Link key={k} href={`/biblioteca?secao=${k}`} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${k === section ? 'bg-ink-900 text-white dark:bg-brand-400 dark:text-on-brand' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700'}`}>{label}</Link>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((m) => {
          const cfg = parseJson<Record<string, string>>(m.config, {});
          const on = [...new Set(m.items.map((i) => i.screenId))];
          return (
            <article key={m.id} className="card overflow-hidden">
              {m.type === 'arquivo' ? (
                <div className="relative aspect-video bg-ink-900">
                  {m.thumb && <img src={fileUrl(m.thumb) ?? ''} alt="" className="h-full w-full object-cover" />}{/* eslint-disable-line @next/next/no-img-element */}
                  <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase text-white">{m.kind === 'video' ? 'Vídeo' : 'Imagem'} · {[m.fileH && 'H', m.fileV && 'V'].filter(Boolean).join(' + ')}</span>
                </div>
              ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-2 p-5 text-center" style={{ background: cfg.bg ?? '#1b0c30', color: cfg.textColor ?? cfg.color ?? '#fff' }}>
                <p className="text-lg font-black leading-tight" style={{ color: cfg.titleColor ?? cfg.color }}>{cfg.title ?? m.name}</p>
                <p className="line-clamp-3 text-xs opacity-90">{cfg.text ?? (m.type === 'rss' && cfg.source ? `Manchetes de ${cfg.source}` : MEDIA_TYPES[m.type])}</p>
              </div>
              )}
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{m.name}</p><p className="text-xs text-ink-400">{m.type === 'arquivo' ? (m.kind === 'video' ? 'Vídeo' : 'Imagem') : MEDIA_TYPES[m.type]} · {m.duration}s · em {on.length} tela(s)</p>
                  {user.superAdmin && m.type === 'arquivo' && (
                    <span className="mt-1 flex gap-1">
                      <Modal trigger={<Pencil size={13} />} triggerClass="btn-icon !h-7 !w-7" titleAttr="Editar" title={`Editar “${m.name}”`}><ActionForm action={saveMedia}><MediaFields type="arquivo" media={m} data={data} library={m.library ?? section} /></ActionForm></Modal>
                      <Confirm trigger={<Trash2 size={13} />} triggerClass="btn-icon !h-7 !w-7 !text-red-600" titleAttr="Excluir" title={`Excluir “${m.name}”?`} confirmLabel="Excluir" action={deleteMedia} fields={{ id: m.id }} text="O conteúdo sai dos Conteúdos dinâmicos e de todas as telas de todas as empresas." />
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                <ContentPreview h={mediaForPlayer(m, 'H')} v={mediaForPlayer(m, 'V')} />
                <Modal trigger={<><MonitorUp size={15} /> Telas</>} triggerClass="btn-ghost shrink-0" title={`Incluir “${m.name}” nas telas`}>
                  <ActionForm action={includeLibrary} submit="Aplicar">
                    <input type="hidden" name="id" value={m.id} />
                    <p className="text-sm text-ink-500">Marque as telas que devem exibir este conteúdo. Desmarque para remover.</p>
                    <MultiPicker name="screens" options={data.screens} defaultValue={on} presets={data.operations} placeholder="Busque pelo nome da tela..." />
                  </ActionForm>
                </Modal>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
