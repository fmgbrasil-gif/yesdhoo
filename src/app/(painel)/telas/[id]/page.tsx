import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ListVideo, Send } from 'lucide-react';
import { requireUser, screenScope } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtBytes, lastDays, parseJson, timeAgo } from '@/lib/util';
import { fileUrl } from '@/lib/storage';
import { COMMANDS, ORIENTATIONS, WEEK_DAYS } from '@/lib/constants';
import { Bars, PageHeader } from '@/components/basic';
import { ActionForm, Field, Modal } from '@/components/ui';
import { Notes } from '@/components/Notes';
import { ScreenHeader } from '@/components/ScreenHeader';
import { saveScreenNotes, sendCommand } from '../actions';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default async function TelaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ periodo?: string }> }) {
  const { id } = await params;
  const daily = (await searchParams).periodo === 'diario';
  const user = await requireUser();
  const screen = await db.screen.findFirst({ where: { ...screenScope(user), id }, include: { category: true } });
  if (!screen) notFound();
  const days7 = lastDays(7, screen.timezone);
  const days30 = lastDays(30, screen.timezone);
  const [categories, clients, commands, stats, uptime] = await Promise.all([
    db.category.findMany({ orderBy: { name: 'asc' } }),
    db.client.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.command.findMany({ where: { screenId: id }, orderBy: { createdAt: 'desc' }, take: 8, include: { user: { select: { name: true } } } }),
    db.playStat.groupBy({ by: ['date'], where: { screenId: id, date: { gte: lastDays(365)[0] } }, _sum: { count: true } }),
    db.screenUptime.findMany({ where: { screenId: id, date: { gte: days7[0] } } }),
  ]);
  const info = parseJson<Record<string, string | number>>(screen.deviceInfo, {});
  const byDate = Object.fromEntries(stats.map((s) => [s.date, s._sum.count ?? 0]));
  const byMonth: Record<string, number> = {};
  for (const s of stats) byMonth[s.date.slice(0, 7)] = (byMonth[s.date.slice(0, 7)] ?? 0) + (s._sum.count ?? 0);
  const now = new Date();
  const chart = daily
    ? days30.map((d) => ({ label: d.slice(8), value: byDate[d] ?? 0, title: `${d}: ${byDate[d] ?? 0} exibições` }))
    : Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; return { label: MONTHS[d.getMonth()], value: byMonth[k] ?? 0 }; });
  const up = Object.fromEntries(uptime.map((u) => [u.date, u.minutes]));
  const paired = !!screen.deviceToken;
  const device: [string, string | number][] = [
    ['Modelo', info.model ?? '—'], ['Sistema', info.os ?? '—'], ['Navegador / app', info.app ?? '—'], ['Resolução', info.resolution ?? '—'],
    ['Armazenamento usado', typeof info.storageUsed === 'number' ? fmtBytes(info.storageUsed) : '—'], ['Orientação', ORIENTATIONS[screen.orientation as 'H' | 'V']],
  ];

  return (
    <>
      <PageHeader title={screen.name} crumbs={[{ label: 'Minhas telas', href: '/telas' }, { label: screen.name }]}>
        <Link href={`/telas/${id}/playlist`} className="btn-primary"><ListVideo size={16} /> Playlist</Link>
      </PageHeader>
      <ScreenHeader screen={screen} categories={categories} clients={clients} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {!paired && (
            <section className="card border-brand-300 bg-brand-50 p-5 dark:bg-ink-800">
              <h2 className="mb-1 font-bold">Parear dispositivo</h2>
              <p className="text-sm text-ink-600 dark:text-ink-200">No aparelho ligado à TV, abra o endereço do player e digite o código abaixo:</p>
              <p className="my-3 text-center font-mono text-4xl font-black tracking-[0.3em]">{screen.pairingCode}</p>
              <p className="text-center text-sm">Endereço do player: <Link href="/player" target="_blank" className="font-semibold underline">/player</Link></p>
            </section>
          )}
          <section className="card overflow-hidden">
            <div className={`relative mx-auto bg-ink-900 ${screen.orientation === 'V' ? 'aspect-[9/16] max-h-96' : 'aspect-video'} w-full`}>
              {screen.screenshot
                ? <img src={fileUrl(screen.screenshot)!} alt="Última captura da tela" className="h-full w-full object-contain" /> // eslint-disable-line @next/next/no-img-element
                : <p className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-400">Nenhuma captura ainda. Envie o comando “Capturar tela”.</p>}
              {screen.screenshotAt && <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Capturada {timeAgo(screen.screenshotAt)}</span>}
            </div>
          </section>
          <section className="card p-5">
            <h2 className="mb-3 font-bold">Dispositivo</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {device.map(([k, v]) => <div key={k}><dt className="text-xs text-ink-400">{k}</dt><dd className="break-words font-semibold">{v}</dd></div>)}
              <div><dt className="text-xs text-ink-400">Última sincronização</dt><dd className="font-semibold">{timeAgo(screen.syncedAt)}</dd></div>
              <div><dt className="text-xs text-ink-400">Playlist</dt><dd className="font-semibold">{!paired ? '—' : screen.syncedVersion >= screen.playlistVersion ? 'Sincronizada' : 'Aguardando sincronização'}</dd></div>
            </dl>
          </section>
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Comandos remotos</h2>
              <Modal trigger={<><Send size={15} /> Enviar comando</>} triggerClass="btn-ghost" title="Enviar comando">
                <ActionForm action={sendCommand} submit="Enviar">
                  <input type="hidden" name="id" value={id} />
                  <Field label="Comando" hint="O dispositivo executa o comando na próxima comunicação (até 1 minuto).">
                    <select name="type" className="input">{Object.entries(COMMANDS).map(([k, c]) => <option key={k} value={k}>{c.label} — {c.hint}</option>)}</select>
                  </Field>
                </ActionForm>
              </Modal>
            </div>
            {commands.length === 0 && <p className="text-sm text-ink-400">Nenhum comando enviado ainda.</p>}
            <ul className="space-y-3">
              {commands.map((c) => (
                <li key={c.id} className="flex items-center gap-3 text-sm">
                  <span className={`h-2 w-2 rounded-full ${c.status === 'executado' ? 'bg-emerald-500' : 'bg-brand-400'}`} />
                  <span className="flex-1"><b>{c.user?.name ?? 'Usuário removido'}</b> solicitou <span className="badge bg-ink-100 font-mono text-ink-700 dark:bg-ink-700 dark:text-ink-100">{COMMANDS[c.type]?.label ?? c.type}</span></span>
                  <span className="text-xs text-ink-400">{c.status === 'executado' ? `executado ${timeAgo(c.executedAt)}` : `pendente · ${timeAgo(c.createdAt)}`}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">Exibições</h2>
              <div className="flex gap-1 rounded-lg bg-ink-100 p-1 text-sm font-semibold dark:bg-ink-900">
                <Link href={`/telas/${id}`} className={`rounded-md px-3 py-1 ${!daily ? 'bg-white shadow-sm dark:bg-ink-700' : 'text-ink-500'}`}>Mensal</Link>
                <Link href={`/telas/${id}?periodo=diario`} className={`rounded-md px-3 py-1 ${daily ? 'bg-white shadow-sm dark:bg-ink-700' : 'text-ink-500'}`}>Diário</Link>
              </div>
            </div>
            <Bars data={chart} height={170} highlightMax />
            <p className="label mt-6">Horas online (últimos 7 dias)</p>
            <Bars data={days7.map((d) => ({ label: WEEK_DAYS[new Date(d + 'T12:00:00').getDay()], value: Math.round((up[d] ?? 0) / 60), title: `${d}: ${Math.round((up[d] ?? 0) / 60)}h online` }))} height={60} />
          </section>
          <Notes action={saveScreenNotes} defaultValue={screen.notes} id={id} />
        </div>
      </div>
    </>
  );
}
