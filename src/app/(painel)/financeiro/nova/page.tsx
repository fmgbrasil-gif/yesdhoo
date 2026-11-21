import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { localDate } from '@/lib/util';
import { PageHeader } from '@/components/basic';
import { ChargeWizard } from '@/components/ChargeWizard';
import { openaiKey } from '@/lib/ai-contract';
import { screenOptions } from '@/lib/operations';

// a leitura dos documentos do cliente com IA pode levar ate ~2 minutos
export const maxDuration = 300;

export default async function NovaCobrancaPage() {
  const user = await requireAdmin();
  const [clients, services, ops, screens] = await Promise.all([
    db.client.findMany({ where: { tenantId: user.tenantId, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, kind: true } }),
    db.service.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true, unit: true, priceCents: true } }),
    db.operation.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true, screens: { select: { id: true } } } }),
    screenOptions(user.tenantId),
  ]);
  return (
    <>
      <PageHeader title="Nova cobrança" crumbs={[{ label: 'Financeiro', href: '/financeiro' }, { label: 'Nova cobrança' }]} />
      <ChargeWizard clients={clients} services={services} operations={ops.map((o) => ({ id: o.id, name: o.name, screenIds: o.screens.map((s) => s.id) }))} screens={screens} today={localDate()} hasAi={!!openaiKey(user.tenant)} />
    </>
  );
}
