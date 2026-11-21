import { getUser } from '@/lib/auth';
import { lookupCnpj } from '@/lib/cnpj';

export async function GET(_: Request, { params }: { params: Promise<{ cnpj: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'Faça login.' }, { status: 401 });
  const cnpj = (await params).cnpj.replace(/\D/g, '');
  if (cnpj.length !== 14) return Response.json({ error: 'Informe um CNPJ com 14 dígitos.' }, { status: 400 });
  try {
    const data = await lookupCnpj(cnpj);
    if (!data) return Response.json({ error: 'CNPJ não encontrado na Receita Federal.' }, { status: 404 });
    return Response.json(data);
  } catch {
    return Response.json({ error: 'A consulta à Receita está fora do ar agora. Preencha manualmente ou tente de novo.' }, { status: 502 });
  }
}
