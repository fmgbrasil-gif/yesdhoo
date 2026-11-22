/** Periodo de consulta pelos parametros ?mes=AAAA-MM | ?mes=todos | ?de=&ate= (padrao: mes atual). */
export function resolvePeriod(sp: Record<string, string | undefined>, today: string) {
  const D = /^\d{4}-\d{2}-\d{2}$/;
  const month = today.slice(0, 7);
  const all = sp.mes === 'todos';
  const custom = !all && (D.test(sp.de ?? '') || D.test(sp.ate ?? ''));
  const mes = !all && !custom && /^\d{4}-\d{2}$/.test(sp.mes ?? '') ? sp.mes! : month;
  const lastDay = (ym: string) => `${ym}-${String(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()).padStart(2, '0')}`;
  const de = all ? null : custom ? (D.test(sp.de ?? '') ? sp.de! : '2000-01-01') : `${mes}-01`;
  const ate = all ? null : custom ? (D.test(sp.ate ?? '') ? sp.ate! : '2100-12-31') : lastDay(mes);
  const params: Record<string, string> = all ? { mes: 'todos' } : custom ? { ...(sp.de ? { de: sp.de } : {}), ...(sp.ate ? { ate: sp.ate } : {}) } : mes === month ? {} : { mes };
  const paidAt = de && ate ? { gte: new Date(`${de}T00:00:00-03:00`), lte: new Date(`${ate}T23:59:59-03:00`) } : undefined;
  return { all, custom, mes, month, de, ate, params, paidAt };
}
export type Period = ReturnType<typeof resolvePeriod>;

/** Monta o link mantendo o periodo e trocando/adicionando parametros. */
export function periodHref(base: string, p: Period, extra: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...p.params, ...extra })) if (v) q.set(k, v);
  const t = q.toString();
  return t ? `${base}?${t}` : base;
}
