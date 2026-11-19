# Yes DOOH

Plataforma de gestão de **mídia indoor / DOOH** (Digital Out-of-Home): cadastro de telas, playlists, anunciantes,
conteúdos dinâmicos, comandos remotos e comprovação de exibição — mais o **player** que roda no aparelho ligado à TV.

O repositório tem três partes:

| Pasta | O que é |
| --- | --- |
| raiz (`src/`, `prisma/`) | **Retaguarda** completa — painel em Next.js e player web |
| [`android/`](android/README.md) | **Frente** — aplicativo Android para TV box, com APK de teste em `android/dist/` |
| [`php/`](php/README.md) | Retaguarda enxuta em PHP + SQLite, para testar em hospedagem comum |

Implementação própria (código, layout e identidade visual originais). A análise funcional que serviu de base e o
acervo de telas de referência estão em [`docs/`](docs/analise-funcional.md).

## Como rodar

Requisitos: Node 20+ (e `ffmpeg` instalado, opcional, para ler duração e gerar miniatura de vídeos).

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run setup
```

```bash
npm run dev
```

Abra `http://localhost:3000` e entre com `admin@yesdooh.com.br` / `yesdooh123` (dados de demonstração — **troque a senha** em *Minha conta*).

### Colocando uma tela no ar

1. Em **Minhas telas → Nova tela**, crie a tela. A página dela mostra um **código de pareamento** de 6 caracteres.
2. No box Android, instale o [aplicativo](android/README.md), informe o endereço do servidor e digite o código. Em outros aparelhos (mini PC, smart TV), abra `https://SEU-SERVIDOR/player` no navegador em tela cheia.
3. Monte a programação em **Playlist** e clique em **Salvar playlist**. A tela atualiza sozinha em até 1 minuto.

Para TVs montadas na vertical com o sistema em paisagem, abra `/player?girar=90` (ou `270`) uma vez — a rotação fica gravada no aparelho.

## O que tem

| Área | Recursos |
| --- | --- |
| Dashboard | Telas online/offline, horas no ar, uso do plano por segmento, mapa de cobertura, exibições dos últimos 12 meses, telas mais requisitadas, anotações |
| Minhas telas | Cadastro em abas (info, localização com pino no mapa, métricas, configurações), filtros, favoritas, pareamento por código, reset, exclusão com frase de confirmação |
| Detalhe da tela | Última captura, dados do dispositivo, gráfico mensal/diário de exibições, horas online, comandos remotos (sincronizar, reiniciar, limpar cache, capturar tela), anotações |
| Playlist | Explorador de conteúdos por categoria, busca, arrastar para ordenar, embaralhar, importar de outra tela, limpar vencidas, zerar, desfazer, tempo de ciclo |
| Minhas mídias | Imagem/vídeo (arquivo horizontal e vertical), vídeo do YouTube, link externo; agendamento por período, turno e dias da semana; inclusão rápida em várias telas; ativar/desativar |
| Grupos de mídia | Várias mídias revezando na mesma posição da playlist |
| Conteúdos dinâmicos | Biblioteca pronta (institucional, saúde, datas sazonais, notícias, hora certa, dólar, clima) |
| RSS / Avisos / Utilitários | Manchetes de qualquer feed, avisos de texto com cores, hora certa, cotação do dólar e previsão do tempo |
| Clientes | Cadastro de anunciantes (PF/PJ) vinculado às mídias |
| Relatório de exibições | Comprovação por tela e por mídia, com filtros e exportação CSV |
| Usuários | Perfis administrador/operador, permissão por tela, ativação |
| Player | Pareamento, reprodução em laço, cache local dos arquivos (continua tocando sem internet), agendamento no fuso da tela, rodapé, contagem de exibições, comandos remotos |

Ainda **não** implementado: integração com Instagram (depende de app aprovado na Meta), mídia programática e cobrança
automática de telas adicionais.

## Proteção de acesso

- **Login obrigatório** em todo o painel, com perfis *Administrador* (gerencia usuários) e *Operador*, e permissão por tela.
- **Senha provisória:** a conta inicial e todo usuário criado pelo administrador são obrigados a criar a própria senha no primeiro acesso.
- **Política de senha:** mínimo de 8 caracteres, com letras e números; senhas muito comuns são recusadas.
- **Bloqueio contra força bruta:** 5 senhas erradas para o mesmo e-mail (ou 20 do mesmo IP) em 15 minutos bloqueiam novas tentativas por 15 minutos. O pareamento de telas bloqueia após 10 códigos errados.
- **Sessões:** cookie assinado, `HttpOnly`, `Secure` e `SameSite=Lax`. Trocar a senha ou desativar um usuário derruba as sessões abertas na hora.
- **Arquivos enviados** são servidos com política que impede execução de scripts; o painel não pode ser embutido em outros sites e força HTTPS.
- O player não usa login: cada aparelho recebe um token próprio no pareamento, revogado ao resetar a tela.

## Publicar

O repositório traz um `Dockerfile` pronto (com `ffmpeg`). O banco e as mídias ficam no volume `/data`, que precisa ser persistente.

| Variável | Para quê |
| --- | --- |
| `AUTH_SECRET` | Segredo longo e aleatório que assina as sessões (obrigatório) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Conta inicial, criada só na primeira subida; a senha é provisória |
| `TENANT_NAME`, `PLAN_SCREENS` | Nome da rede e limite de telas (opcionais) |

Na Railway: *New Project → Deploy from GitHub repo*, adicione um **Volume** montado em `/data`, preencha as variáveis e gere um domínio em *Settings → Networking*. O arquivo `railway.json` já aponta para o Dockerfile.

```bash
docker build -t yesdooh . && docker run -p 3000:3000 -v yesdooh-data:/data -e AUTH_SECRET=troque -e ADMIN_EMAIL=voce@empresa.com.br -e ADMIN_PASSWORD=Provisoria123 yesdooh
```

### Vercel + Supabase

Na Vercel o sistema usa **Postgres** (Supabase) e guarda as mídias no **Vercel Blob**; o navegador envia os vídeos direto para o armazenamento. O `vercel.json` já chama `scripts/vercel-build.mjs`, que troca o banco para Postgres, cria as tabelas e a conta inicial.

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | Conexão do Supabase pelo *pooler* em modo transação (porta 6543), com `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Conexão do Supabase pelo *pooler* em modo sessão (porta 5432), usada para criar as tabelas |
| `BLOB_READ_WRITE_TOKEN` | Criada pela Vercel ao conectar um *Blob store* ao projeto |
| `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Como na tabela acima |

## Arquitetura

- **Next.js 15** (App Router, Server Components e Server Actions) + **TypeScript** + **Tailwind CSS**
- **Prisma** com **SQLite** em desenvolvimento. Para produção, troque `provider` para `postgresql` em `prisma/schema.prisma` (ex.: Supabase) e ajuste `DATABASE_URL`.
- Arquivos enviados ficam em `storage/` (interface isolada em `src/lib/storage.ts`, pronta para trocar por S3/Supabase Storage).
- Sessão por cookie assinado (JWT, `AUTH_SECRET`); senhas com bcrypt. Todos os dados são isolados por conta (*tenant*).

```
src/app/(painel)/   páginas do painel (cada pasta = um módulo, com suas actions)
src/app/player/     player que roda na TV
src/app/api/player  API do player: pair, sync, heartbeat, widget
src/lib/            banco, autenticação, armazenamento, regras de playlist e relatório
prisma/             modelo de dados e dados de demonstração
docs/               análise funcional e acervo de telas de referência
```

### Como o player conversa com o servidor

| Chamada | Quando | O que faz |
| --- | --- | --- |
| `POST /api/player/pair` | Uma vez | Troca o código de pareamento por um token do dispositivo |
| `GET /api/player/sync` | Ao abrir, a cada *N* min e quando a versão muda | Baixa configuração da tela e playlist já resolvida |
| `POST /api/player/heartbeat` | A cada 1 min | Marca online, soma tempo no ar, envia exibições, confirma e recebe comandos |
| `GET /api/player/widget` | Ao exibir notícias, dólar ou clima | Dados externos com cache no servidor |

Toda alteração que afeta uma tela incrementa `playlistVersion`; o player compara no batimento e sincroniza em seguida.
