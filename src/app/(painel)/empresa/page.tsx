import { headers } from 'next/headers';
import { Building2, Landmark, QrCode, Sparkles } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { fileUrl } from '@/lib/storage';
import { decrypt, mask } from '@/lib/crypto';
import { PageHeader } from '@/components/basic';
import { ActionForm, Field } from '@/components/ui';
import { CopyButton } from '@/components/CopyButton';
import { rotateWebhookToken, saveAi, saveBank, saveCompany, savePix } from './actions';
import { CnpjLookup } from '@/components/CnpjLookup';
import { STATES } from '@/lib/constants';

export default async function EmpresaPage() {
  const user = await requireAdmin();
  const t = user.tenant;
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const webhookUrl = `${origin}/api/webhooks/asaas/${t.id}`;
  const connected = t.bankProvider === 'asaas' && !!t.bankApiKey;
  const loginLink = t.slug ? `${origin}/login?empresa=${t.slug}` : null;

  return (
    <>
      <PageHeader title="Minha empresa" crumbs={[{ label: 'Minha empresa' }]} />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 font-bold"><Building2 size={18} /> Dados e identidade visual</h2>
          <ActionForm action={saveCompany}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="CNPJ" hint="Busca razão social, endereço e contato na Receita" className="sm:col-span-2"><CnpjLookup defaultValue={t.document} /></Field>
              <Field label="Razão social" className="sm:col-span-2"><input name="name" required defaultValue={t.name} className="input" /></Field>
              <Field label="Nome fantasia"><input name="tradeName" defaultValue={t.tradeName ?? ''} className="input" /></Field>
              <Field label="Inscrição estadual"><input name="stateRegistration" defaultValue={t.stateRegistration ?? ''} className="input" /></Field>
              <Field label="E-mail"><input name="email" type="email" defaultValue={t.email ?? ''} className="input" /></Field>
              <Field label="Telefone"><input name="phone" defaultValue={t.phone ?? ''} className="input" /></Field>
            </div>
            <div className="grid grid-cols-6 gap-3">
              <Field label="Endereço" className="col-span-4"><input name="road" defaultValue={t.road ?? ''} className="input" /></Field>
              <Field label="Número" className="col-span-2"><input name="number" defaultValue={t.number ?? ''} className="input" /></Field>
              <Field label="Complemento" className="col-span-3"><input name="complement" defaultValue={t.complement ?? ''} className="input" /></Field>
              <Field label="Bairro" className="col-span-3"><input name="neighborhood" defaultValue={t.neighborhood ?? ''} className="input" /></Field>
              <Field label="CEP" className="col-span-2"><input name="zipcode" defaultValue={t.zipcode ?? ''} className="input" /></Field>
              <Field label="Cidade" className="col-span-3"><input name="city" defaultValue={t.city ?? ''} className="input" /></Field>
              <Field label="UF" className="col-span-1"><select name="state" defaultValue={t.state ?? ''} className="input"><option value="">—</option>{STATES.map((uf) => <option key={uf}>{uf}</option>)}</select></Field>
            </div>
            <Field label="Cor da marca" hint="Usada nos botões, no menu e nas faturas"><input type="color" name="color" defaultValue={t.color} className="h-10 w-32 rounded-lg" /></Field>
            <div className="flex items-center gap-4">
              {t.logo && <img src={fileUrl(t.logo)!} alt="Logo atual" className="h-16 w-16 rounded-lg bg-ink-100 object-contain p-1" />}{/* eslint-disable-line @next/next/no-img-element */}
              <Field label="Logo" hint="PNG, JPG ou WEBP de até 2 MB. Quadrada fica melhor." className="flex-1"><input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="input" /></Field>
            </div>
            {t.logo && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removeLogo" className="h-4 w-4" /> Remover logo</label>}
          </ActionForm>
          {loginLink && (
            <div className="mt-5 rounded-lg bg-ink-50 p-3 text-sm dark:bg-ink-900">
              <p className="mb-1 font-semibold">Endereço de acesso da sua equipe</p>
              <p className="break-all font-mono text-xs">{loginLink}</p>
              <p className="mt-1 text-xs text-ink-400">A tela de entrada mostra a sua logo.</p>
            </div>
          )}
        </section>

        <section className="card p-5" id="cobranca">
          <h2 className="mb-1 flex items-center gap-2 font-bold"><QrCode size={18} /> Recebimento por Pix</h2>
          <p className="mb-4 text-sm text-ink-500">Com a chave Pix, toda fatura sai com QR Code e Pix Copia e Cola no valor exato. Funciona com qualquer banco. A baixa é manual (ou automática, se conectar o banco abaixo).</p>
          <ActionForm action={savePix}>
            <Field label="Chave Pix" hint="CPF ou CNPJ só com números, e-mail, telefone (+5516999999999) ou chave aleatória"><input name="pixKey" defaultValue={t.pixKey ?? ''} className="input" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome do recebedor" hint="Como aparece no app do banco"><input name="pixName" maxLength={25} defaultValue={t.pixName ?? t.name} className="input" /></Field>
              <Field label="Cidade"><input name="pixCity" maxLength={15} defaultValue={t.pixCity ?? ''} className="input" /></Field>
            </div>
            <p className="pt-2 text-sm font-semibold">Modelo da fatura</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Título da fatura"><input name="invoiceTitle" defaultValue={t.invoiceTitle} className="input" /></Field>
              <Field label="Natureza da operação"><input name="invoiceNature" defaultValue={t.invoiceNature} className="input" /></Field>
            </div>
            <Field label="Informações fiscais" hint="Aparece no rodapé, ao lado do total. Confirme o texto com seu contador."><textarea name="invoiceFiscal" rows={2} defaultValue={t.invoiceFiscal} className="input" /></Field>
            <Field label="Dados adicionais padrão" hint="Ex.: dados para transferência, contato do financeiro"><textarea name="invoiceNotes" rows={2} defaultValue={t.invoiceNotes} className="input" /></Field>
          </ActionForm>
        </section>

        <section id="ia" className="card scroll-mt-6 p-5 xl:col-span-2">
          <h2 className="mb-1 flex items-center gap-2 font-bold"><Sparkles size={18} /> Inteligência artificial (contratos)</h2>
          <p className="mb-4 max-w-3xl text-sm text-ink-500">Cole aqui a chave da API da OpenAI (ChatGPT) para gerar contratos automaticamente na Nova cobrança. Crie a chave em <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="font-semibold text-brand-600 underline">platform.openai.com/api-keys</a> — a conta precisa ter créditos em <a href="https://platform.openai.com/settings/organization/billing" target="_blank" rel="noreferrer" className="font-semibold text-brand-600 underline">Billing</a>. A chave fica guardada criptografada e nunca é mostrada inteira.</p>
          <div className="grid gap-6 lg:grid-cols-2">
            <ActionForm action={saveAi} submit={t.aiApiKey ? 'Trocar chave' : 'Salvar chave'}>
              <p className="text-sm">Situação: {t.aiApiKey ? <b className="text-emerald-600">ChatGPT conectado · chave {mask(decrypt(t.aiApiKey))}</b> : <b className="text-ink-500">nenhuma chave cadastrada</b>}</p>
              <Field label="Chave da API da OpenAI" hint="Começa com sk-"><input name="aiApiKey" type="password" autoComplete="off" placeholder="sk-..." className="input" /></Field>
            </ActionForm>
            {t.aiApiKey && <ActionForm action={saveAi} submit="Remover chave" submitClass="btn-ghost !text-red-600"><input type="hidden" name="remove" value="1" /></ActionForm>}
          </div>
        </section>

        <section className="card p-5 xl:col-span-2">
          <h2 className="mb-1 flex items-center gap-2 font-bold"><Landmark size={18} /> Banco para boletos</h2>
          <p className="mb-4 max-w-3xl text-sm text-ink-500">Conecte uma conta Asaas para emitir boletos registrados direto da fatura. O boleto vem com Pix do próprio banco e, quando o cliente paga, a fatura é baixada sozinha. Crie a chave no Asaas em <b>Integrações → Chaves de API</b>. Para testar sem movimentar dinheiro, use uma conta do ambiente de testes (sandbox).</p>
          <div className="grid gap-6 lg:grid-cols-2">
            <ActionForm action={saveBank} submit={connected ? 'Salvar' : 'Conectar banco'}>
              <p className="text-sm">Situação: {connected ? <b className="text-emerald-600">conectado ao Asaas ({t.bankEnv === 'producao' ? 'produção' : 'testes'}) · chave {mask(decrypt(t.bankApiKey))}</b> : <b className="text-ink-500">nenhum banco conectado</b>}</p>
              <Field label="Banco"><select name="bankProvider" className="input" defaultValue="asaas"><option value="asaas">Asaas</option></select></Field>
              <Field label="Ambiente">
                <select name="bankEnv" className="input" defaultValue={t.bankEnv}><option value="sandbox">Testes (sandbox)</option><option value="producao">Produção (cobranças reais)</option></select>
              </Field>
              <Field label="Chave de API" hint={connected ? 'Deixe em branco para manter a chave atual' : 'Começa com $aact_'}><input name="apiKey" type="password" autoComplete="off" className="input" /></Field>
            </ActionForm>
            <div className="space-y-3 text-sm">
              <p className="font-semibold">Aviso automático de pagamento</p>
              {connected && t.bankWebhookToken ? (
                <>
                  <p className="text-ink-500">No Asaas, em <b>Integrações → Webhooks → Cobranças</b>, crie um webhook com estes dados e marque os eventos de cobrança recebida, confirmada e removida:</p>
                  <p className="label">URL</p><p className="break-all rounded bg-ink-50 p-2 font-mono text-xs dark:bg-ink-900">{webhookUrl}</p><CopyButton text={webhookUrl} label="Copiar URL" />
                  <p className="label pt-2">Token de autenticação</p><p className="break-all rounded bg-ink-50 p-2 font-mono text-xs dark:bg-ink-900">{t.bankWebhookToken}</p><CopyButton text={t.bankWebhookToken} label="Copiar token" />
                  <ActionForm action={rotateWebhookToken} submit="Gerar novo token" submitClass="btn-ghost" className="pt-2" />
                </>
              ) : <p className="text-ink-500">Conecte o banco para ver os dados do aviso automático.</p>}
              {connected && <ActionForm action={saveBank} submit="Desconectar banco" submitClass="btn-ghost !text-red-600" className="pt-2"><input type="hidden" name="disconnect" value="1" /></ActionForm>}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
