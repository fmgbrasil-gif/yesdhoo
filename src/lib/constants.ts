export const APP_NAME = 'Yes DOOH';

/** Uma tela e considerada online se falou com o servidor nos ultimos N minutos. */
export const ONLINE_WINDOW_MIN = 3;

export const ORIENTATIONS = { H: 'Horizontal', V: 'Vertical' } as const;

export const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const UPDATE_FREQUENCIES = [
  { value: 5, label: '5 minutos' },
  { value: 10, label: '10 minutos' },
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
];

export const TIMEZONES = [
  'America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza', 'America/Recife', 'America/Maceio', 'America/Belem',
  'America/Araguaina', 'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho',
  'America/Boa_Vista', 'America/Rio_Branco', 'Europe/Lisbon',
];

export const STATES = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

export const MEDIA_TYPES: Record<string, string> = {
  arquivo: 'Vídeo/imagem',
  youtube: 'Vídeo YouTube',
  link: 'Link externo',
  aviso: 'Aviso',
  rss: 'Feed RSS',
  hora: 'Hora certa',
  dolar: 'Cotação do dólar',
  clima: 'Previsão do tempo',
};

export const COMMANDS: Record<string, { label: string; hint: string }> = {
  sincronizar: { label: 'Sincronizar agora', hint: 'Força a tela a buscar a playlist imediatamente' },
  recarregar: { label: 'Reiniciar player', hint: 'Recarrega o aplicativo do player' },
  limpar_cache: { label: 'Limpar cache', hint: 'Apaga as mídias baixadas e baixa tudo novamente' },
  screenshot: { label: 'Capturar tela', hint: 'Pede uma imagem do que está sendo exibido agora' },
};

export const LIBRARY_SECTIONS: Record<string, string> = {
  marca: 'Institucional',
  saude: 'Saúde',
  sazonais: 'Datas sazonais',
  noticias: 'Notícias',
  diversos: 'Diversos',
};

export const SEGMENTS = [
  'Academias', 'Agência de Publicidade', 'Agência de Viagens', 'Banco', 'Barbearia', 'Clínica Médica', 'Concessionária de Veículos',
  'Consultório Odontológico', 'Corporativo', 'Escola/Faculdade', 'Escritório de Contabilidade', 'Eventos', 'Farmácias', 'Geral',
  'Hortifruti', 'Hotel', 'Indústria', 'Lanchonetes', 'Lavanderia', 'Loja de Calçados', 'Loja de Conveniência', 'Loja de Eletrônicos',
  'Loja de Material de Construção', 'Loja de Móveis', 'Loja de Roupas', 'Lotéricas', 'Oficina Mecânica', 'Ótica', 'Padarias',
  'Pet Shop', 'Posto de Combustível', 'Provedor de Internet', 'Residencial', 'Restaurantes', 'Salão de Beleza', 'Supermercados', 'Outro',
];
