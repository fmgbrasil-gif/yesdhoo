'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PlayerMedia } from '@/lib/playables';
import { youtubeId } from '@/lib/util';

type Footer = { text: string; bg: string; color: string; clock: boolean; weather: boolean } | null;
type Sync = {
  version: number;
  screen: { name: string; orientation: string; timezone: string; updateFrequency: number; audioEnabled: boolean; footer: Footer };
  slots: PlayerMedia[][];
};
type Current = { media: PlayerMedia; n: number } | null;

const LS = { token: 'yd-player-token', data: 'yd-player-data', rotate: 'yd-player-rotate', executed: 'yd-player-executed' };
const CACHE = 'yd-media-v1';
const full: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' };
const center: CSSProperties = { ...full, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '6cqmin', gap: '3cqmin' };

/** Data, hora e dia da semana no fuso da tela. */
function nowIn(tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

/** Regras de agendamento: periodo, turno (pode cruzar a meia-noite) e dias da semana. */
function eligible(m: PlayerMedia, tz: string) {
  const { date, time, day } = nowIn(tz);
  if (m.startDate && date < m.startDate) return false;
  if (m.endDate && date > m.endDate) return false;
  if (m.weekDays && !m.weekDays.split(',').includes(String(day))) return false;
  const a = m.shiftStart, b = m.shiftEnd;
  if (a && b) return a <= b ? time >= a && time <= b : time >= a || time <= b;
  if (a) return time >= a;
  if (b) return time <= b;
  return true;
}

async function precache(urls: string[]) {
  if (!('caches' in window)) return;
  const cache = await caches.open(CACHE);
  const keep = new Set(urls.map((u) => new URL(u, location.origin).href));
  for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req); // remove o que saiu da playlist
  for (const u of urls) if (!(await cache.match(u))) await cache.add(u).catch(() => {});
}

/** Usa o arquivo baixado (funciona sem internet); se ainda nao baixou, toca direto do servidor. */
function useCachedSrc(src: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let obj: string | null = null;
    let dead = false;
    setUrl(null);
    if (!src) return;
    (async () => {
      const hit = 'caches' in window ? await (await caches.open(CACHE)).match(src).catch(() => undefined) : undefined;
      if (dead) return;
      if (hit) { obj = URL.createObjectURL(await hit.blob()); if (!dead) setUrl(obj); } else setUrl(src);
    })();
    return () => { dead = true; if (obj) URL.revokeObjectURL(obj); };
  }, [src]);
  return url;
}

function Clock({ tz, style }: { tz: string; style?: CSSProperties }) {
  const [t, setT] = useState('');
  useEffect(() => {
    const tick = () => setT(new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date()));
    tick();
    const i = setInterval(tick, 5000);
    return () => clearInterval(i);
  }, [tz]);
  return <span style={style}>{t}</span>;
}

const WEATHER: Record<number, string> = { 0: 'Céu limpo', 1: 'Poucas nuvens', 2: 'Parcialmente nublado', 3: 'Nublado', 45: 'Neblina', 48: 'Neblina', 51: 'Garoa', 53: 'Garoa', 55: 'Garoa', 61: 'Chuva fraca', 63: 'Chuva', 65: 'Chuva forte', 80: 'Pancadas de chuva', 81: 'Pancadas de chuva', 82: 'Temporal', 95: 'Trovoadas', 96: 'Trovoadas', 99: 'Trovoadas' };

/** Slides montados pelo player a partir de dados (aviso, noticias, hora, dolar, clima). */
function Widget({ media, tz, api, skip, n }: { media: PlayerMedia; tz: string; api: (p: string) => Promise<Response>; skip: () => void; n: number }) {
  const cfg = media.config as Record<string, string | boolean | undefined>;
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const needsData = ['rss', 'dolar', 'clima'].includes(media.type);
  useEffect(() => {
    if (!needsData) return;
    let dead = false;
    api(`/api/player/widget?kind=${media.type}&id=${media.id}`).then((r) => r.json()).then((j) => {
      if (dead) return;
      const empty = media.type === 'rss' ? !j.items?.length : media.type === 'dolar' ? typeof j.value !== 'number' : typeof j.temp !== 'number';
      if (empty) skip(); else setData(j); // sem dados (offline ou fonte fora do ar): pula o slide
    }).catch(() => !dead && skip());
    return () => { dead = true; };
  }, [media.id, media.type, needsData, api, skip]);

  const bg = String(cfg.bg ?? '#0b1120');
  const color = String(cfg.textColor ?? cfg.color ?? '#ffffff');
  const image = typeof cfg.image === 'string' ? `/api/arquivos/${cfg.image}` : null;
  const base: CSSProperties = { ...center, background: bg, color };
  const big: CSSProperties = { fontSize: '13cqmin', fontWeight: 900, lineHeight: 1 };
  const label: CSSProperties = { fontSize: '4cqmin', opacity: 0.85 };
  if (needsData && !data) return <div style={{ ...full, background: bg }} />;

  if (media.type === 'aviso') {
    const scale = cfg.fontSize === 'pequena' ? 0.8 : cfg.fontSize === 'grande' ? 1.25 : 1;
    return (
      <div style={base}>
        {image && <img src={image} alt="" style={{ maxHeight: '26cqh', maxWidth: '50cqw', objectFit: 'contain' }} />}{/* eslint-disable-line @next/next/no-img-element */}
        {cfg.showTitle !== false && <p style={{ fontSize: `${8 * scale}cqmin`, fontWeight: 900, lineHeight: 1.1, color: String(cfg.titleColor ?? color) }}>{String(cfg.title ?? media.name)}</p>}
        <p style={{ fontSize: `${4.6 * scale}cqmin`, lineHeight: 1.35, maxWidth: '85cqw', whiteSpace: 'pre-wrap' }}>{String(cfg.text ?? '')}</p>
      </div>
    );
  }
  if (media.type === 'hora') {
    return (
      <div style={base}>
        {image && <img src={image} alt="" style={{ maxHeight: '24cqh', objectFit: 'contain' }} />}{/* eslint-disable-line @next/next/no-img-element */}
        <p style={label}>{new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())}</p>
        <Clock tz={tz} style={{ ...big, fontSize: '24cqmin', fontVariantNumeric: 'tabular-nums' }} />
      </div>
    );
  }
  if (media.type === 'dolar') {
    const d = data as { value: number; change: number };
    return (
      <div style={base}>
        <p style={label}>Cotação do dólar hoje</p>
        <p style={big}>R$ {d.value.toFixed(2).replace('.', ',')}</p>
        <p style={label}>US$ 1,00 · {d.change >= 0 ? '▲' : '▼'} {Math.abs(d.change).toFixed(2).replace('.', ',')}% no dia</p>
      </div>
    );
  }
  if (media.type === 'clima') {
    const d = data as { temp: number; code: number; max: number; min: number; city?: string };
    return (
      <div style={base}>
        <p style={label}>{d.city ? `Tempo agora em ${d.city}` : 'Tempo agora'}</p>
        <p style={{ ...big, fontSize: '22cqmin' }}>{d.temp}°C</p>
        <p style={{ fontSize: '5.5cqmin', fontWeight: 700 }}>{WEATHER[d.code] ?? 'Tempo instável'}</p>
        <p style={label}>Máx. {d.max}° · Mín. {d.min}°</p>
      </div>
    );
  }
  // rss: uma manchete diferente a cada passagem pela playlist
  const items = (data as { items: { title: string; summary: string; image: string | null }[] }).items;
  const item = items[n % items.length];
  return (
    <div style={{ ...full, background: bg, color, display: 'flex', flexDirection: 'column' }}>
      {item.image && <div style={{ flex: 1, minHeight: 0, backgroundImage: `url("${item.image}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />}
      <div style={{ padding: '4cqmin 5cqmin', display: 'flex', flexDirection: 'column', gap: '1.5cqmin', ...(item.image ? {} : { flex: 1, justifyContent: 'center' }) }}>
        <p style={{ fontSize: '3cqmin', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', opacity: 0.8 }}>{String(cfg.source || media.name)}</p>
        <p style={{ fontSize: '6cqmin', fontWeight: 900, lineHeight: 1.12 }}>{item.title}</p>
        {!item.image && <p style={{ fontSize: '3.6cqmin', opacity: 0.85 }}>{item.summary}</p>}
      </div>
    </div>
  );
}

function Stage({ cur, sync, api, next }: { cur: NonNullable<Current>; sync: Sync; api: (p: string) => Promise<Response>; next: () => void }) {
  const { media } = cur;
  const isVideo = media.type === 'arquivo' && media.kind === 'video';
  const src = useCachedSrc(media.type === 'arquivo' ? media.src : null);
  useEffect(() => {
    // video avanca ao terminar; o temporizador e a rede de seguranca caso ele trave
    const t = setTimeout(next, (media.duration + (isVideo ? 8 : 0)) * 1000);
    return () => clearTimeout(t);
  }, [cur, media.duration, isVideo, next]);
  const fail = useCallback(() => setTimeout(next, 1000), [next]);

  if (media.type === 'arquivo') {
    if (!src) return null;
    return isVideo
      ? <video key={cur.n} src={src} autoPlay playsInline muted={!sync.screen.audioEnabled} onEnded={next} onError={fail} style={{ ...full, objectFit: 'contain', background: '#000' }} />
      : <img src={src} alt="" onError={fail} style={{ ...full, objectFit: 'contain', background: '#000' }} />; // eslint-disable-line @next/next/no-img-element
  }
  if (media.type === 'youtube') {
    const id = youtubeId(media.url ?? '');
    if (!id) return null;
    return <iframe key={cur.n} title={media.name} allow="autoplay; encrypted-media" style={{ ...full, border: 0 }} src={`https://www.youtube.com/embed/${id}?autoplay=1&mute=${sync.screen.audioEnabled ? 0 : 1}&controls=0&rel=0&playsinline=1`} />;
  }
  if (media.type === 'link') return <iframe key={cur.n} title={media.name} src={media.url ?? ''} style={{ ...full, border: 0, background: '#fff' }} />;
  return <Widget key={cur.n} media={media} tz={sync.screen.timezone} api={api} skip={next} n={cur.n} />;
}

function Pairing({ onPaired }: { onPaired: (token: string) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/player/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, info: await deviceInfo() }) });
      const j = await r.json();
      if (!r.ok) setError(j.error ?? 'Não foi possível parear.'); else onPaired(j.token);
    } catch { setError('Sem conexão com o servidor.'); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} style={{ ...center, background: '#0b1120', color: '#fff' }}>
      <p style={{ fontSize: '7cqmin', fontWeight: 900 }}>Yes<span style={{ color: '#f9c21a' }}>DOOH</span> Player</p>
      <p style={{ fontSize: '3.2cqmin', opacity: 0.8, maxWidth: '80cqw' }}>Digite o código de pareamento exibido no painel, na página da tela.</p>
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} autoFocus aria-label="Código de pareamento" placeholder="ABC123" autoComplete="off"
        style={{ fontSize: '9cqmin', fontFamily: 'monospace', fontWeight: 900, letterSpacing: '.3em', textAlign: 'center', width: '7em', maxWidth: '90cqw', padding: '.2em', borderRadius: '1cqmin', border: '3px solid #f9c21a', background: '#161d2e', color: '#fff', outline: 'none' }} />
      <button disabled={busy || code.length !== 6} style={{ fontSize: '4cqmin', fontWeight: 800, padding: '.5em 1.6em', borderRadius: '1cqmin', background: '#f9c21a', color: '#0b1120', opacity: busy || code.length !== 6 ? 0.5 : 1 }}>{busy ? 'Pareando...' : 'Parear tela'}</button>
      {error && <p role="alert" style={{ fontSize: '3cqmin', color: '#fca5a5', maxWidth: '80cqw' }}>{error}</p>}
    </form>
  );
}

async function deviceInfo() {
  const ua = navigator.userAgent;
  const est = await navigator.storage?.estimate?.().catch(() => undefined);
  return {
    model: /Android[^;]*;\s*([^)]+?)\s*(Build|\))/.exec(ua)?.[1] ?? navigator.platform ?? 'Navegador',
    os: /(Android [\d.]+|Windows NT [\d.]+|Mac OS X [\d_]+|CrOS|Linux|Tizen [\d.]+|Web0S)/.exec(ua)?.[1] ?? 'Desconhecido',
    app: `${/(Chrome|Firefox|Safari|Edg)\/[\d.]+/.exec(ua)?.[0] ?? 'Navegador'} · player web 1.0`,
    resolution: `${screen.width}×${screen.height}`,
    storageUsed: est?.usage ?? 0,
  };
}

export default function Player() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [sync, setSync] = useState<Sync | null>(null);
  const [cur, setCur] = useState<Current>(null);
  const [rotate, setRotate] = useState(0);
  const [offline, setOffline] = useState(false);
  const pos = useRef({ slot: -1, n: 0, rot: {} as Record<number, number> });
  const plays = useRef<Record<string, number>>({});
  const shot = useRef<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const syncRef = useRef<Sync | null>(null);
  syncRef.current = sync;

  useEffect(() => {
    const q = new URLSearchParams(location.search).get('girar');
    if (q) localStorage.setItem(LS.rotate, q);
    setRotate(Number(localStorage.getItem(LS.rotate)) || 0);
    setToken(localStorage.getItem(LS.token));
    try { const saved = localStorage.getItem(LS.data); if (saved) setSync(JSON.parse(saved)); } catch { /* playlist salva invalida */ }
  }, []);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const r = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${localStorage.getItem(LS.token)}` } });
    if (r.status === 401) { // tela resetada no painel: volta para o pareamento
      localStorage.removeItem(LS.token); localStorage.removeItem(LS.data);
      setToken(null); setSync(null); setCur(null);
    }
    return r;
  }, []);

  const doSync = useCallback(async () => {
    try {
      const r = await api('/api/player/sync');
      if (!r.ok) return;
      const data: Sync = await r.json();
      localStorage.setItem(LS.data, JSON.stringify(data));
      setSync(data); setOffline(false);
      precache(data.slots.flat().map((m) => (m.type === 'arquivo' ? m.src : null)).filter((u): u is string => !!u));
    } catch { setOffline(true); }
  }, [api]);

  /** Escolhe o proximo conteudo valido para agora, respeitando agendamento e rodizio dos grupos. */
  const next = useCallback(() => {
    const s = syncRef.current;
    if (!s || !s.slots.length) { setCur(null); return; }
    const p = pos.current;
    for (let i = 1; i <= s.slots.length; i++) {
      const slot = (p.slot + i + s.slots.length) % s.slots.length;
      const options = s.slots[slot];
      const turn = p.rot[slot] ?? 0;
      for (let k = 0; k < options.length; k++) {
        const media = options[(turn + k) % options.length];
        if (!eligible(media, s.screen.timezone)) continue;
        p.slot = slot; p.rot[slot] = turn + k + 1; p.n++;
        if (media.storeStats) plays.current[media.id] = (plays.current[media.id] ?? 0) + 1;
        setCur({ media, n: p.n });
        return;
      }
    }
    setCur(null); // nada agendado para este horario
  }, []);

  const capture = useCallback(() => {
    const c = document.createElement('canvas');
    const el = stage.current?.querySelector('video, img') as HTMLVideoElement | HTMLImageElement | null;
    const [w, h] = syncRef.current?.screen.orientation === 'V' ? [540, 960] : [960, 540];
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = '#0b1120'; g.fillRect(0, 0, w, h);
    try {
      if (el) g.drawImage(el, 0, 0, w, h); else throw new Error('sem midia');
      shot.current = c.toDataURL('image/jpeg', 0.6);
    } catch { // conteudo externo nao pode ser copiado: registra apenas o nome do que esta no ar
      g.fillStyle = '#0b1120'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f9c21a'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
      g.fillText('No ar agora:', w / 2, h / 2 - 20);
      g.fillStyle = '#fff'; g.fillText(stage.current?.dataset.name || '—', w / 2, h / 2 + 30);
      shot.current = c.toDataURL('image/jpeg', 0.6);
    }
  }, []);

  const beat = useCallback(async () => {
    const sent = plays.current;
    plays.current = {};
    const executed: string[] = JSON.parse(localStorage.getItem(LS.executed) ?? '[]');
    try {
      const r = await api('/api/player/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plays: sent, executed, info: await deviceInfo(), screenshot: shot.current }) });
      if (!r.ok) throw new Error('falha');
      shot.current = null;
      localStorage.setItem(LS.executed, '[]');
      setOffline(false);
      const j: { version: number; commands: { id: string; type: string }[] } = await r.json();
      let reload = false, again = false;
      for (const c of j.commands) {
        if (c.type === 'recarregar') reload = true;
        if (c.type === 'limpar_cache' && 'caches' in window) await caches.delete(CACHE);
        if (c.type === 'screenshot') { capture(); again = true; }
      }
      // confirma no proximo batimento (sobrevive ao recarregamento da pagina)
      if (j.commands.length) localStorage.setItem(LS.executed, JSON.stringify(j.commands.map((c) => c.id)));
      if (reload) { location.reload(); return; }
      if (j.commands.length || j.version !== syncRef.current?.version) await doSync();
      if (again) setTimeout(beat, 1500); // envia a captura logo em seguida
    } catch {
      for (const [k, v] of Object.entries(sent)) plays.current[k] = (plays.current[k] ?? 0) + v; // guarda para reenviar
      setOffline(true);
    }
  }, [api, capture, doSync]);

  useEffect(() => {
    if (!token) return;
    doSync().then(beat);
    const hb = setInterval(beat, 60_000);
    return () => clearInterval(hb);
  }, [token, doSync, beat]);

  useEffect(() => {
    if (!token || !sync) return;
    const i = setInterval(doSync, sync.screen.updateFrequency * 60_000);
    return () => clearInterval(i);
  }, [token, sync?.screen.updateFrequency, doSync]); // eslint-disable-line react-hooks/exhaustive-deps

  // inicia (ou retoma) a reproducao quando a playlist chega ou muda
  useEffect(() => { if (sync && !cur) next(); }, [sync, cur, next]);
  useEffect(() => { if (cur) return; const t = setInterval(next, 15_000); return () => clearInterval(t); }, [cur, next]);

  const turned = rotate === 90 || rotate === 270;
  const frame: CSSProperties = {
    position: 'fixed', top: '50%', left: '50%', width: turned ? '100vh' : '100vw', height: turned ? '100vw' : '100vh', transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
    background: '#000', color: '#fff', overflow: 'hidden', containerType: 'size', display: 'flex', flexDirection: 'column', cursor: token ? 'none' : 'auto', fontFamily: 'Inter, system-ui, sans-serif',
  };
  const footer = sync?.screen.footer;

  return (
    <div style={frame}>
      {token === undefined ? null : !token ? <div style={{ position: 'relative', flex: 1 }}><Pairing onPaired={(t) => { localStorage.setItem(LS.token, t); setToken(t); }} /></div> : (
        <>
          <div ref={stage} data-name={cur?.media.name ?? ''} style={{ position: 'relative', flex: 1, minHeight: 0 }}>
            {cur && sync ? <Stage cur={cur} sync={sync} api={api} next={next} /> : (
              <div style={{ ...center, background: '#0b1120' }}>
                <p style={{ fontSize: '6cqmin', fontWeight: 900 }}>Yes<span style={{ color: '#f9c21a' }}>DOOH</span></p>
                <p style={{ fontSize: '3cqmin', opacity: 0.7 }}>{!sync ? 'Carregando programação...' : sync.slots.length ? 'Nenhum conteúdo programado para este horário.' : `${sync.screen.name}: adicione conteúdos à playlist no painel.`}</p>
              </div>
            )}
          </div>
          {footer && sync && (
            <div style={{ background: footer.bg, color: footer.color, display: 'flex', alignItems: 'center', gap: '3cqmin', padding: '1.4cqmin 3cqmin', fontSize: '3.2cqmin', fontWeight: 700 }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{footer.text}</span>
              {footer.clock && <Clock tz={sync.screen.timezone} style={{ fontVariantNumeric: 'tabular-nums' }} />}
            </div>
          )}
          {offline && <span title="Sem conexão — reproduzindo conteúdo salvo" style={{ position: 'absolute', top: '1.5cqmin', right: '1.5cqmin', width: '1.4cqmin', height: '1.4cqmin', borderRadius: '50%', background: '#ef4444', opacity: 0.8 }} />}
        </>
      )}
    </div>
  );
}
