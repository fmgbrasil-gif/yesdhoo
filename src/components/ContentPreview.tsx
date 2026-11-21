'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronRight, Eye, Maximize2, RotateCcw } from 'lucide-react';
import { Widget } from '@/app/player/Player';
import type { PlayerMedia } from '@/lib/playables';
import { youtubeId } from '@/lib/util';
import { Modal } from './ui';

const api = (p: string) => fetch(p.replace('/api/player/widget', '/api/preview/widget'));

/** Desenha o conteudo como a TV desenha, num quadro do tamanho escolhido. */
function Screen({ media, vertical, n, onEmpty }: { media: PlayerMedia; vertical: boolean; n: number; onEmpty: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const unit = { '--u': `${Math.min(size.w, size.h) / 100}px`, '--uw': `${size.w / 100}px`, '--uh': `${size.h / 100}px` } as CSSProperties;
  const full: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' };
  const yt = media.type === 'youtube' ? youtubeId(media.url ?? '') : null;
  return (
    <div ref={box} data-preview className={`relative mx-auto overflow-hidden rounded-lg bg-black shadow-lg ring-1 ring-black/10 ${vertical ? 'aspect-[9/16] h-[65vh] max-w-full' : 'aspect-video w-full'}`} style={unit}>
      {size.w > 0 && (
        media.type === 'arquivo' ? (media.src ? (media.kind === 'video' ? <video src={media.src} style={full} autoPlay muted loop playsInline /> : <img src={media.src} alt={media.name} style={full} />) : <p className="absolute inset-0 grid place-items-center text-sm text-white/70">Sem arquivo para esta orientação</p>) /* eslint-disable-line @next/next/no-img-element */
        : yt ? <iframe src={`https://www.youtube.com/embed/${yt}?autoplay=1&mute=1`} title={media.name} style={{ ...full, border: 0 }} allow="autoplay" />
        : media.type === 'link' ? <iframe src={media.url ?? ''} title={media.name} style={{ ...full, border: 0, background: '#fff' }} />
        : <Widget key={`${media.id}-${n}`} media={media} tz="America/Sao_Paulo" api={api} skip={onEmpty} n={n} />
      )}
    </div>
  );
}

/** Botao "Visualizar": abre a previa do conteudo como ele aparece na tela (horizontal ou vertical). */
export function ContentPreview({ h, v }: { h: PlayerMedia; v: PlayerMedia }) {
  const [vertical, setVertical] = useState(false);
  const [n, setN] = useState(0);
  const [empty, setEmpty] = useState(false);
  const media = vertical ? v : h;
  const onEmpty = useCallback(() => setEmpty(true), []);
  const fullscreen = () => (document.querySelector('[role=dialog] [data-preview]') as HTMLElement | null)?.requestFullscreen?.().catch(() => {});
  return (
    <Modal trigger={<><Eye size={15} /> Visualizar</>} triggerClass="btn-ghost shrink-0" titleAttr="Visualizar" title={`Prévia — ${h.name}`} wide>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-lg bg-ink-100 p-1 dark:bg-ink-900" role="radiogroup" aria-label="Orientação da tela">
            {[['Horizontal', false], ['Vertical', true]].map(([l, val]) => (
              <button key={String(l)} type="button" role="radio" aria-checked={vertical === val} onClick={() => { setVertical(val as boolean); setEmpty(false); }}
                className={`rounded-md px-3 py-1 text-sm font-semibold ${vertical === val ? 'bg-white shadow-sm dark:bg-ink-700' : 'text-ink-500'}`}>{String(l)}</button>
            ))}
          </div>
          <div className="flex gap-2">
            {h.type === 'rss' && <button type="button" className="btn-ghost" onClick={() => { setN(n + 1); setEmpty(false); }}><ChevronRight size={15} /> Próxima manchete</button>}
            {h.type !== 'rss' && <button type="button" className="btn-ghost" onClick={() => { setN(n + 1); setEmpty(false); }}><RotateCcw size={15} /> Recarregar</button>}
            <button type="button" className="btn-ghost" onClick={fullscreen}><Maximize2 size={15} /> Tela cheia</button>
          </div>
        </div>
        {empty
          ? <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">{h.type === 'clima' ? 'Sem previsão do tempo para mostrar: marque a localização de uma tela no mapa (em Minhas telas). Na TV, o clima usa o local de cada tela.' : 'A fonte deste conteúdo não respondeu agora. Na TV, ele é pulado até voltar.'}</p>
          : <Screen key={`${vertical}-${n}`} media={media} vertical={vertical} n={n} onEmpty={onEmpty} />}
        <p className="text-xs text-ink-400">É assim que o conteúdo aparece na tela, durante {h.duration} segundos por passagem.{h.type === 'clima' ? ' O clima mostrado é o do local da primeira tela com mapa.' : ''}</p>
      </div>
    </Modal>
  );
}
