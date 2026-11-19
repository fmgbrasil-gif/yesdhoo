# Análise funcional — sistema de referência

Levantamento feito navegando o painel de referência (somente leitura: nenhuma alteração foi gravada na conta).
As capturas estão em [`referencia/telas/`](referencia/telas) — 86 imagens, numeradas pela ordem do menu.
Este documento descreve **o que o sistema faz e por quê**; a coluna "No Yes DOOH" aponta onde cada ideia foi
reimplementada neste repositório.

> As capturas mostram dados reais da conta (nomes de pontos e anunciantes). Mantenha o repositório privado ou
> remova a pasta antes de torná-lo público.

## 1. Conceito

DOOH (Digital Out-of-Home) é mídia exibida em telas digitais fora de casa. Na modalidade *indoor*, as telas ficam
dentro de estabelecimentos (academias, restaurantes, mercados) e alternam anúncios de clientes com conteúdo de
interesse (notícias, clima, dicas) que mantém a atenção do público. O operador da rede precisa de três coisas:

1. **Controlar à distância** o que cada tela exibe e saber se ela está no ar.
2. **Organizar a programação** por anunciante, período e horário.
3. **Comprovar a exibição** ao anunciante (quantas vezes a campanha rodou, em quais telas).

O sistema tem duas partes: o **painel web** (gestão) e o **player** (aplicativo no aparelho ligado à TV), que baixa
a playlist, toca em laço mesmo sem internet e reporta o que exibiu.

## 2. Mapa de telas

| # | Tela | Capturas | O que faz | No Yes DOOH |
| --- | --- | --- | --- | --- |
| 00 | Login, recuperar senha, política | `00*` | Acesso por e-mail e senha, "lembrar" | `/login` |
| 01 | Dashboard | `01*` | Online/offline em tempo real, desempenho dos últimos 7 dias, uso do plano por segmento, mapa de cobertura, exibições em 12 meses, médias por tela, telas com mais conteúdo, anotações | `/dashboard` |
| 01a–f | Menu | `01a`–`01f` | Notificações, menu do usuário, modo escuro, menu recolhido, telas favoritas | `Sidebar` |
| 02 | Minhas telas | `02*` | Abas Online/Offline/Todas, filtros (nome, orientação), disponibilidade, mídias baixadas, última comunicação; limite de telas pelo plano | `/telas` |
| 13 | Detalhe da tela | `13*` | Última captura, dispositivo (modelo, SO, versão do app, memória), exibições mensal/diário, comandos remotos, anotações; ações: favorita, localização, editar, resetar | `/telas/[id]` |
| 13g | Editar tela | `13g*` | Abas **Info** (orientação, nome, imagem, telefones), **Localização** (pino no mapa + endereço), **Métricas** (segmento, horário e dias de funcionamento, fluxo médio), **Configurações** (fuso, intervalo de atualização, som, rodapé) | `ScreenForm` |
| 14 | Playlist | `14*` | Explorador de conteúdo por categoria à esquerda, fila da tela à direita; embaralhar, importar, limpar, zerar, desfazer, salvar; total de mídias e tempo de ciclo | `/telas/[id]/playlist` |
| 03 | Minhas mídias | `03*` | Lista com miniatura, duração, cliente, nº de telas, status; nova mídia (arquivo, YouTube, link, programática); editar em abas **Info / Agendamento / Inclusão rápida**; detalhe com telas onde toca e status de download | `/midias` |
| 04 | Grupos de mídia | `04*` | Conjunto de mídias tratado como um item da playlist | `/grupos` |
| 05 | Conteúdos dinâmicos | `05*` | Biblioteca mantida pela plataforma, por seção; "incluir nas telas" / "remover de todas" | `/biblioteca` |
| 06 | Instagram | `06*` | Exibe posts de um perfil autorizado por token | pendente |
| 07 | RSS personalizado | `07*` | Manchetes de um feed, com título, fonte, cores | `/rss` |
| 08 | Avisos | `08*` | Slide de texto com título, cores e tamanho de fonte | `/avisos` |
| 09 | Utilitários | `09*` | Hora certa e cotação do dólar, com cores e duração | `/utilitarios` (+ clima) |
| 10 | Clientes | `10*` | Anunciantes PF/PJ com documento, contato e endereço | `/clientes` |
| 11 | Relatório de exibições | `11*` | Exibições por tela no período, filtros por mídia, grupo, tela e datas | `/relatorios` (+ por mídia e CSV) |
| 12 | Usuários | `12*` | Usuários da conta, fuso, permissão por tela, restrição de conteúdo | `/usuarios` |
| 90 | Mobile | `90`, `91` | Layout responsivo com menu em gaveta | todas as páginas |

## 3. Regras de negócio observadas

**Telas**
- Cada tela tem orientação (horizontal/vertical) e pertence a um segmento; o plano limita a quantidade de telas.
- "Online" é derivado do último contato do player; o painel mostra há quanto tempo a tela não comunica.
- "Resetar" desvincula o dispositivo e exige digitar uma frase de confirmação (`resetar:nome-da-tela`).
- A tela consulta atualizações em intervalo configurável (10 min a 1 h).

**Mídias**
- Uma mídia pode ter um arquivo horizontal e outro vertical; **só toca em telas da mesma orientação** — caso contrário aparece como "Mídia incompatível".
- Agendamento: data de início/fim, turno (hora inicial/final) e dias da semana. Ao vencer, a mídia sai do ar e gera notificação.
- "Inclusão rápida" coloca a mídia em várias telas de uma vez, sem abrir cada playlist.
- "Gravar estatísticas" decide se as reproduções entram no relatório.
- Mídias pertencem a um cliente ou são "avulsas".

**Playlist**
- É uma fila ordenada por tela; o player repete em laço. O painel soma as durações e mostra o **tempo de ciclo**.
- Alterações ficam locais até "Salvar playlist"; há aviso de playlist modificada e "desfazer".
- Um grupo ocupa uma posição e reveza suas mídias.

**Comandos remotos**
- O painel enfileira o comando (ex.: screenshot, reiniciar player); o player executa no próximo contato e o histórico mostra quem pediu e quando. Tela offline não aceita comando.

**Notificações**
- Geradas pelo sistema: telas offline há mais de 48 h, mídias agendadas que expiraram, novidades na biblioteca.

## 4. Modelo de dados (inferido → adotado)

| Entidade | Papel |
| --- | --- |
| Conta (*tenant*) | Dona de telas, mídias, clientes e usuários; guarda o limite do plano |
| Usuário | Acesso ao painel; pode ser limitado a algumas telas |
| Tela | Ponto de exibição + dispositivo pareado + configurações do player |
| Categoria | Segmento da tela / da mídia |
| Cliente | Anunciante |
| Mídia | Qualquer conteúdo reproduzível (arquivo, YouTube, link, aviso, RSS, utilitário); com conta nula = biblioteca |
| Grupo de mídia | Conjunto de mídias em rodízio |
| Item de playlist | Posição na fila de uma tela (aponta para mídia ou grupo) |
| Comando | Pedido remoto para uma tela |
| Estatística de exibição | Contagem por tela + mídia + dia |
| Tempo no ar | Minutos online por tela + dia |
| Notificação | Aviso do sistema para a conta |

O esquema completo está em [`prisma/schema.prisma`](../prisma/schema.prisma).

## 5. Diferenças intencionais

- **Identidade visual e código próprios** — nada do front-end de referência foi copiado; a estrutura de navegação segue o padrão de painéis administrativos.
- **Player web** em vez de aplicativo Android nativo: roda em qualquer aparelho com navegador e guarda os arquivos em cache para tocar offline. Um invólucro Android (WebView em modo quiosque) pode ser adicionado depois.
- **Relatório** ganhou visão por mídia, tempo no ar e exportação CSV.
- **Utilitários** ganharam previsão do tempo pela localização da tela.
- Itens marcados "em breve" na referência (calculadora, download e relatório de mídias por tela) ficaram fora.
