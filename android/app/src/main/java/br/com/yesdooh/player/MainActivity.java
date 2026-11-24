package br.com.yesdooh.player;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.ImageView;
import android.widget.TextView;

/**
 * Player em modo quiosque: abre o player web do servidor em tela cheia, mantem a tela ligada,
 * tenta de novo sozinho quando a conexao cai e volta ao ar apos falhas do WebView.
 *
 * Controle remoto: tecla MENU (ou VOLTAR 5 vezes seguidas) abre as opcoes.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "yesdooh";
    /** Servidor padrao (painel em producao); pode ser trocado na configuracao. */
    private static final String DEFAULT_SERVER = "https://yesdooh.vercel.app";
    private static final String KEY_URL = "server";
    private static final String KEY_ROTATE = "rotate";
    private static final String[] ROTATIONS = {"0", "90", "180", "270"};
    private static final long RETRY_MS = 15_000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SharedPreferences prefs;
    private FrameLayout root;
    private WebView web;
    /** O player esta na frente (evita reabrir sem necessidade nas tentativas do boot). */
    static volatile boolean visible;
    private TextView status;
    /** Abertura: logo da Yes grande e a da Imperium X embaixo (enquanto o player carrega ou sem conexao). */
    private FrameLayout splash;
    private boolean failed;
    private int backCount;
    private long lastBack;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);
        createWebView();
        buildSplash();

        if (prefs.getString(KEY_URL, "").isEmpty()) showSetup(); else { loadPlayer(); checkAutostart(false); }
        if (System.currentTimeMillis() - prefs.getLong("updateChecked", 0) > 20 * 3600_000L) handler.postDelayed(() -> checkUpdate(false), 60_000);
    }

    /** No Android 10+ o app so abre sozinho ao ligar se for a tela inicial ou puder "sobrepor a outros apps". */
    private boolean autostartReady() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        return isDefaultHome() || Settings.canDrawOverlays(this);
    }

    private boolean isDefaultHome() {
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        android.content.pm.ResolveInfo r = getPackageManager().resolveActivity(home, 0);
        return r != null && r.activityInfo != null && getPackageName().equals(r.activityInfo.packageName);
    }

    /** Guia para liberar a abertura automatica (na primeira vez e pelo menu). */
    private void checkAutostart(boolean fromMenu) {
        if (autostartReady()) {
            if (fromMenu) new AlertDialog.Builder(this).setTitle("Abrir ao ligar o aparelho").setMessage("Tudo certo: o player abre sozinho quando o aparelho liga." + (isDefaultHome() ? "\n\n(O player é a tela inicial do aparelho.)" : "")).setPositiveButton("OK", null).show();
            return;
        }
        if (!fromMenu && prefs.getBoolean("autostartAsked", false)) return;
        prefs.edit().putBoolean("autostartAsked", true).apply();
        new AlertDialog.Builder(this)
                .setTitle("Abrir sozinho ao ligar o aparelho")
                .setMessage("Para o player abrir sozinho quando o TV box for ligado ou reiniciado, o Android precisa de uma destas liberações:\n\n"
                        + "1) Definir o Yes DOOH Player como TELA INICIAL (recomendado para box dedicado à TV).\n\n"
                        + "2) Permitir \"Sobrepor a outros apps\" / \"Exibir sobre outros apps\" para o Yes DOOH Player.\n\n"
                        + "Depois, volte para o player.")
                .setPositiveButton("Tela inicial", (d, w) -> setAsHome())
                .setNeutralButton("Sobrepor apps", (d, w) -> allowOverlay())
                .setNegativeButton("Agora não", null)
                .show();
    }

    private void setAsHome() {
        try {
            startActivity(new Intent(Settings.ACTION_HOME_SETTINGS));
        } catch (Exception e) {
            // sem a tela de "app de inicio": abre o seletor de tela inicial (escolha Yes DOOH Player e "Sempre")
            open(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
    }

    private void allowOverlay() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        try {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            open(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView() {
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                      // token de pareamento e playlist salva
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);      // videos comecam sozinhos, com som
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setUserAgentString(s.getUserAgentString() + " YesDoohPlayer/" + appVersion());
        CookieManager.getInstance().setAcceptCookie(true);

        // sem o icone de "play" cinza que o Android desenha antes de cada video comecar
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public Bitmap getDefaultVideoPoster() {
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                failed = false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!failed) splash.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) retryLater();
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView view, int code, String description, String failingUrl) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) retryLater();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // o processo do WebView caiu (pouca memoria e comum em TV box): recria e continua
                root.removeView(web);
                web.destroy();
                createWebView();
                loadPlayer();
                return true;
            }
        });
        root.addView(web, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private String appVersion() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "1.0";
        }
    }

    /** Aceita o endereco do servidor ("https://painel.exemplo.com") ou o endereco completo do player (".../player.php"). */
    static String playerUrl(String server, String rotate) {
        String url = server.trim();
        if (!url.matches("(?i)^https?://.*")) url = "https://" + url;
        while (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        String path = Uri.parse(url).getPath();
        boolean isPlayer = path != null && (path.endsWith(".php") || path.endsWith("/player"));
        if (!isPlayer) url += "/player";
        return url + (url.contains("?") ? "&" : "?") + "girar=" + rotate;
    }

    private void buildSplash() {
        int w = getResources().getDisplayMetrics().widthPixels, h = getResources().getDisplayMetrics().heightPixels;
        int shortSide = Math.min(w, h);
        splash = new FrameLayout(this);
        splash.setBackgroundColor(Color.parseColor("#1B0C30"));
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        ImageView yes = new ImageView(this);
        yes.setImageResource(R.drawable.splash_yes);
        yes.setAdjustViewBounds(true);
        col.addView(yes, new LinearLayout.LayoutParams(Math.min((int) (w * 0.5), (int) (h * 0.9)), ViewGroup.LayoutParams.WRAP_CONTENT));
        status = new TextView(this);
        status.setTextColor(Color.parseColor("#D8CCF0"));
        status.setTextSize(18);
        status.setGravity(Gravity.CENTER);
        status.setText("Carregando...");
        status.setPadding(0, shortSide / 30, 0, 0);
        col.addView(status);
        splash.addView(col, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        ImageView imperium = new ImageView(this);
        imperium.setImageResource(R.drawable.splash_imperium);
        imperium.setAdjustViewBounds(true);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams((int) (shortSide * 0.28), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        lp.bottomMargin = shortSide / 18;
        splash.addView(imperium, lp);
        root.addView(splash, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void loadPlayer() {
        handler.removeCallbacksAndMessages(null);
        web.loadUrl(playerUrl(prefs.getString(KEY_URL, ""), prefs.getString(KEY_ROTATE, "0")));
    }

    private void retryLater() {
        failed = true;
        status.setText("Sem conexão com o servidor. Tentando novamente em instantes...\n(tecla MENU abre as opções)");
        splash.setVisibility(View.VISIBLE);
        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(this::loadPlayer, RETRY_MS);
    }

    private void showSetup() {
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(pad, pad / 2, pad, 0);

        TextView l1 = new TextView(this);
        l1.setText("Endereço do servidor (já vem preenchido com o da Yes; troque só se usar outro)");
        EditText url = new EditText(this);
        url.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        url.setSingleLine(true);
        url.setHint("https://");
        url.setText(prefs.getString(KEY_URL, DEFAULT_SERVER));

        TextView l2 = new TextView(this);
        l2.setText("Girar a imagem (para TV instalada na vertical)");
        l2.setPadding(0, pad / 2, 0, 0);
        Spinner rotate = new Spinner(this);
        rotate.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, new String[]{"Sem rotação", "90°", "180°", "270°"}));
        rotate.setSelection(Math.max(0, java.util.Arrays.asList(ROTATIONS).indexOf(prefs.getString(KEY_ROTATE, "0"))));

        box.addView(l1);
        box.addView(url);
        box.addView(l2);
        box.addView(rotate);

        new AlertDialog.Builder(this)
                .setTitle("Configurar player")
                .setView(box)
                .setCancelable(!prefs.getString(KEY_URL, "").isEmpty())
                .setPositiveButton("Salvar", (d, w) -> {
                    String value = url.getText().toString().trim();
                    if (value.isEmpty()) {
                        showSetup();
                        return;
                    }
                    prefs.edit().putString(KEY_URL, value).putString(KEY_ROTATE, ROTATIONS[rotate.getSelectedItemPosition()]).apply();
                    loadPlayer();
                    checkAutostart(false);
                })
                .show();
    }


    // ---------- atualizacao do app pelo menu ----------

    private int versionCode() {
        try {
            android.content.pm.PackageInfo i = getPackageManager().getPackageInfo(getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? (int) i.getLongVersionCode() : i.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    /** Servidor onde fica o arquivo de versao: o configurado (so o dominio) ou o padrao. */
    private String updateBase() {
        String url = prefs.getString(KEY_URL, DEFAULT_SERVER);
        try {
            Uri u = Uri.parse(url.matches("(?i)^https?://.*") ? url : "https://" + url);
            return u.getScheme() + "://" + u.getAuthority();
        } catch (Exception e) {
            return DEFAULT_SERVER;
        }
    }

    private static String httpGet(String url) throws Exception {
        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setUseCaches(false);
        try (java.io.InputStream in = c.getInputStream(); java.util.Scanner sc = new java.util.Scanner(in, "UTF-8").useDelimiter("\\A")) {
            return sc.hasNext() ? sc.next() : "";
        } finally {
            c.disconnect();
        }
    }

    /** Consulta /download/version.json; manual = pelo menu (sempre responde), automatico = so avisa se houver versao nova. */
    private void checkUpdate(boolean manual) {
        prefs.edit().putLong("updateChecked", System.currentTimeMillis()).apply();
        if (manual) toast("Procurando atualização...");
        new Thread(() -> {
            String base = updateBase();
            try {
                org.json.JSONObject j;
                try {
                    j = new org.json.JSONObject(httpGet(base + "/download/version.json"));
                } catch (Exception first) {
                    base = DEFAULT_SERVER;
                    j = new org.json.JSONObject(httpGet(base + "/download/version.json"));
                }
                int code = j.getInt("versionCode");
                String name = j.optString("versionName", "?");
                String apk = j.optString("url", "/download/YesDoohPlayer.apk");
                String full = apk.startsWith("http") ? apk : base + apk;
                String notes = j.optString("notes", "");
                runOnUiThread(() -> {
                    if (code <= versionCode()) {
                        if (manual) new AlertDialog.Builder(this).setTitle("Atualizar versão").setMessage("Você já está na versão mais nova (" + appVersion() + ").").setPositiveButton("OK", null).show();
                        return;
                    }
                    new AlertDialog.Builder(this)
                            .setTitle("Nova versão disponível: " + name)
                            .setMessage("Versão instalada: " + appVersion() + "\nVersão nova: " + name + (notes.isEmpty() ? "" : "\n\n" + notes) + "\n\nBaixar e instalar agora? O pareamento e a programação são mantidos.")
                            .setPositiveButton("Atualizar", (d, w) -> downloadUpdate(full, name))
                            .setNegativeButton("Depois", null)
                            .show();
                });
            } catch (Exception e) {
                if (manual) runOnUiThread(() -> new AlertDialog.Builder(this).setTitle("Atualizar versão").setMessage("Não foi possível verificar a atualização agora. Confira a internet e tente de novo.").setPositiveButton("OK", null).show());
            }
        }).start();
    }

    private void toast(String msg) {
        android.widget.Toast.makeText(this, msg, android.widget.Toast.LENGTH_SHORT).show();
    }

    /** Baixa o APK novo mostrando o progresso na tela de abertura e abre o instalador do Android. */
    private void downloadUpdate(String url, String name) {
        status.setText("Baixando a versão " + name + "...");
        splash.setVisibility(View.VISIBLE);
        new Thread(() -> {
            java.io.File out = new java.io.File(getCacheDir(), ApkProvider.FILE);
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                c.setConnectTimeout(20000);
                c.setReadTimeout(30000);
                int total = c.getContentLength();
                try (java.io.InputStream in = c.getInputStream(); java.io.FileOutputStream fo = new java.io.FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    long got = 0; int n, last = -1;
                    while ((n = in.read(buf)) > 0) {
                        fo.write(buf, 0, n);
                        got += n;
                        if (total > 0) {
                            int pct = (int) (got * 100 / total);
                            if (pct != last) { last = pct; runOnUiThread(() -> status.setText("Baixando a versão " + name + "... " + pct + "%")); }
                        }
                    }
                } finally {
                    c.disconnect();
                }
                out.setReadable(true, false);
                runOnUiThread(() -> installUpdate(out));
            } catch (Exception e) {
                runOnUiThread(() -> {
                    splash.setVisibility(View.GONE);
                    new AlertDialog.Builder(this).setTitle("Atualizar versão").setMessage("O download falhou. Confira a internet e tente de novo pelo menu.").setPositiveButton("OK", null).show();
                });
            }
        }).start();
    }

    private void installUpdate(java.io.File apk) {
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            // o Android pede para liberar "instalar apps desconhecidos" para o proprio player uma unica vez
            splash.setVisibility(View.GONE);
            new AlertDialog.Builder(this)
                    .setTitle("Liberar a instalação")
                    .setMessage("Na próxima tela, ative \"Permitir desta fonte\" para o Yes DOOH Player. Depois volte e escolha Atualizar de novo no menu.")
                    .setPositiveButton("Abrir", (d, w) -> open(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))))
                    .show();
            return;
        }
        status.setText("Abrindo o instalador...");
        Intent i = new Intent(Intent.ACTION_VIEW);
        if (Build.VERSION.SDK_INT >= 24) {
            i.setDataAndType(ApkProvider.uri(this), "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } else {
            // Android antigo: o instalador le o arquivo direto (copiado para uma pasta publica do app)
            java.io.File pub = new java.io.File(getExternalCacheDir() != null ? getExternalCacheDir() : getCacheDir(), ApkProvider.FILE);
            try { copy(apk, pub); } catch (Exception ignored) { pub = apk; }
            i.setDataAndType(Uri.fromFile(pub), "application/vnd.android.package-archive");
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(i);
        } catch (Exception e) {
            splash.setVisibility(View.GONE);
            new AlertDialog.Builder(this).setMessage("Não foi possível abrir o instalador neste aparelho. Baixe pelo navegador em " + DEFAULT_SERVER + "/app").setPositiveButton("OK", null).show();
        }
    }

    private static void copy(java.io.File from, java.io.File to) throws java.io.IOException {
        try (java.io.FileInputStream in = new java.io.FileInputStream(from); java.io.FileOutputStream o = new java.io.FileOutputStream(to)) {
            byte[] b = new byte[64 * 1024]; int n;
            while ((n = in.read(b)) > 0) o.write(b, 0, n);
        }
        to.setReadable(true, false);
    }

    private void showMenu() {
        String auto = autostartReady() ? "Abrir ao ligar o aparelho: LIBERADO ✓" : "Abrir ao ligar o aparelho: NÃO LIBERADO — configurar";
        String[] items = {"Recarregar", "Atualizar versão do app (atual " + appVersion() + ")", "Configurar servidor e rotação", "Desparear e limpar dados", "Definir como tela inicial do aparelho", "Permitir sobrepor a outros apps", auto, "Sair do player"};
        new AlertDialog.Builder(this).setTitle("Yes DOOH Player " + appVersion()).setItems(items, (d, which) -> {
            switch (which) {
                case 0: loadPlayer(); break;
                case 1: checkUpdate(true); break;
                case 2: showSetup(); break;
                case 3:
                    WebStorage.getInstance().deleteAllData();
                    CookieManager.getInstance().removeAllCookies(null);
                    web.clearCache(true);
                    loadPlayer();
                    break;
                case 4: setAsHome(); break;
                case 5: allowOverlay(); break;
                case 6: checkAutostart(true); break;
                default: finish();
            }
        }).show();
    }

    private void open(Intent intent) {
        try {
            startActivity(intent);
        } catch (Exception e) {
            new AlertDialog.Builder(this).setMessage("Esta opção não está disponível neste aparelho. Procure nas configurações do Android.").setPositiveButton("OK", null).show();
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MENU || keyCode == KeyEvent.KEYCODE_SETTINGS) {
            showMenu();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_BACK) { // VOLTAR nao fecha o player; 5 toques seguidos abrem as opcoes
            long now = System.currentTimeMillis();
            backCount = now - lastBack < 1500 ? backCount + 1 : 1;
            lastBack = now;
            if (backCount >= 5) {
                backCount = 0;
                showMenu();
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    protected void onResume() {
        super.onResume();
        visible = true;
        web.onResume();
        hideSystemBars();
    }

    @Override
    protected void onPause() {
        visible = false;
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        web.destroy();
        super.onDestroy();
    }
}
