# Yes DOOH — versão PHP para teste

Retaguarda enxuta em **PHP puro + SQLite**, sem instalação: serve para testar o fluxo completo numa hospedagem comum.
A versão completa do painel é a Node (raiz do repositório); as duas usam a mesma API de player, então o
**mesmo aplicativo Android** funciona com qualquer uma.

## Requisitos

PHP 8.1+ com as extensões `pdo_sqlite`, `curl`, `fileinfo`, `mbstring` e `simplexml` (padrão na maioria das hospedagens).

## Como testar

No computador:

```bash
php -S 0.0.0.0:8080 -t php
```

Abra `http://localhost:8080` e entre com `admin@yesdooh.com.br` / `yesdooh123`. **Troque a senha** em *Minha conta*.

Na hospedagem: envie o conteúdo desta pasta (ex.: para `public_html/yesdooh/`) e acesse o endereço. O banco é
criado sozinho no primeiro acesso. As pastas `data/` e `uploads/` precisam de permissão de escrita.

1. **Minhas telas** → crie a tela e anote o código de pareamento.
2. No box, abra o aplicativo Android (ou `.../player.php` no navegador) e digite o código.
3. **Conteúdos** → envie vídeos e imagens e marque as telas; ou adicione pela playlist da tela.

## O que tem

- Telas com pareamento por código, playlist ordenável, comandos remotos (sincronizar, reiniciar, limpar cache), reset
- Conteúdos: vídeo/imagem, YouTube, aviso de texto, notícias (RSS), hora certa, previsão do tempo, cotação do dólar
- Agendamento por período, turno e dias da semana; ativar/desativar; inclusão em várias telas
- Relatório de exibições por mídia e por tela, com exportação CSV
- Player com cache local dos arquivos, rodapé com relógio e rotação (`player.php?girar=90`)

Ficou só na versão Node: grupos de mídia, clientes, usuários e permissões, mapa, captura de tela, modo escuro.

## Antes de usar de verdade

- **Limite de upload:** hospedagens costumam limitar a 2–8 MB. Ajuste `upload_max_filesize` e `post_max_size` (php.ini ou painel) para o tamanho dos seus vídeos.
- **HTTPS:** necessário para o player guardar as mídias no aparelho e tocar sem internet.
- **Servidor que não é Apache** (Nginx, etc.): os arquivos `.htaccess` não valem. Bloqueie o acesso web à pasta `data/` e a execução de scripts em `uploads/` na configuração do servidor.
- O SQLite atende bem dezenas de telas. Para uma rede grande, use a versão Node com Postgres.
