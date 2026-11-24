import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { SPEC_GROUPS, SPEC_TIPS } from '@/lib/media-specs';
import { ShareSpecs } from '@/components/ShareSpecs';

export const metadata: Metadata = { title: 'Especificações de mídia — Yes Mídia Indoor', description: 'Formato, resolução, duração e tamanho dos vídeos e imagens para as telas da Yes.' };

/** Pagina publica com as especificacoes de video e imagem, para enviar a clientes e parceiros. */
export default async function EspecificacoesPage() {
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  return (
    <main className="min-h-screen bg-[#f6f3fb] px-4 py-8 text-[#1d1029]">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center gap-3">
          <img src="/brand/yes.png" alt="Yes" className="h-12 w-auto" />{/* eslint-disable-line @next/next/no-img-element */}
          <div><h1 className="text-2xl font-black">Especificações de mídia</h1><p className="text-sm text-gray-500">Como preparar vídeos e imagens para as telas da Yes</p></div>
        </header>
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-black/5"><div className="mx-auto mb-2 h-9 w-16 rounded border-2 border-[#7f4be4]" /><p className="font-bold">Horizontal</p><p className="text-sm text-gray-600">1920 × 1080 px · 16:9</p></div>
          <div className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-black/5"><div className="mx-auto mb-2 h-16 w-9 rounded border-2 border-[#7f4be4]" /><p className="font-bold">Vertical</p><p className="text-sm text-gray-600">1080 × 1920 px · 9:16</p></div>
        </section>
        {SPEC_GROUPS.map((g) => (
          <section key={g.title} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <h2 className="bg-[#2a1240] px-4 py-2 font-bold text-white">{g.title}</h2>
            <dl className="divide-y divide-gray-100">
              {g.items.map(([k, v]) => (
                <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr]"><dt className="text-sm font-semibold text-gray-500">{k}</dt><dd className="text-sm">{v}</dd></div>
              ))}
            </dl>
          </section>
        ))}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <h2 className="mb-2 font-bold">Dicas importantes</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-gray-700">{SPEC_TIPS.map((t) => <li key={t}>{t}</li>)}</ul>
        </section>
        <ShareSpecs link={`${origin}/especificacoes`} />
      </div>
    </main>
  );
}
