import type { Category, Screen } from '@prisma/client';
import Link from 'next/link';
import { Calculator, FileText, RotateCw, HardDriveDownload, MapPin, Monitor, Pencil, RotateCcw, Star, Trash2 } from 'lucide-react';
import { screenPlaylist } from '@/lib/screen-playlist';
import { ScreenCalculator } from './ScreenCalculator';
import { RotationPicker } from './RotationPicker';
import { MediaDownloads } from './MediaDownloads';
import { Avatar, StatusDot } from './basic';
import { ActionButton, ActionForm, Confirm, Modal } from './ui';
import { ScreenFields } from './ScreenForm';
import MapView from './MapLazy';
import { isOnline, slugify, timeAgo } from '@/lib/util';
import { fileUrl } from '@/lib/storage';
import { ORIENTATIONS } from '@/lib/constants';
import { deleteScreen, resetScreen, toggleFavorite, updateScreen } from '@/app/(painel)/telas/actions';

type Opt = { id: string; name: string };

export async function ScreenHeader({ screen, categories, clients }: { screen: Screen & { category: Category | null }; categories: Opt[]; clients: Opt[] }) {
  const rows = await screenPlaylist(screen.id);
  const files = rows.filter((r) => r.type === 'arquivo').flatMap((r) => {
    const ext = (u: string) => u.split('?')[0].match(/\.(\w{2,4})$/)?.[1] ?? (r.kind === 'video' ? 'mp4' : 'jpg');
    const base = r.name.replace(/[\\/:*?"<>|]+/g, '-').trim();
    return [[r.fileH, 'horizontal'], [r.fileV, 'vertical']].filter(([k]) => k).map(([k, o]) => ({ name: `${base} (${o}).${ext(k!)}`, url: fileUrl(k)!, label: `${r.typeLabel} ${o}${r.client ? ' · ' + r.client : ''}` }));
  }).filter((f, i, a) => a.findIndex((x) => x.url === f.url) === i);
  const weekDays = screen.weekDays ? screen.weekDays.split(',').filter(Boolean).length : 7;
  const on = isOnline(screen.lastSeenAt);
  const slug = slugify(screen.name);
  const address = [screen.road, screen.number, screen.neighborhood, screen.city && `${screen.city}${screen.state ? ' - ' + screen.state : ''}`].filter(Boolean).join(' • ');
  return (
    <div className="card mb-6 flex flex-wrap items-center gap-4 p-4">
      <Avatar src={fileUrl(screen.image)} name={screen.name} size={64} square />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-400">{screen.category?.name ?? 'Sem segmento'}</p>
        <p className="truncate text-lg font-bold">{screen.name}</p>
        <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-500 dark:text-ink-300">
          <span className="inline-flex items-center gap-1"><Monitor size={14} /> {ORIENTATIONS[screen.orientation as 'H' | 'V']}</span>
          {screen.deviceToken
            ? <span className="inline-flex items-center gap-1.5"><StatusDot online={on} /> {on ? 'Online' : `Offline · visto ${timeAgo(screen.lastSeenAt)}`}</span>
            : <span className="badge bg-brand-100 text-brand-700">Aguardando pareamento</span>}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <ActionButton action={toggleFavorite} fields={{ id: screen.id }} title={screen.favorite ? 'Remover das favoritas' : 'Marcar como favorita'}>
          <Star size={16} className={screen.favorite ? 'fill-brand-400 text-brand-500' : ''} />
        </ActionButton>
        <Modal trigger={<MapPin size={16} />} triggerClass="btn-icon" title="Localização" titleAttr="Localização">
          {screen.latitude != null && screen.longitude != null
            ? <MapView points={[{ name: screen.name, lat: screen.latitude, lng: screen.longitude, online: on }]} height={320} />
            : <p className="text-sm text-ink-400">Localização não definida. Use Editar → Localização.</p>}
          <p className="mt-3 text-sm text-ink-500">{address || 'Endereço não informado'}</p>
        </Modal>
        <Modal trigger={<RotateCw size={16} />} triggerClass="btn-icon" title={`Girar a imagem — ${screen.name}`} titleAttr="Girar imagem" wide>
          <RotationPicker id={screen.id} value={screen.rotation} vertical={screen.orientation === 'V'} />
        </Modal>
        <Modal trigger={<Calculator size={16} />} triggerClass="btn-icon" title={`Calculadora de exibições — ${screen.name}`} titleAttr="Calculadora" wide>
          <ScreenCalculator rows={rows} workStart={screen.workStart} workEnd={screen.workEnd} days={weekDays} />
        </Modal>
        <Modal trigger={<HardDriveDownload size={16} />} triggerClass="btn-icon" title={`Download das mídias — ${screen.name}`} titleAttr="Download das mídias" wide>
          <MediaDownloads files={files} />
        </Modal>
        <Link href={`/relatorio/tela/${screen.id}`} target="_blank" className="btn-icon" title="Relatório de mídias" aria-label="Relatório de mídias"><FileText size={16} /></Link>
        <Modal trigger={<Pencil size={16} />} triggerClass="btn-icon" title="Editar tela" titleAttr="Editar">
          <ActionForm action={updateScreen}><ScreenFields screen={screen} categories={categories} clients={clients} /></ActionForm>
        </Modal>
        <Confirm trigger={<RotateCcw size={16} />} titleAttr="Resetar pareamento" title="Resetar esta tela?" confirmLabel="Sim, quero resetar" action={resetScreen} fields={{ id: screen.id }}
          text="O dispositivo será desvinculado e a tela voltará a aguardar pareamento com um novo código. A playlist é mantida." phrase={`resetar:${slug}`} />
        <Confirm trigger={<Trash2 size={16} />} triggerClass="btn-icon !border-red-200 !text-red-600" titleAttr="Excluir tela" title="Excluir esta tela?" confirmLabel="Sim, quero excluir" action={deleteScreen} fields={{ id: screen.id }}
          text="A tela, sua playlist e seu histórico de exibições serão removidos. Esta operação é irreversível." phrase={`excluir:${slug}`} />
      </div>
    </div>
  );
}
