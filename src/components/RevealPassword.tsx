'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { revealSigningPassword } from '@/app/(painel)/plataforma/chave/actions';
import { CopyButton } from './CopyButton';

/** Mostra a senha da chave so quando o administrador pede (nao vem na pagina). */
export function RevealPassword() {
  const [pw, setPw] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (pw) return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="select-all rounded bg-ink-50 px-2 py-1 font-mono text-sm dark:bg-ink-900">{pw}</code>
      <CopyButton text={pw} label="Copiar senha" />
      <button type="button" className="btn-ghost" onClick={() => setPw(null)}><EyeOff size={15} /> Esconder</button>
    </div>
  );
  return (
    <div>
      <button type="button" className="btn-ghost" disabled={busy} onClick={async () => { setBusy(true); setErr(''); const r = await revealSigningPassword(); setBusy(false); if (r.ok) setPw(r.password); else setErr(r.error); }}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Mostrar senha
      </button>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
