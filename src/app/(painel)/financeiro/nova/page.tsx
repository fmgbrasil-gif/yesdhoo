import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { localDate } from '@/lib/util';
import { PageHeader } from '@/components/basic';
import { ChargeWizard } from '@/components/ChargeWizard';
import { aiConfigured } from '@/lib/ai-contract';

// a etapa do contrato com IA pode levar ate ~2 minutos
export const maxDuration = 300;

export default async function NovaCobrancaPage() {
  const user = await requireAdmin();
  const [clients, services] = await Promise.all([
    db.client.findMany({ where: { tenantId: user.tenantId, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, kind: true } }),
    db.service.findMany({ where: { tenantId: user.tenantId }, orderBy: { name: 'asc' }, select: { id: true, name: true, unit: true, priceCents: true } }),
  ]);
  return (
    <>
      <PageHeader title="Nova cobrança" crumbs={[{ label: 'Financeiro', href: '/financeiro' }, { label: 'Nova cobrança' }]} />
      <ChargeWizard clients={clients} services={services} today={localDate()} hasAi={aiConfigured()} />
    </>
  );
}
