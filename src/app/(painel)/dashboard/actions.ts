'use server';

import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import type { ActionResult } from '@/components/ui';

export async function saveUserNotes(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { notes: String(fd.get('notes') ?? '') } });
  return { ok: true, message: 'Anotações salvas.' };
}
