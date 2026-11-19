import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { ActionForm, Field } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { login } from './actions';

export default async function LoginPage() {
  if (await getUser()) redirect('/dashboard');
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-ink-900 p-12 text-white lg:flex">
        <Logo />
        <div>
          <p className="text-4xl font-black leading-tight">Sua rede de telas,<br /><span className="text-brand-400">no ar e sob controle.</span></p>
          <p className="mt-4 max-w-md text-ink-300">Gerencie telas, playlists, anunciantes e comprovação de exibição de mídia indoor em um só lugar.</p>
        </div>
        <p className="text-xs text-ink-400">Digital Out-of-Home · gestão de mídia indoor</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 inline-block rounded-xl bg-ink-900 p-3 lg:hidden"><Logo /></div>
          <h1 className="mb-1">Entrar</h1>
          <p className="mb-6 text-sm text-ink-400">Acesse o painel com seu e-mail e senha.</p>
          <ActionForm action={login} submit="Entrar" submitClass="btn-primary w-full">
            <Field label="E-mail"><input name="email" type="email" required autoComplete="email" className="input" placeholder="voce@empresa.com.br" /></Field>
            <Field label="Senha"><input name="password" type="password" required autoComplete="current-password" className="input" placeholder="••••••••" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remember" className="h-4 w-4 accent-amber-500" /> Manter conectado</label>
          </ActionForm>
        </div>
      </section>
    </main>
  );
}
