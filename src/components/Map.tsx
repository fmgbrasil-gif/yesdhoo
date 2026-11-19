'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

export type MapPoint = { id?: string; name: string; lat: number; lng: number; online?: boolean };

/** Mapa (Leaflet + OpenStreetMap). Com `inputs`, o pino e arrastavel e grava lat/lng em campos de formulario. */
export default function Map({ points, height = 220, inputs }: { points: MapPoint[]; height?: number; inputs?: { lat: string; lng: string } }) {
  const el = useRef<HTMLDivElement>(null);
  const latRef = useRef<HTMLInputElement>(null);
  const lngRef = useRef<HTMLInputElement>(null);
  const key = JSON.stringify(points);

  useEffect(() => {
    let map: import('leaflet').Map | undefined;
    let dead = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (dead || !el.current) return;
      const pts: MapPoint[] = JSON.parse(key);
      map = L.map(el.current, { scrollWheelZoom: false }).setView(pts[0] ? [pts[0].lat, pts[0].lng] : [-15.78, -47.93], pts[0] ? 13 : 4);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(map);
      const icon = (on?: boolean) => L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;border-radius:50%;background:${on === false ? '#7384a3' : '#f0b000'};border:3px solid #0b1120;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      });
      const markers = pts.map((p) => {
        const m = L.marker([p.lat, p.lng], { icon: icon(p.online), draggable: !!inputs }).addTo(map!);
        m.bindTooltip(p.name);
        if (inputs) m.on('dragend', () => {
          const { lat, lng } = m.getLatLng();
          if (latRef.current) latRef.current.value = lat.toFixed(6);
          if (lngRef.current) lngRef.current.value = lng.toFixed(6);
        });
        return m;
      });
      if (markers.length > 1) map.fitBounds(L.featureGroup(markers).getBounds().pad(0.3));
      setTimeout(() => map?.invalidateSize(), 200);
    })();
    return () => { dead = true; map?.remove(); };
  }, [key, inputs]);

  return (
    <>
      <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-lg bg-ink-100" />
      {inputs && (
        <>
          <input ref={latRef} type="hidden" name={inputs.lat} defaultValue={points[0]?.lat} />
          <input ref={lngRef} type="hidden" name={inputs.lng} defaultValue={points[0]?.lng} />
        </>
      )}
    </>
  );
}
