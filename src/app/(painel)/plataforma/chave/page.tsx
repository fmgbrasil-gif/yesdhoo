import { Download, KeyRound, ShieldCheck, Upload } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/basic';
import { ActionForm, Field, Modal } from '@/components/ui';
import { RevealPassword } from '@/components/RevealPassword';
import { saveSigningKey } from './actions';

export const metadata = { title: 'Chave do app Android' };

export default async function ChavePage() {
  await requireSuperAdmin();
  const k = await db.signingKey.findUnique({ where: { name: 'android' }, select: { alias: true, fileName: true, sha256: true, validUntil: true, notes: true, createdAt: true, updatedAt: true } });
  const ownSecret = !!process.env.SIGNING_KEY_SECRET;
  return (
    <>
      <PageHeader title="Chave do app Android" crumbs={[{ label: 'Plataforma', href: '/plataforma' }, { label: 'Chave do app Android' }]}>
        <Modal trigger={<><Upload size={16} /> {k ? 'Substituir chave' : 'Guardar chave'}</>} triggerClass="btn-ghost" title="Guardar chave do app">
          <ActionForm action={saveSigningKey} submit="Guardar">
            <Field label="Arquivo da chave (.jks ou .p12)"><input type="file" name="file" required accept=".jks,.p12,.keystore,application/octet-stream" className="input" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Alias"><input name="alias" required defaultValue={k?.alias ?? 'yesdooh'} className="input" /></Field>
              <Field label="Senha"><input name="password" type="password" required autoComplete="new-password" className="input" /></Field>
              <Field label="Impressão digital SHA-256 (opcional)"><input name="sha256" className="input" /></Field>
              <Field label="Válida até (opcional)"><input name="validUntil" className="input" /></Field>
            </div>
            <label className="flex items-start gap-2 text-sm text-red-700"><input type="checkbox" name="confirm" className="mt-0.5 h-4 w-4" /> Entendo que, com outra chave, os aparelhos já instalados não atualizam por cima: será preciso desinstalar e instalar de novo.</label>
          </ActionForm>
        </Modal>
      </PageHeader>

      <div className="grid max-w-4xl gap-5">
        <section className="card p-5">
          <h2 className="mb-1 flex items-center gap-2 font-bold"><KeyRound size={18} /> Chave de assinatura do Yes DOOH Player</h2>
          <p className="mb-4 text-sm text-ink-500">Todo APK do app precisa ser assinado com esta chave. Com ela, as atualizações instalam por cima (pelo menu “Atualizar versão” do app) sem perder o pareamento. <b>Se esta chave se perder, os aparelhos instalados não aceitam mais atualizações</b> — guarde também uma cópia fora do sistema.</p>
          {!k ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Nenhuma chave guardada ainda.</p> : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="label">Arquivo</dt><dd className="font-mono">{k.fileName}</dd></div>
              <div><dt className="label">Alias</dt><dd className="font-mono">{k.alias}</dd></div>
              <div className="sm:col-span-2"><dt className="label">Impressão digital do certificado (SHA-256)</dt><dd className="break-all font-mono text-xs">{k.sha256}</dd></div>
              <div><dt className="label">Válida até</dt><dd>{k.validUntil ?? '—'}</dd></div>
              <div><dt className="label">Guardada em</dt><dd>{k.updatedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</dd></div>
              {k.notes && <div className="sm:col-span-2"><dt className="label">Observações</dt><dd className="whitespace-pre-wrap">{k.notes}</dd></div>}
              <div className="sm:col-span-2 flex flex-wrap items-start gap-3 border-t border-ink-100 pt-3 dark:border-ink-700">
                <a href="/plataforma/chave/arquivo" className="btn-dark"><Download size={15} /> Baixar arquivo da chave</a>
                <RevealPassword />
              </div>
            </dl>
          )}
        </section>
        <section className="card space-y-2 p-5 text-sm">
          <h2 className="flex items-center gap-2 font-bold"><ShieldCheck size={18} /> Segurança</h2>
          <p className="text-ink-500">O arquivo e a senha ficam <b>criptografados</b> no banco{ownSecret ? ' com um segredo próprio (SIGNING_KEY_SECRET), guardado só nas configurações do servidor' : ''}. Só o administrador da plataforma vê esta página; a senha aparece apenas quando você clica em “Mostrar senha”.</p>
          <p className="text-ink-500">Para compilar uma versão nova do app, quem for compilar precisa do arquivo, do alias e da senha (instruções em <code>android/README.md</code>).</p>
        </section>
      </div>
    </>
  );
}
