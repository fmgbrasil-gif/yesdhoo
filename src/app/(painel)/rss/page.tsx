import { ContentPage } from '@/components/ContentPage';

export default function RssPage() {
  return (
    <ContentPage type="rss" title="RSS personalizado" newLabel="Novo feed RSS" emptyText="Cadastre o feed de um portal de notícias para exibir as manchetes mais recentes.">
      <p className="mb-4 rounded-lg bg-brand-50 p-3 text-sm text-ink-700 dark:bg-ink-800 dark:text-ink-200">As manchetes são atualizadas automaticamente a cada 30 minutos. A cada ciclo da playlist, a tela mostra a próxima notícia do feed.</p>
    </ContentPage>
  );
}
