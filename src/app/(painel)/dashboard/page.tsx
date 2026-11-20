import Link from 'next/link';
import { requireUser, screenScope } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmtInt, isOnline, lastDays } from '@/lib/util';
import { fileUrl } from '@/lib/storage';
import { WEEK_DAYS } from '@/lib/constants';
import { Avatar, Bars } from '@/components/basic';
import { Notes } from '@/components/Notes';
import MapView from '@/components/MapLazy';
import { saveUserNotes } from './actions';

const SEG_COLORS = ['#8a52f8', '#0ea5e9', '#10b981', '#f43f5e', '#8b5cf6', '#f97316', '#14b8a6', '#64748b'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default async function Dashboard() {
  const user = await requireUser();
  const scope = screenScope(user);
  const screens = await db.screen.findMany({
    where: scope,
    include: { category: true, items: { include: { media: { select: { duration: true } }, group: { include: { medias: { include: { media: { select: { duration: true } } } } } } } } },
  });
  const ids = screens.map((s) => s.id);
  const days = lastDays(7);
  const yearAgo = lastDays(365)[0];
  const [uptime, stats] = await Promise.all([
    db.screenUptime.groupBy({ by: ['date'], where: { screenId: { in: ids }, date: { gte: days[0] } }, _sum: { minutes: true } }),
    db.playStat.groupBy({ by: ['date'], where: { screenId: { in: ids }, date: { gte: yearAgo } }, _sum: { count: true } }),
  ]);

  const total = screens.length;
  const online = screens.filter((s) => isOnline(s.lastSeenAt)).length;
  const upByDay = Object.fromEntries(uptime.map((u) => [u.date, u._sum.minutes ?? 0]));
  const perf = days.map((d) => ({ label: WEEK_DAYS[new Date(d + 'T12:00:00').getDay()], value: total ? Math.round((upByDay[d] ?? 0) / 60 / total) : 0, title: `${d}: média de ${total ? Math.round((upByDay[d] ?? 0) / 60 / total) : 0}h online por tela` }));

  const segments = Object.entries(screens.reduce<Record<string, number>>((a, s) => { const k = s.category?.name ?? 'Sem segmento'; a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);

  const byMonth: Record<string, number> = {};
  for (const s of stats) byMonth[s.date.slice(0, 7)] = (byMonth[s.date.slice(0, 7)] ?? 0) + (s._sum.count ?? 0);
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const monthly = months.map((m) => ({ label: MONTHS[Number(m.slice(5)) - 1], value: byMonth[m] ?? 0 }));

  const last30 = lastDays(30)[0];
  const views30 = stats.filter((s) => s.date >= last30).reduce((a, s) => a + (s._sum.count ?? 0), 0);
  const cycle = (s: (typeof screens)[number]) => s.items.reduce((a, it) => a + (it.media?.duration ?? it.group?.medias[0]?.media.duration ?? 0), 0);
  const avg = (n: number) => (total ? Math.round(n / total) : 0);
  const avgHours = perf.length ? Math.round(perf.reduce((a, p) => a + p.value, 0) / perf.length) : 0;
  const top = [...screens].sort((a, b) => b.items.length - a.items.length).slice(0, 5);
  const maxItems = Math.max(1, top[0]?.items.length ?? 1);
  const points = screens.filter((s) => s.latitude != null && s.longitude != null).map((s) => ({ id: s.id, name: s.name, lat: s.latitude!, lng: s.longitude!, online: isOnline(s.lastSeenAt) }));
  const plan = user.tenant.planScreens;

  return (
    <div className="space-y-6">
      <h1>Sua rede de telas</h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="mb-4 font-bold">Tempo real</h2>
          <div className="mb-4 grid grid-cols-2 divide-x divide-ink-100 rounded-lg bg-ink-50 py-3 text-center dark:divide-ink-700 dark:bg-ink-900">
            <div><p className="text-xs font-semibold uppercase text-emerald-600">● Online</p><p className="text-3xl font-black text-emerald-600">{online}</p></div>
            <div><p className="text-xs font-semibold uppercase text-ink-400">Offline</p><p className="text-3xl font-black text-ink-400">{total - online}</p></div>
          </div>
          <p className="mb-3 text-center text-sm text-ink-400"><b>{total ? Math.round((online / total) * 100) : 0}%</b> das suas telas estão online</p>
          <p className="label">Horas online por dia (média por tela)</p>
          <Bars data={perf} height={70} />
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-bold">Seu plano</h2>
          <p className="mb-3"><span className="text-3xl font-black">{total}</span><span className="text-ink-400"> /{plan} telas</span></p>
          <div className="mb-4 flex h-6 overflow-hidden rounded-md bg-ink-100 dark:bg-ink-900" role="img" aria-label="Telas por segmento">
            {segments.map(([name, n], i) => <div key={name} title={`${name}: ${n}`} style={{ width: `${(n / Math.max(plan, total)) * 100}%`, background: SEG_COLORS[i % SEG_COLORS.length] }} />)}
          </div>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {segments.map(([name, n], i) => (
              <li key={name} className="flex items-center gap-2"><span className="flex h-5 min-w-5 items-center justify-center rounded px-1 text-xs font-bold text-white" style={{ background: SEG_COLORS[i % SEG_COLORS.length] }}>{n}</span><span className="truncate">{name}</span></li>
            ))}
          </ul>
          {total === 0 && <p className="text-sm text-ink-400">Cadastre sua primeira tela em <Link className="font-semibold underline" href="/telas">Minhas telas</Link>.</p>}
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-bold">Cobertura da rede</h2>
          {points.length ? <MapView points={points} height={210} /> : <p className="text-sm text-ink-400">Defina a localização das telas para vê-las no mapa.</p>}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-bold">Estatísticas e métricas</h2>
          <div className="grid gap-6 md:grid-cols-[1fr_180px]">
            <div><p className="label">Exibições por mês (últimos 12 meses)</p><Bars data={monthly} height={170} highlightMax /></div>
            <dl className="space-y-3 border-ink-100 md:border-l md:pl-6 dark:border-ink-700">
              <p className="label">Médias por tela</p>
              {[[fmtInt(avg(views30 / 30)), 'exibições diárias'], [`${avgHours}h`, 'online por dia'], [avg(screens.reduce((a, s) => a + s.items.length, 0)), 'conteúdos na playlist'], [`${Math.round(avg(screens.reduce((a, s) => a + cycle(s), 0)) / 60)}min`, 'tempo de ciclo']].map(([v, l]) => (
                <div key={String(l)}><dd className="text-2xl font-black">{v}</dd><dt className="text-xs text-ink-400">{l}</dt></div>
              ))}
            </dl>
          </div>
        </section>
        <section className="card p-5">
          <h2 className="mb-4 font-bold">Telas mais requisitadas</h2>
          <ul className="space-y-3">
            {top.map((s) => (
              <li key={s.id}>
                <Link href={`/telas/${s.id}`} className="flex items-center gap-3">
                  <Avatar src={fileUrl(s.image)} name={s.name} size={34} square />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.name}</span>
                    <span className="mt-1 block h-2 overflow-hidden rounded bg-ink-100 dark:bg-ink-900"><span className="block h-full rounded bg-brand-400" style={{ width: `${(s.items.length / maxItems) * 100}%` }} /></span>
                  </span>
                  <span className="text-right text-sm font-bold">{s.items.length}<span className="block text-[10px] font-normal text-ink-400">conteúdos</span></span>
                </Link>
              </li>
            ))}
            {top.length === 0 && <p className="text-sm text-ink-400">Sem telas cadastradas.</p>}
          </ul>
        </section>
      </div>

      <Notes action={saveUserNotes} defaultValue={user.notes} />
    </div>
  );
}
