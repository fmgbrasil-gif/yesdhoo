'use client';

import { useState } from 'react';

/** Campo de fotos que reduz cada imagem (max. 1600 px, JPEG) no navegador antes de enviar, para caber no limite do servidor. */
export function PhotoInput({ name, max = 4, size = 1600, multiple = true, png = false }: { name: string; max?: number; size?: number; multiple?: boolean; png?: boolean }) {
  const [info, setInfo] = useState('');
  const shrink = (file: File) => new Promise<File>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, size / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => resolve(b ? new File([b], file.name.replace(/\.\w+$/, '') + (png ? '.png' : '.jpg'), { type: png ? 'image/png' : 'image/jpeg' }) : file), png ? 'image/png' : 'image/jpeg', 0.82);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = [...(input.files ?? [])].slice(0, max);
    if (!files.length) { setInfo(''); return; }
    setInfo('Preparando as fotos...');
    const out = await Promise.all(files.map(shrink));
    const dt = new DataTransfer();
    out.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    const kb = Math.round(out.reduce((a, f) => a + f.size, 0) / 1024);
    setInfo(`${out.length} foto(s) pronta(s) para enviar (${kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB'}).`);
  };
  return (
    <div className="space-y-1">
      <input type="file" name={name} accept="image/*" multiple={multiple} className="input" onChange={onChange} />
      {info && <p className="text-xs text-ink-400">{info}</p>}
    </div>
  );
}
