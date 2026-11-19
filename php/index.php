<?php
/** Painel (retaguarda). Cada pagina: ?p=nome. As acoes chegam por POST com o campo "acao". */
declare(strict_types=1);
require __DIR__ . '/lib.php';

start_session();
$p = preg_replace('/\W/', '', $_GET['p'] ?? 'dashboard');
$isPost = $_SERVER['REQUEST_METHOD'] === 'POST';
if ($isPost) check_csrf();

// ---------- login ----------
if ($p === 'login') {
    $error = '';
    if ($isPost) {
        $u = one('SELECT * FROM users WHERE email = ?', [strtolower(post('email'))]);
        if ($u && password_verify(post('senha'), $u['pass'])) {
            session_regenerate_id(true);
            $_SESSION['uid'] = $u['id'];
            redirect('index.php');
        }
        $error = 'E-mail ou senha inválidos.';
    }
    ob_start(); ?>
    <div class="card" style="max-width:380px;margin:8vh auto">
      <p class="logo" style="color:#0b1120;font-size:26px;margin:0 0 4px">Yes<b>DOOH</b></p>
      <p class="mute" style="margin:0 0 16px">Gestão de mídia indoor — versão PHP de teste</p>
      <?php if ($error): ?><p class="flash" style="background:#fee2e2;color:#991b1b" role="alert"><?= e($error) ?></p><?php endif ?>
      <form method="post"><?= csrf_field() ?>
        <label>E-mail<input type="email" name="email" required value="<?= e(post('email')) ?>"></label>
        <label>Senha<input type="password" name="senha" required></label>
        <button class="btn" style="width:100%">Entrar</button>
      </form>
    </div>
    <?php layout('Entrar', ob_get_clean()); exit;
}
if ($p === 'sair' && $isPost) { session_destroy(); redirect('index.php?p=login'); }

$user = require_login();
$id = (int) ($_GET['id'] ?? 0);

// ---------- acoes ----------
if ($isPost) {
    switch (post('acao')) {
        case 'tela_salvar':
            $data = [post('name'), post('orientation') === 'V' ? 'V' : 'H', nullable('city'), nullable('lat'), nullable('lng'), post('timezone') ?: 'America/Sao_Paulo',
                max(1, (int) post('update_freq', '10')), isset($_POST['audio']) ? 1 : 0, isset($_POST['footer_on']) ? 1 : 0, post('footer_text')];
            if ($data[0] === '') { flash('Informe o nome da tela.'); redirect('index.php?p=telas'); }
            if ($id) { q('UPDATE screens SET name=?, orientation=?, city=?, lat=?, lng=?, timezone=?, update_freq=?, audio=?, footer_on=?, footer_text=?, version=version+1 WHERE id=?', [...$data, $id]); }
            else { q('INSERT INTO screens (name, orientation, city, lat, lng, timezone, update_freq, audio, footer_on, footer_text, code) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [...$data, pairing_code()]); $id = (int) db()->lastInsertId(); }
            flash('Tela salva.'); redirect("index.php?p=tela&id=$id");
        case 'tela_resetar':
            q("UPDATE screens SET token=NULL, info='{}', last_seen=NULL, synced_at=NULL, synced_version=0, code=? WHERE id=?", [pairing_code(), $id]);
            flash('Dispositivo desvinculado. Use o novo código para parear.'); redirect("index.php?p=tela&id=$id");
        case 'tela_excluir':
            q('DELETE FROM screens WHERE id=?', [$id]); flash('Tela excluída.'); redirect('index.php?p=telas');
        case 'comando':
            if (isset(COMMANDS[post('type')])) q('INSERT INTO commands (screen_id, type, created) VALUES (?,?,?)', [$id, post('type'), time()]);
            flash('Comando enviado. A tela executa em até 1 minuto.'); redirect("index.php?p=tela&id=$id");
        case 'item_add':
            $m = one('SELECT * FROM medias WHERE id=?', [(int) post('media_id')]);
            $s = one('SELECT * FROM screens WHERE id=?', [$id]);
            if ($m && $s) {
                if (!compatible($m, $s['orientation'])) flash('Esta mídia não tem a orientação desta tela.');
                else { q('INSERT INTO items (screen_id, media_id, pos) VALUES (?,?, (SELECT COALESCE(MAX(pos),0)+1 FROM items WHERE screen_id=?))', [$id, $m['id'], $id]); bump($id); }
            }
            redirect("index.php?p=tela&id=$id#playlist");
        case 'item_del':
            q('DELETE FROM items WHERE id=? AND screen_id=?', [(int) post('item'), $id]); bump($id); redirect("index.php?p=tela&id=$id#playlist");
        case 'item_mover': // troca de posicao com o vizinho de cima ou de baixo
            $items = all('SELECT id, pos FROM items WHERE screen_id=? ORDER BY pos, id', [$id]);
            $i = array_search((int) post('item'), array_column($items, 'id'), true);
            $j = $i === false ? false : $i + (post('dir') === 'up' ? -1 : 1);
            if ($i !== false && isset($items[$j])) { [$items[$i], $items[$j]] = [$items[$j], $items[$i]]; foreach ($items as $n => $it) q('UPDATE items SET pos=? WHERE id=?', [$n + 1, $it['id']]); bump($id); }
            redirect("index.php?p=tela&id=$id#playlist");
        case 'midia_salvar':
            $cur = $id ? one('SELECT * FROM medias WHERE id=?', [$id]) : null;
            $type = $cur['type'] ?? post('type');
            if (!isset(MEDIA_TYPES[$type])) redirect('index.php?p=midias');
            $name = post('name') ?: MEDIA_TYPES[$type];
            $file = $cur['file'] ?? null; $kind = $cur['kind'] ?? null; $url = null;
            if ($type === 'arquivo') {
                if (!empty($_FILES['file']['name'])) {
                    $up = save_upload($_FILES['file']);
                    if (is_string($up)) { flash($up); redirect('index.php?p=midias'); }
                    delete_upload($file); [$file, $kind] = $up;
                } elseif (!$cur) { flash('Escolha um arquivo de imagem ou vídeo.'); redirect('index.php?p=midias'); }
            }
            if ($type === 'youtube') { $url = post('url'); if (!youtube_id($url)) { flash('Informe um link válido do YouTube.'); redirect('index.php?p=midias'); } }
            if ($type === 'rss') { $url = post('url'); if (!preg_match('~^https?://~', $url)) { flash('Informe o endereço do feed (http/https).'); redirect('index.php?p=midias'); } }
            $color = fn(string $k, string $d) => preg_match('/^#[0-9a-f]{6}$/i', post($k)) ? post($k) : $d;
            $cfg = json_encode(['text' => mb_substr(post('text'), 0, 400), 'bg' => $color('bg', '#0b1120'), 'color' => $color('color', '#ffffff')]);
            $data = [$name, nullable('client'), $file, $kind, in_array(post('orient'), ['H', 'V'], true) ? post('orient') : 'A', $url, $cfg, max(3, min(3600, (int) post('duration', '15'))),
                nullable('start_date'), nullable('end_date'), nullable('shift_start'), nullable('shift_end'), implode(',', array_map('intval', $_POST['week_days'] ?? []))];
            if ($cur) q('UPDATE medias SET name=?, client=?, file=?, kind=?, orient=?, url=?, config=?, duration=?, start_date=?, end_date=?, shift_start=?, shift_end=?, week_days=? WHERE id=?', [...$data, $id]);
            else { q('INSERT INTO medias (name, client, file, kind, orient, url, config, duration, start_date, end_date, shift_start, shift_end, week_days, type, created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [...$data, $type, time()]); $id = (int) db()->lastInsertId(); }
            // inclusao rapida: a midia fica exatamente nas telas marcadas
            $want = array_map('intval', $_POST['screens'] ?? []);
            foreach (all('SELECT id, orientation FROM screens') as $s) {
                $has = (bool) val('SELECT 1 FROM items WHERE screen_id=? AND media_id=?', [$s['id'], $id]);
                if (in_array($s['id'], $want, true) && !$has) q('INSERT INTO items (screen_id, media_id, pos) VALUES (?,?, (SELECT COALESCE(MAX(pos),0)+1 FROM items WHERE screen_id=?))', [$s['id'], $id, $s['id']]);
                elseif (!in_array($s['id'], $want, true) && $has) { q('DELETE FROM items WHERE screen_id=? AND media_id=?', [$s['id'], $id]); bump($s['id']); }
            }
            bump_media($id); flash('Conteúdo salvo.'); redirect('index.php?p=midias');
        case 'midia_ativar':
            q('UPDATE medias SET active = 1 - active WHERE id=?', [$id]); bump_media($id); redirect('index.php?p=midias');
        case 'midia_excluir':
            $m = one('SELECT * FROM medias WHERE id=?', [$id]);
            if ($m) { bump_media($id); q('DELETE FROM medias WHERE id=?', [$id]); delete_upload($m['file']); }
            flash('Conteúdo excluído.'); redirect('index.php?p=midias');
        case 'conta':
            if (post('nova') !== '') {
                if (strlen(post('nova')) < 8) flash('A nova senha precisa ter ao menos 8 caracteres.');
                elseif (!password_verify(post('atual'), $user['pass'])) flash('Senha atual incorreta.');
                else { q('UPDATE users SET name=?, pass=? WHERE id=?', [post('name') ?: $user['name'], password_hash(post('nova'), PASSWORD_DEFAULT), $user['id']]); flash('Senha alterada.'); }
            } else { q('UPDATE users SET name=? WHERE id=?', [post('name') ?: $user['name'], $user['id']]); flash('Dados salvos.'); }
            redirect('index.php?p=conta');
    }
    redirect('index.php');
}

// ---------- paginas ----------
$days = fn(int $n) => array_map(fn($i) => date('Y-m-d', time() - ($n - 1 - $i) * 86400), range(0, $n - 1));
$bars = function (array $values): string {
    $max = max(1, ...array_values($values)); $h = '';
    foreach ($values as $label => $v) $h .= '<div title="' . e("$label: $v") . '" style="height:' . max(2, round($v / $max * 100)) . '%"></div>';
    return '<div class="bars" role="img" aria-label="Gráfico de barras">' . $h . '</div>';
};
$thumb = function (array $m): string {
    if ($m['type'] === 'arquivo' && $m['kind'] === 'image') return '<img class="thumb" src="uploads/' . e($m['file']) . '" alt="">';
    if ($m['type'] === 'youtube' && ($y = youtube_id((string) $m['url']))) return '<img class="thumb" src="https://i.ytimg.com/vi/' . $y . '/mqdefault.jpg" alt="">';
    $c = json_decode($m['config'], true) ?: [];
    return '<span class="thumb" style="background:' . e($c['bg'] ?? '#0b1120') . '"></span>';
};
ob_start();

if ($p === 'dashboard') {
    $screens = all('SELECT * FROM screens');
    $online = count(array_filter($screens, fn($s) => is_online($s['last_seen'] === null ? null : (int) $s['last_seen'])));
    $d7 = $days(7);
    $views = array_fill_keys($d7, 0);
    foreach (all('SELECT day, SUM(count) c FROM plays WHERE day >= ? GROUP BY day', [$d7[0]]) as $r) $views[$r['day']] = (int) $r['c']; ?>
    <h1>Sua rede de telas</h1>
    <div class="grid">
      <div class="card"><h2>Tempo real</h2><p><span class="big" style="color:#059669"><?= $online ?></span> online &nbsp; <span class="big" style="color:#7384a3"><?= count($screens) - $online ?></span> offline</p></div>
      <div class="card"><h2>Conteúdos</h2><p><span class="big"><?= (int) val('SELECT COUNT(*) FROM medias WHERE active=1') ?></span> ativos</p></div>
      <div class="card"><h2>Exibições hoje</h2><p><span class="big"><?= number_format($views[date('Y-m-d')], 0, ',', '.') ?></span></p></div>
    </div>
    <div class="card"><h2>Exibições nos últimos 7 dias</h2><?= $bars($views) ?><p class="mute"><?= e(date('d/m', strtotime($d7[0]))) ?> a <?= date('d/m') ?></p></div>
    <?php if (!$screens): ?><div class="card">Comece cadastrando uma tela em <a href="index.php?p=telas"><b>Minhas telas</b></a>.</div><?php endif;
}

if ($p === 'telas') {
    $rows = all('SELECT s.*, (SELECT COUNT(*) FROM items WHERE screen_id = s.id) n FROM screens s ORDER BY name'); ?>
    <h1>Minhas telas</h1>
    <div class="card">
      <?php if (!$rows): ?><p class="mute">Nenhuma tela cadastrada ainda.</p><?php else: ?>
      <table><tr><th>Tela</th><th>Status</th><th>Playlist</th><th>Última comunicação</th><th></th></tr>
      <?php foreach ($rows as $s): $on = is_online($s['last_seen'] === null ? null : (int) $s['last_seen']); ?>
        <tr><td><b><?= e($s['name']) ?></b><br><span class="mute"><?= $s['orientation'] === 'V' ? 'Vertical' : 'Horizontal' ?><?= $s['city'] ? ' · ' . e($s['city']) : '' ?></span></td>
        <td><?= !$s['token'] ? '<span class="badge warn">Aguardando pareamento · ' . e($s['code']) . '</span>' : ($on ? '<span class="badge ok">Online</span>' : '<span class="badge">Offline</span>') ?></td>
        <td><?= (int) $s['n'] ?> conteúdos<?= $s['token'] ? '<br><span class="mute">' . ($s['synced_version'] >= $s['version'] ? 'Sincronizada' : 'Aguardando sincronização') . '</span>' : '' ?></td>
        <td class="mute"><?= ago($s['last_seen'] === null ? null : (int) $s['last_seen']) ?></td>
        <td><a class="btn ghost sm" href="index.php?p=tela&id=<?= $s['id'] ?>">Abrir</a></td></tr>
      <?php endforeach ?></table><?php endif ?>
    </div>
    <div class="card"><h2>Nova tela</h2><?php $s = null; $action = 'index.php?p=telas'; include __DIR__ . '/tela_form.php'; ?></div>
<?php }

if ($p === 'tela') {
    $s = one('SELECT * FROM screens WHERE id=?', [$id]);
    if (!$s) redirect('index.php?p=telas');
    $on = is_online($s['last_seen'] === null ? null : (int) $s['last_seen']);
    $items = all('SELECT i.id item, m.* FROM items i JOIN medias m ON m.id = i.media_id WHERE i.screen_id=? ORDER BY i.pos, i.id', [$id]);
    $cycle = array_sum(array_column($items, 'duration'));
    $info = json_decode($s['info'], true) ?: [];
    $medias = array_filter(all('SELECT * FROM medias WHERE active=1 ORDER BY type, name'), fn($m) => compatible($m, $s['orientation']));
    $cmds = all('SELECT * FROM commands WHERE screen_id=? ORDER BY id DESC LIMIT 6', [$id]); ?>
    <p class="mute"><a href="index.php?p=telas">Minhas telas</a> / <?= e($s['name']) ?></p>
    <h1><?= e($s['name']) ?> <?= !$s['token'] ? '<span class="badge warn">Aguardando pareamento</span>' : ($on ? '<span class="badge ok">Online</span>' : '<span class="badge">Offline · ' . ago((int) $s['last_seen']) . '</span>') ?></h1>
    <?php if (!$s['token']): ?>
    <div class="card" style="text-align:center;background:#fff9e6;border-color:#ffd54a"><h2>Parear dispositivo</h2>
      <p>No aplicativo Android (ou no navegador do aparelho, em <b>/player</b>), digite o código:</p><p class="code"><?= e($s['code']) ?></p></div>
    <?php endif ?>
    <div class="card" id="playlist"><h2>Playlist — <?= count($items) ?> mídias · <?= duration((int) $cycle) ?> de ciclo</h2>
      <?php if (!$items): ?><p class="mute">Nenhum conteúdo nesta playlist ainda.</p><?php else: ?>
      <table><?php foreach ($items as $n => $m): ?>
        <tr><td style="width:84px"><?= $thumb($m) ?></td><td><b><?= e($m['name']) ?></b><br><span class="mute"><?= e(MEDIA_TYPES[$m['type']]) ?> · <?= duration((int) $m['duration']) ?><?= $m['client'] ? ' · ' . e($m['client']) : '' ?></span></td>
        <td style="text-align:right;white-space:nowrap">
          <?php foreach ([['item_mover', 'up', '↑', 'Subir', $n === 0], ['item_mover', 'down', '↓', 'Descer', $n === count($items) - 1], ['item_del', '', '✕', 'Remover', false]] as [$a, $dir, $txt, $t, $off]): ?>
          <form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="acao" value="<?= $a ?>"><input type="hidden" name="item" value="<?= $m['item'] ?>"><input type="hidden" name="dir" value="<?= $dir ?>">
            <button class="btn ghost sm" title="<?= $t ?>" aria-label="<?= $t ?> <?= e($m['name']) ?>" <?= $off ? 'disabled' : '' ?>><?= $txt ?></button></form>
          <?php endforeach ?></td></tr>
      <?php endforeach ?></table><?php endif ?>
      <form method="post" class="row" style="margin-top:14px"><?= csrf_field() ?><input type="hidden" name="acao" value="item_add">
        <label style="flex:1;margin:0">Adicionar conteúdo<select name="media_id" required><option value="">Selecione...</option>
          <?php foreach ($medias as $m): ?><option value="<?= $m['id'] ?>"><?= e(MEDIA_TYPES[$m['type']] . ' — ' . $m['name']) ?></option><?php endforeach ?></select></label>
        <button class="btn">Adicionar</button></form>
      <p class="mute">Cada alteração já vale: a tela se atualiza sozinha em até 1 minuto.</p>
    </div>
    <div class="grid">
      <div class="card"><h2>Dispositivo</h2>
        <p class="mute">Modelo</p><p><b><?= e($info['model'] ?? '—') ?></b></p><p class="mute">Sistema / app</p><p><b><?= e(($info['os'] ?? '—') . ' · ' . ($info['app'] ?? '—')) ?></b></p>
        <p class="mute">Resolução</p><p><b><?= e($info['resolution'] ?? '—') ?></b></p><p class="mute">Última sincronização</p><p><b><?= ago($s['synced_at'] === null ? null : (int) $s['synced_at']) ?></b></p></div>
      <div class="card"><h2>Comandos remotos</h2>
        <form method="post" class="row"><?= csrf_field() ?><input type="hidden" name="acao" value="comando">
          <label style="flex:1;margin:0">Comando<select name="type"><?php foreach (COMMANDS as $k => $l): ?><option value="<?= $k ?>"><?= e($l) ?></option><?php endforeach ?></select></label>
          <button class="btn" <?= $s['token'] ? '' : 'disabled' ?>>Enviar</button></form>
        <?php foreach ($cmds as $c): ?><p class="mute"><?= e(COMMANDS[$c['type']] ?? $c['type']) ?> — <?= $c['status'] === 'executado' ? 'executado ' . ago((int) $c['executed']) : 'pendente' ?></p><?php endforeach ?></div>
    </div>
    <div class="card"><h2>Editar tela</h2><?php $action = "index.php?p=tela&id=$id"; include __DIR__ . '/tela_form.php'; ?></div>
    <div class="card"><h2>Zona de risco</h2><div class="row">
      <form method="post" onsubmit="return confirm('Desvincular o dispositivo desta tela?')"><?= csrf_field() ?><input type="hidden" name="acao" value="tela_resetar"><button class="btn ghost">Resetar pareamento</button></form>
      <form method="post" onsubmit="return confirm('Excluir esta tela, a playlist e o histórico? Não dá para desfazer.')"><?= csrf_field() ?><input type="hidden" name="acao" value="tela_excluir"><button class="btn red">Excluir tela</button></form>
    </div></div>
<?php }

if ($p === 'midias') {
    $rows = all('SELECT m.*, (SELECT COUNT(DISTINCT screen_id) FROM items WHERE media_id = m.id) n FROM medias m ORDER BY created DESC, id DESC');
    $edit = $id ? one('SELECT * FROM medias WHERE id=?', [$id]) : null;
    $screens = all('SELECT id, name, orientation FROM screens ORDER BY name');
    $onScreens = $edit ? array_map('intval', array_column(all('SELECT DISTINCT screen_id FROM items WHERE media_id=?', [$id]), 'screen_id')) : [];
    $cfg = $edit ? (json_decode($edit['config'], true) ?: []) : [];
    $type = $edit['type'] ?? (isset(MEDIA_TYPES[$_GET['tipo'] ?? '']) ? $_GET['tipo'] : 'arquivo'); ?>
    <h1>Conteúdos</h1>
    <div class="card"><h2><?= $edit ? 'Editar: ' . e($edit['name']) : 'Novo conteúdo' ?></h2>
      <?php if (!$edit): ?><p><?php foreach (MEDIA_TYPES as $k => $l): ?><a class="btn sm <?= $k === $type ? '' : 'ghost' ?>" href="index.php?p=midias&tipo=<?= $k ?>"><?= e($l) ?></a> <?php endforeach ?></p><?php endif ?>
      <form method="post" enctype="multipart/form-data" action="index.php?p=midias<?= $edit ? "&id=$id" : '' ?>"><?= csrf_field() ?>
        <input type="hidden" name="acao" value="midia_salvar"><input type="hidden" name="type" value="<?= e($type) ?>">
        <div class="grid">
          <label>Nome<input name="name" maxlength="75" value="<?= e($edit['name'] ?? '') ?>" placeholder="<?= e(MEDIA_TYPES[$type]) ?>"></label>
          <label>Duração (segundos)<input type="number" name="duration" min="3" max="3600" value="<?= e($edit['duration'] ?? ($type === 'arquivo' ? 15 : 10)) ?>"></label>
          <?php if ($type === 'arquivo'): ?>
          <label>Arquivo (JPG, PNG, WEBP, GIF, MP4, WEBM)<input type="file" name="file" accept="image/*,video/mp4,video/webm" <?= $edit ? '' : 'required' ?>></label>
          <label>Orientação do arquivo<select name="orient"><?php foreach (['A' => 'Serve para ambas', 'H' => 'Horizontal', 'V' => 'Vertical'] as $k => $l): ?><option value="<?= $k ?>" <?= ($edit['orient'] ?? 'A') === $k ? 'selected' : '' ?>><?= $l ?></option><?php endforeach ?></select></label>
          <label>Cliente / anunciante<input name="client" value="<?= e($edit['client'] ?? '') ?>" placeholder="Avulso"></label>
          <?php endif ?>
          <?php if ($type === 'youtube' || $type === 'rss'): ?><label><?= $type === 'rss' ? 'Endereço do feed RSS' : 'Link do vídeo no YouTube' ?><input type="url" name="url" required value="<?= e($edit['url'] ?? '') ?>"></label><?php endif ?>
          <?php if ($type === 'youtube'): ?><label>Cliente / anunciante<input name="client" value="<?= e($edit['client'] ?? '') ?>" placeholder="Avulso"></label><?php endif ?>
          <?php if (!in_array($type, ['arquivo', 'youtube'], true)): ?>
          <label>Cor de fundo<input type="color" name="bg" value="<?= e($cfg['bg'] ?? '#0b1120') ?>"></label>
          <label>Cor do texto<input type="color" name="color" value="<?= e($cfg['color'] ?? '#ffffff') ?>"></label>
          <?php endif ?>
        </div>
        <?php if ($type === 'aviso'): ?><label>Texto do aviso (até 400 caracteres)<textarea name="text" rows="3" maxlength="400" required><?= e($cfg['text'] ?? '') ?></textarea></label><?php endif ?>
        <details <?= $edit && ($edit['start_date'] || $edit['end_date'] || $edit['shift_start'] || $edit['week_days'] !== '') ? 'open' : '' ?>><summary><b>Agendamento</b> <span class="mute">(em branco = sempre)</span></summary>
          <div class="grid" style="margin-top:10px">
            <label>Início<input type="date" name="start_date" value="<?= e($edit['start_date'] ?? '') ?>"></label><label>Fim<input type="date" name="end_date" value="<?= e($edit['end_date'] ?? '') ?>"></label>
            <label>Turno — das<input type="time" name="shift_start" value="<?= e($edit['shift_start'] ?? '') ?>"></label><label>Turno — até<input type="time" name="shift_end" value="<?= e($edit['shift_end'] ?? '') ?>"></label>
          </div>
          <p><?php $wd = $edit ? explode(',', $edit['week_days']) : []; foreach (['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as $i => $d): ?><label style="display:inline;margin-right:10px"><input type="checkbox" name="week_days[]" value="<?= $i ?>" <?= $edit && $edit['week_days'] !== '' && in_array((string) $i, $wd, true) ? 'checked' : '' ?>><?= $d ?></label><?php endforeach ?></p>
        </details>
        <?php if ($screens): ?><p style="margin-top:12px"><b>Exibir nas telas:</b><br><?php foreach ($screens as $s): ?><label style="display:inline-block;margin:6px 14px 0 0"><input type="checkbox" name="screens[]" value="<?= $s['id'] ?>" <?= in_array((int) $s['id'], $onScreens, true) ? 'checked' : '' ?>><?= e($s['name']) ?></label><?php endforeach ?></p><?php endif ?>
        <p><button class="btn">Salvar</button> <?php if ($edit): ?><a class="btn ghost" href="index.php?p=midias">Cancelar</a><?php endif ?></p>
      </form>
    </div>
    <div class="card"><table><tr><th></th><th>Conteúdo</th><th>Telas</th><th>Status</th><th></th></tr>
      <?php foreach ($rows as $m): ?>
      <tr><td style="width:84px"><?= $thumb($m) ?></td>
        <td><b><?= e($m['name']) ?></b><br><span class="mute"><?= e(MEDIA_TYPES[$m['type']]) ?> · <?= duration((int) $m['duration']) ?><?= $m['client'] ? ' · ' . e($m['client']) : '' ?><?= $m['end_date'] ? ' · até ' . e(date('d/m/Y', strtotime($m['end_date']))) : '' ?></span></td>
        <td><?= (int) $m['n'] ?></td><td><?= $m['active'] ? '<span class="badge ok">Ativo</span>' : '<span class="badge">Inativo</span>' ?></td>
        <td style="text-align:right;white-space:nowrap">
          <form method="post" class="inline" action="index.php?p=midias&id=<?= $m['id'] ?>"><?= csrf_field() ?><input type="hidden" name="acao" value="midia_ativar"><button class="btn ghost sm"><?= $m['active'] ? 'Desativar' : 'Ativar' ?></button></form>
          <a class="btn ghost sm" href="index.php?p=midias&id=<?= $m['id'] ?>">Editar</a>
          <form method="post" class="inline" action="index.php?p=midias&id=<?= $m['id'] ?>" onsubmit="return confirm('Excluir este conteúdo de todas as playlists?')"><?= csrf_field() ?><input type="hidden" name="acao" value="midia_excluir"><button class="btn red sm">Excluir</button></form>
        </td></tr>
      <?php endforeach ?></table></div>
<?php }

if ($p === 'relatorio') {
    $valid = fn(string $k, string $d) => preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET[$k] ?? '') ? $_GET[$k] : $d;
    $de = $valid('de', date('Y-m-01')); $ate = $valid('ate', date('Y-m-d')); $tela = (int) ($_GET['tela'] ?? 0);
    $args = [$de, $ate]; $w = '';
    if ($tela) { $w = ' AND p.screen_id = ?'; $args[] = $tela; }
    $byMedia = all("SELECT m.name, m.client, m.duration, SUM(p.count) c, COUNT(DISTINCT p.screen_id) t FROM plays p JOIN medias m ON m.id = p.media_id WHERE p.day BETWEEN ? AND ?$w GROUP BY m.id ORDER BY c DESC", $args);
    $byScreen = all("SELECT s.name, SUM(p.count) c FROM plays p JOIN screens s ON s.id = p.screen_id WHERE p.day BETWEEN ? AND ?$w GROUP BY s.id ORDER BY c DESC", $args);
    if (isset($_GET['csv'])) { // exporta para enviar ao anunciante
        ob_end_clean();
        header('Content-Type: text/csv; charset=utf-8'); header("Content-Disposition: attachment; filename=\"exibicoes-$de-a-$ate.csv\"");
        $out = fopen('php://output', 'w'); fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, ['Mídia', 'Cliente', 'Exibições', 'Tempo no ar (s)', 'Telas', 'De', 'Até'], ';');
        foreach ($byMedia as $r) fputcsv($out, [$r['name'], $r['client'] ?: 'Avulso', $r['c'], $r['c'] * $r['duration'], $r['t'], $de, $ate], ';');
        exit;
    } ?>
    <h1>Relatório de exibições</h1>
    <form class="card row"><input type="hidden" name="p" value="relatorio">
      <label style="margin:0">De<input type="date" name="de" value="<?= e($de) ?>"></label><label style="margin:0">Até<input type="date" name="ate" value="<?= e($ate) ?>"></label>
      <label style="margin:0">Tela<select name="tela"><option value="0">Todas</option><?php foreach (all('SELECT id, name FROM screens ORDER BY name') as $s): ?><option value="<?= $s['id'] ?>" <?= $tela === (int) $s['id'] ? 'selected' : '' ?>><?= e($s['name']) ?></option><?php endforeach ?></select></label>
      <button class="btn">Aplicar</button> <button class="btn ghost" name="csv" value="1">Exportar CSV</button></form>
    <div class="grid">
      <div class="card"><h2>Por mídia</h2><?php if (!$byMedia): ?><p class="mute">Nenhuma exibição no período.</p><?php else: ?><table><tr><th>Mídia</th><th>Exibições</th><th>Telas</th></tr>
        <?php foreach ($byMedia as $r): ?><tr><td><b><?= e($r['name']) ?></b><br><span class="mute"><?= e($r['client'] ?: 'Avulso') ?></span></td><td><?= number_format((int) $r['c'], 0, ',', '.') ?></td><td><?= (int) $r['t'] ?></td></tr><?php endforeach ?></table><?php endif ?></div>
      <div class="card"><h2>Por tela</h2><?php if (!$byScreen): ?><p class="mute">Nenhuma exibição no período.</p><?php else: ?><table><tr><th>Tela</th><th>Exibições</th></tr>
        <?php foreach ($byScreen as $r): ?><tr><td><b><?= e($r['name']) ?></b></td><td><?= number_format((int) $r['c'], 0, ',', '.') ?></td></tr><?php endforeach ?></table><?php endif ?></div>
    </div>
<?php }

if ($p === 'conta') { ?>
    <h1>Minha conta</h1>
    <div class="card" style="max-width:460px"><form method="post"><?= csrf_field() ?><input type="hidden" name="acao" value="conta">
      <label>Nome<input name="name" value="<?= e($user['name']) ?>" required></label>
      <label>E-mail<input value="<?= e($user['email']) ?>" disabled></label>
      <label>Senha atual<input type="password" name="atual" autocomplete="current-password"></label>
      <label>Nova senha (em branco = manter)<input type="password" name="nova" minlength="8" autocomplete="new-password"></label>
      <button class="btn">Salvar</button></form></div>
<?php }

$titles = ['dashboard' => 'Dashboard', 'telas' => 'Minhas telas', 'tela' => 'Tela', 'midias' => 'Conteúdos', 'relatorio' => 'Relatório', 'conta' => 'Minha conta'];
if (!isset($titles[$p])) redirect('index.php');
layout($titles[$p], ob_get_clean(), $p === 'tela' ? 'telas' : $p);
