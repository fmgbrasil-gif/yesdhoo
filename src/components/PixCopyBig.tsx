'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Copia o texto mesmo em navegadores sem a API de area de transferencia (ex.: navegador interno de apps). */
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* tenta o metodo antigo */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

/** Botao grande "Copiar codigo Pix" da pagina de pagamento (pensado para celular). */
export function PixCopyBig({ code }: { code: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  return (
    <div className="space-y-3">
      <button type="button" onClick={async () => setState((await copyText(code)) ? 'ok' : 'fail')}
        className={`flex w-full items-center justify-center gap-3 rounded-2xl px-6 py-5 text-lg font-bold text-white shadow-lg transition active:scale-[0.98] ${state === 'ok' ? 'bg-emerald-600' : 'bg-[#2a1240] hover:bg-[#3b1a5a]'}`}>
        {state === 'ok' ? <><Check size={24} /> Código copiado!</> : <><Copy size={24} /> Copiar código Pix</>}
      </button>
      {state === 'ok' && <p className="rounded-xl bg-emerald-50 p-3 text-center text-sm text-emerald-800">Agora abra o app do seu banco, entre em <b>Pix → Pix Copia e Cola</b> e cole o código.</p>}
      {state === 'fail' && <p className="rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-800">Não foi possível copiar automaticamente. Segure o dedo sobre o código abaixo e escolha <b>Copiar</b>.</p>}
    </div>
  );
}
