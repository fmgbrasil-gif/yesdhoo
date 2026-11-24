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
        status = new TextView(this);
        status.setTextColor(Color.WHITE);
        status.setTextSize(22);
        status.setGravity(Gravity.CENTER);
        status.setBackgroundColor(Color.parseColor("#0B1120"));
        status.setVisibility(View.GONE);
        setContentView(root);
        createWebView();
        root.addView(status, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        if (prefs.getString(KEY_URL, "").isEmpty()) showSetup(); else { loadPlayer(); checkAutostart(false); }
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
                if (!failed) status.setVisibility(View.GONE);
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

    private void loadPlayer() {
        handler.removeCallbacksAndMessages(null);
        web.loadUrl(playerUrl(prefs.getString(KEY_URL, ""), prefs.getString(KEY_ROTATE, "0")));
    }

    private void retryLater() {
        failed = true;
        status.setText("Sem conexão com o servidor.\nTentando novamente em instantes...\n\n(tecla MENU abre as opções)");
        status.setVisibility(View.VISIBLE);
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

    private void showMenu() {
        String auto = autostartReady() ? "Abrir ao ligar o aparelho: LIBERADO ✓" : "Abrir ao ligar o aparelho: NÃO LIBERADO — configurar";
        String[] items = {"Recarregar", "Configurar servidor e rotação", "Desparear e limpar dados", "Definir como tela inicial do aparelho", "Permitir sobrepor a outros apps", auto, "Sair do player"};
        new AlertDialog.Builder(this).setTitle("Yes DOOH Player " + appVersion()).setItems(items, (d, which) -> {
            switch (which) {
                case 0: loadPlayer(); break;
                case 1: showSetup(); break;
                case 2:
                    WebStorage.getInstance().deleteAllData();
                    CookieManager.getInstance().removeAllCookies(null);
                    web.clearCache(true);
                    loadPlayer();
                    break;
                case 3: setAsHome(); break;
                case 4: allowOverlay(); break;
                case 5: checkAutostart(true); break;
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
