'use client';

import { ActionForm, type FormAction } from './ui';

export function Notes({ action, defaultValue, id }: { action: FormAction; defaultValue: string; id?: string }) {
  return (
    <div className="card p-5">
      <h2 className="mb-3 font-bold">Anotações</h2>
      <ActionForm action={action} submit="Salvar anotações" submitClass="btn-dark" className="space-y-3">
        {id && <input type="hidden" name="id" value={id} />}
        <textarea name="notes" defaultValue={defaultValue} rows={5} className="input" placeholder="Use para qualquer anotação útil..." aria-label="Anotações" />
      </ActionForm>
    </div>
  );
}
