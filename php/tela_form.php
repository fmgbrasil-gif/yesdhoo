<?php /** Campos do cadastro de tela. Espera $s (tela ou null) e $action. */ if (!function_exists('csrf_field')) { http_response_code(403); exit; } ?>
<form method="post" action="<?= e($action) ?>"><?= csrf_field() ?><input type="hidden" name="acao" value="tela_salvar">
  <div class="grid">
    <label>Nome<input name="name" required value="<?= e($s['name'] ?? '') ?>" placeholder="Ex.: Academia — Recepção"></label>
    <label>Orientação<select name="orientation"><option value="H">Horizontal</option><option value="V" <?= ($s['orientation'] ?? '') === 'V' ? 'selected' : '' ?>>Vertical</option></select></label>
    <label>Cidade<input name="city" value="<?= e($s['city'] ?? '') ?>"></label>
    <label>Latitude (para o clima)<input name="lat" inputmode="decimal" value="<?= e($s['lat'] ?? '') ?>" placeholder="-21.1775"></label>
    <label>Longitude<input name="lng" inputmode="decimal" value="<?= e($s['lng'] ?? '') ?>" placeholder="-47.8103"></label>
    <label>Fuso horário<input name="timezone" value="<?= e($s['timezone'] ?? 'America/Sao_Paulo') ?>"></label>
    <label>Buscar atualizações a cada (min)<input type="number" name="update_freq" min="1" max="120" value="<?= e($s['update_freq'] ?? 10) ?>"></label>
    <label>Texto do rodapé<input name="footer_text" value="<?= e($s['footer_text'] ?? 'Anuncie aqui') ?>"></label>
  </div>
  <p><label style="display:inline;margin-right:16px"><input type="checkbox" name="audio" <?= !empty($s['audio']) ? 'checked' : '' ?>>Permitir som</label>
     <label style="display:inline"><input type="checkbox" name="footer_on" <?= !empty($s['footer_on']) ? 'checked' : '' ?>>Exibir rodapé com relógio</label></p>
  <button class="btn"><?= $s ? 'Salvar' : 'Criar tela' ?></button>
</form>
