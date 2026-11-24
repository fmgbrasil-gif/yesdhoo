/** Especificacoes de midia para enviar a clientes e parceiros (pagina publica /especificacoes). */
export const SPEC_GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Vídeo',
    items: [
      ['Formato', 'MP4 (recomendado). Também aceitamos MOV e WEBM.'],
      ['Codec', 'H.264 (vídeo) e AAC (áudio). Evite H.265/HEVC: alguns TV box não reproduzem.'],
      ['Resolução horizontal', '1920 × 1080 px (Full HD, proporção 16:9).'],
      ['Resolução vertical', '1080 × 1920 px (proporção 9:16).'],
      ['Duração', '10 a 30 segundos (padrão da grade: 15 ou 20 segundos).'],
      ['Quadros por segundo', '30 fps (aceita 24 a 60 fps).'],
      ['Taxa de bits', '5 a 10 Mbps.'],
      ['Tamanho do arquivo', 'Até 50 MB recomendado. Limite máximo do sistema: 500 MB.'],
      ['Áudio', 'Opcional. A maioria das telas roda sem som: a mensagem precisa ser entendida sem áudio.'],
    ],
  },
  {
    title: 'Imagem (arte estática)',
    items: [
      ['Formato', 'JPG ou PNG (também WEBP e GIF).'],
      ['Resolução', '1920 × 1080 px (horizontal) ou 1080 × 1920 px (vertical).'],
      ['Tamanho do arquivo', 'Até 5 MB.'],
      ['Tempo na tela', 'Definido na grade (padrão: 10 a 15 segundos).'],
    ],
  },
];

export const SPEC_TIPS: string[] = [
  'Envie a versão na orientação da tela onde o anúncio vai passar. Se o anúncio vai passar em telas horizontais e verticais, envie as duas versões: o vídeo vertical não é exibido em tela horizontal (nem o contrário).',
  'Não deixe tarjas pretas nas laterais. Produza o vídeo já na proporção certa.',
  'Deixe uma margem de segurança de 5% nas bordas para textos e logotipos.',
  'Use textos grandes e pouco texto: o público vê o anúncio de passagem, em poucos segundos.',
  'Coloque logo, telefone/WhatsApp, @ do Instagram ou endereço nos últimos segundos.',
  'Mande o arquivo original (não encaminhado pelo WhatsApp como vídeo, que reduz a qualidade). Prefira enviar como “documento”, por e-mail ou por link (Google Drive, WeTransfer).',
];

export function specsText(link?: string) {
  const lines = ['*ESPECIFICAÇÕES DE MÍDIA - YES MÍDIA INDOOR*', ''];
  for (const g of SPEC_GROUPS) {
    lines.push(`*${g.title.toUpperCase()}*`);
    for (const [k, v] of g.items) lines.push(`- ${k}: ${v}`);
    lines.push('');
  }
  lines.push('*DICAS IMPORTANTES*');
  for (const t of SPEC_TIPS) lines.push(`- ${t}`);
  if (link) lines.push('', `Guia completo: ${link}`);
  return lines.join('\n');
}
