import { Pencil, Plus } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { fileUrl } from '@/lib/storage';
import { TIMEZONES } from '@/lib/constants';
import { timeAgo } from '@/lib/util';
import { Avatar, PageHeader } from '@/components/basic';
import { ActionForm, Field, Modal, MultiPicker, Toggle } from '@/components/ui';
import { saveUser } from './actions';

type U = { id: string; name: string; email: string; timezone: string; role: string; active: boolean; restricted: boolean; screens: { screenId: string }[] };

function UserFields({ u, screens, self }: { u?: U; screens: { id: string; label: string }[]; self?: boolean }) {
  return (
    <>
      {u && <input type="hidden" name="id" value={u.id} />}
      <Field label="Imagem"><input type="file" name="image" accept="image/*" className="input" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome"><input name="name" required defaultValue={u?.name} className="input" placeholder="Ex.: João Barros" /></Field>
        <Field label="E-mail"><input name="email" type="email" required defaultValue={u?.email} className="input" /></Field>
        <Field label={u ? 'Nova senha' : 'Senha'} hint={u ? 'Em branco = não alterar. Se preencher, a pessoa troca no próximo acesso.' : 'Provisória: a pessoa cria a própria no primeiro acesso'}><input name="password" type="password" minLength={8} required={!u} autoComplete="new-password" className="input" /></Field>
        {!u && <Field label="Confirmar senha"><input name="passwordConfirm" type="password" required autoComplete="new-password" className="input" /></Field>}
        <Field label="Fuso horário"><select name="timezone" defaultValue={u?.timezone ?? 'America/Sao_Paulo'} className="input">{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        {!self && <Field label="Perfil"><select name="role" defaultValue={u?.role ?? 'operador'} className="input"><option value="operador">Operador</option><option value="admin">Administrador</option></select></Field>}
      </div>
      <Field label="Permissão de telas" hint="Sem nenhuma marcada, o usuário enxerga todas as telas."><span /></Field>
      <MultiPicker name="screens" options={screens} defaultValue={u?.screens.map((s) => s.screenId)} placeholder="Busque pelo nome da tela..." />
      <Toggle name="restricted" label="Restringir conteúdos" hint="Restringe o acesso a conteúdos privados" defaultChecked={u?.restricted} />
      {!self && <Toggle name="active" label="Usuário ativo" hint="Usuários inativos não conseguem entrar" defaultChecked={u?.active ?? true} />}
    </>
  );
}

export default async function UsuariosPage() {
  const admin = await requireAdmin();
  const [users, screens] = await Promise.all([
    db.user.findMany({ where: { tenantId: admin.tenantId }, orderBy: { createdAt: 'asc' }, include: { screens: { select: { screenId: true } } } }),
    db.screen.findMany({ where: { tenantId: admin.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const opts = screens.map((s) => ({ id: s.id, label: s.name }));
  return (
    <>
      <PageHeader title="Usuários" crumbs={[{ label: 'Usuários' }]}>
        <Modal trigger={<><Plus size={16} /> Novo usuário</>} title="Novo usuário"><ActionForm action={saveUser}><UserFields screens={opts} /></ActionForm></Modal>
      </PageHeader>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead className="border-b border-ink-100 dark:border-ink-700"><tr><th className="th">Usuário</th><th className="th">Perfil</th><th className="th">Telas</th><th className="th">Último acesso</th><th className="th">Status</th><th className="th text-right">Ações</th></tr></thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="td"><span className="flex items-center gap-3"><Avatar src={fileUrl(u.image)} name={u.name} /><span><span className="block font-semibold">{u.name}</span><span className="text-xs text-ink-400">{u.email}</span></span></span></td>
                <td className="td">{u.role === 'admin' ? 'Administrador' : 'Operador'}</td>
                <td className="td text-ink-500">{u.screens.length ? `${u.screens.length} tela(s)` : 'Todas'}</td>
                <td className="td text-ink-500">{timeAgo(u.lastLoginAt)}{u.mustChangePassword && <span className="block text-xs text-brand-700">senha provisória</span>}</td>
                <td className="td"><span className={`badge ${u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-500'}`}>{u.active ? 'Ativo' : 'Inativo'}</span></td>
                <td className="td text-right"><Modal trigger={<Pencil size={15} />} triggerClass="btn-icon" titleAttr="Editar" title="Editar usuário"><ActionForm action={saveUser}><UserFields u={u} screens={opts} self={u.id === admin.id} /></ActionForm></Modal></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
