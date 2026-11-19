import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getUser } from '@/lib/auth';

/**
 * Autoriza o navegador a enviar uma midia direto para o armazenamento em nuvem
 * (videos nao passam pelo servidor, que na Vercel aceita no maximo ~4,5 MB por requisicao).
 */
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        const user = await getUser();
        if (!user || user.mustChangePassword) throw new Error('Não autorizado');
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'],
          maximumSizeInBytes: 500 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
