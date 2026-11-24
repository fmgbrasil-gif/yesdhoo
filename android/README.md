# Yes DOOH Player — aplicativo Android (frente)

Aplicativo para **TV box Android, Android TV e Fire TV** (Android 5.0 ou superior). Ele abre o player do servidor em
tela cheia e cuida do que um navegador comum não faz:

- inicia sozinho quando o aparelho liga e pode ser definido como **tela inicial** (modo quiosque);
- mantém a tela ligada, sem barras do sistema, com vídeo e som automáticos;
- tenta reconectar a cada 15 s se o servidor não responder e se recupera se o WebView travar;
- guarda as mídias no aparelho: continua tocando se a internet cair.

Funciona com as duas retaguardas deste repositório (Node e PHP), pois ambas usam a mesma API de player.

## Instalar no box

1. Copie `dist/YesDoohPlayer-1.4-teste.apk` para o aparelho (pendrive ou download) e instale, permitindo "fontes desconhecidas".
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

O APK sai em `app/build/outputs/apk/debug/`. O arquivo em `dist/` é uma compilação **de teste**, assinada com chave
de depuração. Para distribuir de verdade, crie a sua chave e compile a versão `release` — as atualizações só
instalam por cima se forem assinadas sempre com a mesma chave:

```bash
keytool -genkeypair -v -keystore yesdooh.jks -alias yesdooh -keyalg RSA -keysize 2048 -validity 10000
```

Informe a chave em `~/.gradle/gradle.properties` (`YESDOOH_STORE_FILE`, `YESDOOH_STORE_PASSWORD`,
`YESDOOH_KEY_ALIAS`, `YESDOOH_KEY_PASSWORD`) e rode:

```bash
./gradlew assembleRelease
```

Guarde o arquivo `.jks` e as senhas em local seguro; eles nunca devem ir para o repositório.
