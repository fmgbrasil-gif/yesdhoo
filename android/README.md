# Yes DOOH Player — aplicativo Android (frente)

Aplicativo para **TV box Android, Android TV e Fire TV** (Android 5.0 ou superior). Ele abre o player do servidor em
tela cheia e cuida do que um navegador comum não faz:

- inicia sozinho quando o aparelho liga e pode ser definido como **tela inicial** (modo quiosque);
- mantém a tela ligada, sem barras do sistema, com vídeo e som automáticos;
- tenta reconectar a cada 15 s se o servidor não responder e se recupera se o WebView travar;
- guarda as mídias no aparelho: continua tocando se a internet cair.

Funciona com as duas retaguardas deste repositório (Node e PHP), pois ambas usam a mesma API de player.

## Instalar no box

1. Copie `dist/YesDoohPlayer-1.5-teste.apk` para o aparelho (pendrive ou download) e instale, permitindo "fontes desconhecidas".
2. Abra o app e informe o **endereço do servidor**:
   - retaguarda Node: `https://painel.suaempresa.com.br`
   - retaguarda PHP: `https://seusite.com.br/yesdooh` (ou o endereço completo terminando em `player.php`)
3. Digite o **código de pareamento** que aparece no painel, na página da tela.
4. Para abrir sozinho ao ligar ou reiniciar o box, aceite o pedido que o app faz na primeira abertura:
   **Tela inicial** (mais confiável) ou **Sobrepor apps**. No Android 10+ sem uma dessas liberações o sistema
   bloqueia a abertura automática. O app também tenta abrir de novo 10 s, 25 s, 45 s e 90 s depois de ligar,
   porque muitos box terminam de carregar a tela deles depois. Menu → "Abrir ao ligar o aparelho" mostra a situação.

**Menu do app:** tecla `MENU` do controle, ou `VOLTAR` cinco vezes seguidas. Nele dá para recarregar, trocar o
servidor, girar a imagem (TV na vertical), desparear e sair.

> Use **HTTPS** no servidor. Em `http://` o Android não permite guardar as mídias no aparelho, então o player
> depende da internet o tempo todo.

## Compilar

Requisitos: JDK 17+ e Android SDK (plataforma 34). Com `ANDROID_HOME` definido:

```bash
./gradlew assembleDebug
```

O APK de teste sai em `app/build/outputs/apk/debug/`. A versão distribuída (`dist/` e `public/download/`) é a
`release`, assinada com a **chave definitiva da Yes** (alias `yesdooh`, RSA 4096, válida até 11/04/2054,
SHA-256 `D9:3A:B3:E5:F3:22:EA:BF:0A:9C:ED:89:FD:67:79:FE:C8:38:6E:50:41:F8:DB:07:43:07:CA:B3:E5:1D:65:9C`).

O arquivo da chave e a senha ficam guardados, criptografados, no painel: **Plataforma → Chave do app Android**
(só o super admin vê; botão “Baixar arquivo da chave” e “Mostrar senha”). Para compilar, baixe o arquivo, informe-o
em `~/.gradle/gradle.properties` (`YESDOOH_STORE_FILE`, `YESDOOH_STORE_PASSWORD`, `YESDOOH_KEY_ALIAS=yesdooh`,
`YESDOOH_KEY_PASSWORD` — a mesma senha) e rode:

```bash
./gradlew assembleRelease
```

Guarde o arquivo `.jks` e as senhas em local seguro; eles nunca devem ir para o repositório.


## Publicar uma versão nova (atualização pelo menu do app)

1. Aumente `versionCode` e `versionName` em `app/build.gradle` e compile.
2. Copie o APK para `public/download/YesDoohPlayer.apk` (e para `dist/`).
3. Atualize `public/download/version.json` com o mesmo `versionCode`/`versionName`.
4. Publique o site. Nos aparelhos: menu do app → **Atualizar versão** (o app também avisa sozinho uma vez por dia).

A atualização só instala por cima se o APK for assinado com a **mesma chave** das versões anteriores.
