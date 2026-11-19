package br.com.yesdooh.player;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Abre o player quando o aparelho liga (ou quando o app e atualizado). */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Intent start = new Intent(context, MainActivity.class);
        start.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(start);
        } catch (Exception ignored) {
            // Android 10+ pode bloquear: defina o app como tela inicial ou libere "sobrepor a outros apps".
        }
    }
}
