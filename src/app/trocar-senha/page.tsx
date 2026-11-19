import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { ActionForm, Field } from '@/components/ui';
import { changeFirstPassword, logout } from '../login/actions';

export default async function TrocarSenhaPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  if (!user.mustChangePassword) redirect('/dashboard');
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-1">Crie sua senha</h1>
        <p className="mb-5 text-sm text-ink-400">Olá, {user.name}. Você entrou com uma senha provisória. Defina uma senha só sua para continuar.</p>
        <ActionForm action={changeFirstPassword} submit="Salvar e entrar" submitClass="btn-primary w-full">
          <Field label="Nova senha" hint="Ao menos 8 caracteres, com letras e números"><input name="password" type="password" required minLength={8} autoComplete="new-password" className="input" /></Field>
          <Field label="Confirmar nova senha"><input name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input" /></Field>
        </ActionForm>
        <form action={logout} className="mt-4 text-center"><button className="text-sm text-ink-400 underline">Sair</button></form>
      </div>
    </main>
  );
}
