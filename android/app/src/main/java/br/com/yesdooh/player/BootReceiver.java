package br.com.yesdooh.player;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;

/**
 * Abre o player quando o aparelho liga (ou quando o app e atualizado).
 * Muitos TV box terminam de carregar a tela inicial deles depois do aviso de "ligado" e passam na frente:
 * por isso o player tenta abrir de novo algumas vezes nos primeiros minutos.
 */
public class BootReceiver extends BroadcastReceiver {
    static final String ACTION_RETRY = "br.com.yesdooh.player.ABRIR_PLAYER";
    private static final int[] RETRY_SECONDS = {10, 25, 45, 90};

    @Override
    public void onReceive(Context context, Intent intent) {
        launch(context);
        if (ACTION_RETRY.equals(intent.getAction())) return;
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        for (int i = 0; i < RETRY_SECONDS.length; i++) {
            Intent retry = new Intent(context, BootReceiver.class).setAction(ACTION_RETRY);
            PendingIntent pi = PendingIntent.getBroadcast(context, 100 + i, retry, flags);
            am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + RETRY_SECONDS[i] * 1000L, pi);
        }
    }

    static void launch(Context context) {
        if (MainActivity.visible) return; // ja esta na tela
        Intent start = new Intent(context, MainActivity.class);
        start.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        try {
            context.startActivity(start);
        } catch (Exception ignored) {
            // Android 10+ bloqueia sem a permissao "sobrepor a outros apps" ou sem ser a tela inicial:
            // o proprio app pede essas configuracoes na primeira abertura.
        }
    }
}
