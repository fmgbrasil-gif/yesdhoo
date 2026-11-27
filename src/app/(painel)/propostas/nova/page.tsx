import { requireAdmin } from '@/lib/auth';
import { networkStats } from '@/lib/proposal';
import { PageHeader } from '@/components/basic';
import { ActionForm } from '@/components/ui';
import { ProposalFields } from '@/components/ProposalForm';
import { saveProposal } from '../actions';
import { openaiKey } from '@/lib/ai-contract';

export default async function NovaPropostaPage() {
  const user = await requireAdmin();
  const net = await networkStats(user.tenantId);
  return (
    <>
      <PageHeader title="Nova proposta" crumbs={[{ label: 'Propostas', href: '/propostas' }, { label: 'Nova' }]} />
      <div className="card max-w-3xl p-5"><ActionForm action={saveProposal} submit="Criar proposta"><ProposalFields net={net} hasAi={!!openaiKey(user.tenant)} /></ActionForm></div>
    </>
  );
}
