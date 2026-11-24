import { notFound } from 'next/navigation';
import { requireUser, screenScope } from '@/lib/auth';
import { db } from '@/lib/db';
import { groupToPlayable, mediaToPlayable } from '@/lib/playables';
import { PageHeader } from '@/components/basic';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PlaylistEditor } from '@/components/PlaylistEditor';
import { savePlaylist } from '../../actions';

const itemKey = (i: { mediaId: string | null; groupId: string | null }) => (i.mediaId ? `m:${i.mediaId}` : `g:${i.groupId}`);

export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const screen = await db.screen.findFirst({ where: { ...screenScope(user), id }, include: { category: true, items: { orderBy: { position: 'asc' } } } });
  if (!screen) notFound();
  const [categories, clients, medias, groups, others] = await Promise.all([
    db.category.findMany({ orderBy: { name: 'asc' } }),
    db.client.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.media.findMany({ where: { OR: [{ tenantId: user.tenantId }, { tenantId: null }], active: true }, include: { client: { select: { name: true, active: true } } }, orderBy: { name: 'asc' } }),
    db.mediaGroup.findMany({ where: { tenantId: user.tenantId, active: true }, include: { medias: { include: { media: true }, orderBy: { position: 'asc' } } }, orderBy: { name: 'asc' } }),
    db.screen.findMany({ where: { ...screenScope(user), NOT: { id } }, orderBy: { name: 'asc' }, select: { id: true, name: true, items: { orderBy: { position: 'asc' }, select: { mediaId: true, groupId: true } } } }),
  ]);
  const playables = [...medias.map((m) => mediaToPlayable(m, screen.orientation)), ...groups.map(groupToPlayable)];

  return (
    <>
      <PageHeader title={<>Playlist de <span className="text-brand-600">#{screen.name}</span></>} crumbs={[{ label: 'Minhas telas', href: '/telas' }, { label: screen.name, href: `/telas/${id}` }, { label: 'Playlist' }]} />
      <ScreenHeader screen={screen} categories={categories} clients={clients} />
      <PlaylistEditor vertical={screen.orientation === 'V'} screenId={id} playables={playables} initial={screen.items.map(itemKey)} others={others.map((o) => ({ id: o.id, name: o.name, keys: o.items.map(itemKey) }))} save={savePlaylist} />
    </>
  );
}
