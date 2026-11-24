import type { Metadata } from 'next';
import { headers } from 'next/headers';
import QRCode from 'qrcode';

export const metadata: Metadata = { title: 'Instalar o Yes DOOH Player', description: 'Baixe o aplicativo para TV box, Android TV e Fire TV.' };

/** Pagina publica de download do app Android (TV box), com QR Code e passo a passo. */
export default async function AppPage() {
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const apk = `${origin}/download/YesDoohPlayer.apk`;
  const qr = await QRCode.toDataURL(apk, { margin: 1, width: 320 });
  const steps = [
    ['Baixe o app', 'No TV box, abra o navegador e acesse este endereço, ou leia o QR Code com o celular e passe o arquivo para o box por pendrive.'],
    ['Permita a instalação', 'Ao abrir o arquivo, o Android pede para permitir “fontes desconhecidas” (ou “instalar apps desconhecidos”) para o navegador ou gerenciador de arquivos. Permita e instale.'],
    ['Abra o Yes DOOH Player', 'O endereço do servidor já vem preenchido (yesdooh.vercel.app). Toque em Salvar.'],
    ['Pareie a tela', 'No painel, entre em Minhas telas → abra a tela (ou crie em “Nova tela”) e veja o código de pareamento. Digite esse código na TV, com o controle. Em segundos a programação começa a rodar.'],
    ['Atualizar o app depois', 'A partir da versão 1.5, abra o menu do app (tecla MENU ou VOLTAR cinco vezes) e escolha “Atualizar versão”: o app baixa a versão nova e abre o instalador. Ele também avisa sozinho quando houver versão nova. A partir da 1.6 o app usa a assinatura definitiva da Yes: quem está na 1.5 ou anterior precisa desinstalar o app antigo uma única vez, instalar a versão atual pelo link acima e parear a tela de novo. Daí em diante, as atualizações instalam por cima.'],
    ['Abrir sozinho ao ligar o box', 'Na primeira abertura, o app pede uma liberação do Android. Escolha “Tela inicial” (recomendado: o box liga direto no player) ou “Sobrepor apps” e ative para o Yes DOOH Player. Sem isso, no Android 10 ou mais novo o box fica parado na tela dele depois de reiniciar. Para conferir depois: menu do app (tecla MENU ou VOLTAR cinco vezes) → “Abrir ao ligar o aparelho”.'],
  ];
  return (
    <main className="min-h-screen bg-[#f6f3fb] px-4 py-8 text-[#1d1029]">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center gap-3">
          <img src="/brand/yes.png" alt="Yes" className="h-12 w-auto" />{/* eslint-disable-line @next/next/no-img-element */}
          <div><h1 className="text-2xl font-black">Yes DOOH Player</h1><p className="text-sm text-gray-500">App para TV box, Android TV e Fire TV · Android 5.0 ou superior · versão 1.7</p></div>
        </header>
        <section className="flex flex-wrap items-center gap-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <img src={qr} alt="QR Code para baixar o app" className="h-40 w-40" />{/* eslint-disable-line @next/next/no-img-element */}
          <div className="min-w-0 flex-1 space-y-3">
            <a href="/download/YesDoohPlayer.apk" download className="inline-flex items-center justify-center rounded-2xl bg-[#2a1240] px-6 py-4 text-lg font-bold text-white shadow hover:bg-[#3b1a5a]">Baixar o app (APK)</a>
            <p className="break-all text-xs text-gray-500">{apk}</p>
          </div>
        </section>
        <ol className="space-y-3">
          {steps.map(([t, d], i) => (
            <li key={t} className="flex gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7f4be4] font-bold text-white">{i + 1}</span>
              <div><p className="font-bold">{t}</p><p className="text-sm text-gray-600">{d}</p></div>
            </li>
          ))}
        </ol>
        <p className="text-center text-xs text-gray-400">Sem TV box? Para testar, abra <b>{origin}/player</b> em qualquer navegador (computador ou celular) e use o mesmo código de pareamento.</p>
      </div>
    </main>
  );
}
