import { requireUser } from '@/lib/auth';
import { TIMEZONES } from '@/lib/constants';
import { PageHeader } from '@/components/basic';
import { ActionForm, Field } from '@/components/ui';
import { saveAccount } from '../usuarios/actions';

export default async function ContaPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Minha conta" crumbs={[{ label: 'Minha conta' }]} />
      <div className="card max-w-xl p-5">
        <ActionForm action={saveAccount}>
          <Field label="Foto"><input type="file" name="image" accept="image/*" className="input" /></Field>
          <Field label="Nome"><input name="name" required defaultValue={user.name} className="input" /></Field>
          <Field label="E-mail" hint="Para trocar o e-mail, peça a um administrador."><input value={user.email} disabled readOnly className="input opacity-60" /></Field>
          <Field label="Fuso horário"><select name="timezone" defaultValue={user.timezone} className="input">{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3 border-t border-ink-100 pt-4 dark:border-ink-700">
            <Field label="Senha atual"><input name="current" type="password" autoComplete="current-password" className="input" /></Field>
            <Field label="Nova senha" hint="Deixe em branco para manter"><input name="password" type="password" minLength={8} autoComplete="new-password" className="input" /></Field>
          </div>
        </ActionForm>
      </div>
    </>
  );
}
