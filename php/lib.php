<?php
/**
 * Yes DOOH — versao PHP para teste.
 * PHP 8+ com SQLite (PDO). Sem dependencias: basta enviar a pasta para a hospedagem.
 */
declare(strict_types=1);

const APP_NAME = 'Yes DOOH';
const ONLINE_WINDOW = 180; // segundos sem contato ate a tela ser considerada offline
const DATA_DIR = __DIR__ . '/data';
const UPLOAD_DIR = __DIR__ . '/uploads';
const MEDIA_TYPES = ['arquivo' => 'Vídeo/imagem', 'youtube' => 'Vídeo YouTube', 'aviso' => 'Aviso', 'rss' => 'Notícias (RSS)', 'hora' => 'Hora certa', 'clima' => 'Previsão do tempo', 'dolar' => 'Cotação do dólar'];
const COMMANDS = ['sincronizar' => 'Sincronizar agora', 'recarregar' => 'Reiniciar player', 'limpar_cache' => 'Limpar cache'];
const UPLOAD_TYPES = [
    'image/jpeg' => ['jpg', 'image'], 'image/png' => ['png', 'image'], 'image/webp' => ['webp', 'image'], 'image/gif' => ['gif', 'image'],
    'video/mp4' => ['mp4', 'video'], 'video/webm' => ['webm', 'video'],
];

date_default_timezone_set('America/Sao_Paulo');

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    if (!is_dir(DATA_DIR)) mkdir(DATA_DIR, 0775, true);
    $new = !file_exists(DATA_DIR . '/yesdooh.sqlite');
    $pdo = new PDO('sqlite:' . DATA_DIR . '/yesdooh.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    if ($new) install($pdo);
    return $pdo;
}

function install(PDO $pdo): void
{
    $pdo->exec(<<<'SQL'
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, pass TEXT NOT NULL);
    CREATE TABLE screens (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, orientation TEXT NOT NULL DEFAULT 'H', city TEXT, lat REAL, lng REAL,
        timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo', update_freq INTEGER NOT NULL DEFAULT 10, audio INTEGER NOT NULL DEFAULT 0,
        footer_on INTEGER NOT NULL DEFAULT 0, footer_text TEXT NOT NULL DEFAULT 'Anuncie aqui',
        code TEXT NOT NULL UNIQUE, token TEXT UNIQUE, info TEXT NOT NULL DEFAULT '{}',
        last_seen INTEGER, synced_at INTEGER, version INTEGER NOT NULL DEFAULT 1, synced_version INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE medias (
        id INTEGER PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, client TEXT, file TEXT, kind TEXT, orient TEXT NOT NULL DEFAULT 'A',
        url TEXT, config TEXT NOT NULL DEFAULT '{}', duration INTEGER NOT NULL DEFAULT 15, active INTEGER NOT NULL DEFAULT 1,
        start_date TEXT, end_date TEXT, shift_start TEXT, shift_end TEXT, week_days TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL
    );
    CREATE TABLE items (id INTEGER PRIMARY KEY, screen_id INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE, media_id INTEGER NOT NULL REFERENCES medias(id) ON DELETE CASCADE, pos INTEGER NOT NULL);
    CREATE TABLE commands (id INTEGER PRIMARY KEY, screen_id INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pendente', created INTEGER NOT NULL, executed INTEGER);
    CREATE TABLE plays (screen_id INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE, media_id INTEGER NOT NULL REFERENCES medias(id) ON DELETE CASCADE, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (screen_id, media_id, day));
    CREATE TABLE uptime (screen_id INTEGER NOT NULL REFERENCES screens(id) ON DELETE CASCADE, day TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (screen_id, day));
    SQL);
    // usuario inicial — troque a senha em "Minha conta" no primeiro acesso
    $pdo->prepare('INSERT INTO users (name, email, pass) VALUES (?, ?, ?)')->execute(['Administrador', 'admin@yesdooh.com.br', password_hash('yesdooh123', PASSWORD_DEFAULT)]);
    $add = $pdo->prepare('INSERT INTO medias (type, name, config, duration, created) VALUES (?, ?, ?, ?, ?)');
    foreach ([
        ['aviso', 'Anuncie aqui', ['text' => 'Sua marca vista por quem passa todos os dias. Fale com a gente!', 'bg' => '#0b1120', 'color' => '#f9c21a'], 10],
        ['hora', 'Hora certa', ['bg' => '#0b1120', 'color' => '#f9c21a'], 8],
        ['clima', 'Previsão do tempo', ['bg' => '#0c4a6e', 'color' => '#ffffff'], 10],
        ['dolar', 'Cotação do dólar', ['bg' => '#064e3b', 'color' => '#ffffff'], 8],
    ] as [$type, $name, $cfg, $dur]) $add->execute([$type, $name, json_encode($cfg), $dur, time()]);
    $pdo->prepare('INSERT INTO medias (type, name, url, config, duration, created) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute(['rss', 'Notícias G1', 'https://g1.globo.com/rss/g1/', json_encode(['bg' => '#111827', 'color' => '#ffffff']), 12, time()]);
}

// ---------- consultas ----------
function q(string $sql, array $args = []): PDOStatement { $st = db()->prepare($sql); $st->execute($args); return $st; }
function all(string $sql, array $args = []): array { return q($sql, $args)->fetchAll(); }
function one(string $sql, array $args = []): ?array { $r = q($sql, $args)->fetch(); return $r ?: null; }
function val(string $sql, array $args = []): mixed { return q($sql, $args)->fetchColumn(); }

// ---------- utilitarios ----------
function e(mixed $v): string { return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8'); }
function post(string $k, string $default = ''): string { return trim((string) ($_POST[$k] ?? $default)); }
function nullable(string $k): ?string { $v = post($k); return $v === '' ? null : $v; }
function is_online(?int $lastSeen): bool { return $lastSeen !== null && time() - $lastSeen < ONLINE_WINDOW; }
function redirect(string $to): never { header('Location: ' . $to); exit; }
function flash(?string $msg = null): ?string
{
    if ($msg !== null) { $_SESSION['flash'] = $msg; return null; }
    $m = $_SESSION['flash'] ?? null; unset($_SESSION['flash']); return $m;
}
function ago(?int $ts): string
{
    if (!$ts) return 'nunca';
    $d = time() - $ts;
    if ($d < 60) return 'agora mesmo';
    if ($d < 3600) return 'há ' . intdiv($d, 60) . ' min';
    if ($d < 86400) return 'há ' . intdiv($d, 3600) . ' h';
    return 'há ' . intdiv($d, 86400) . ' dia(s)';
}
function duration(int $s): string { return intdiv($s, 60) . ':' . str_pad((string) ($s % 60), 2, '0', STR_PAD_LEFT); }
function pairing_code(): string
{
    $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do { $c = ''; for ($i = 0; $i < 6; $i++) $c .= $abc[random_int(0, 31)]; } while (val('SELECT 1 FROM screens WHERE code = ?', [$c]));
    return $c;
}
function youtube_id(string $url): ?string { return preg_match('~(?:youtu\.be/|v=|embed/|shorts/)([\w-]{11})~', $url, $m) ? $m[1] : null; }
function bump(int $screenId): void { q('UPDATE screens SET version = version + 1 WHERE id = ?', [$screenId]); }
function bump_media(int $mediaId): void { q('UPDATE screens SET version = version + 1 WHERE id IN (SELECT screen_id FROM items WHERE media_id = ?)', [$mediaId]); }
/** Uma midia de arquivo so toca em telas da orientacao escolhida ("A" = ambas). */
function compatible(array $media, string $orientation): bool { return $media['type'] !== 'arquivo' || $media['orient'] === 'A' || $media['orient'] === $orientation; }

// ---------- sessao, login e CSRF ----------
function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS']), 'path' => '/']);
    session_name('yd_php');
    session_start();
}
function user(): ?array { start_session(); return isset($_SESSION['uid']) ? one('SELECT * FROM users WHERE id = ?', [$_SESSION['uid']]) : null; }
function require_login(): array { $u = user(); if (!$u) redirect('index.php?p=login'); return $u; }
function csrf(): string { start_session(); return $_SESSION['csrf'] ??= bin2hex(random_bytes(16)); }
function csrf_field(): string { return '<input type="hidden" name="csrf" value="' . csrf() . '">'; }
function check_csrf(): void { if (!hash_equals(csrf(), (string) ($_POST['csrf'] ?? ''))) { http_response_code(400); exit('Sessão expirada. Volte e tente novamente.'); } }

// ---------- envio de arquivos ----------
/** Valida pelo conteudo real do arquivo e grava com nome aleatorio. Devolve [arquivo, tipo] ou uma mensagem de erro. */
function save_upload(array $f): array|string
{
    if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) return 'Falha no envio do arquivo (verifique o limite de tamanho da hospedagem).';
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    if (!isset(UPLOAD_TYPES[$mime])) return 'Formato não aceito. Envie JPG, PNG, WEBP, GIF, MP4 ou WEBM.';
    [$ext, $kind] = UPLOAD_TYPES[$mime];
    if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0775, true);
    $name = bin2hex(random_bytes(12)) . '.' . $ext;
    if (!move_uploaded_file($f['tmp_name'], UPLOAD_DIR . '/' . $name)) return 'Não foi possível gravar o arquivo (permissão da pasta uploads).';
    return [$name, $kind];
}
function delete_upload(?string $file): void { if ($file && preg_match('/^[a-f0-9]{24}\.\w+$/', $file)) @unlink(UPLOAD_DIR . '/' . $file); }

// ---------- layout ----------
function layout(string $title, string $body, string $active = ''): void
{
    $u = user();
    $nav = '';
    foreach (['dashboard' => 'Dashboard', 'telas' => 'Minhas telas', 'midias' => 'Conteúdos', 'relatorio' => 'Relatório', 'conta' => 'Minha conta'] as $p => $label)
        $nav .= '<a href="index.php?p=' . $p . '"' . ($active === $p ? ' class="on"' : '') . '>' . $label . '</a>';
    $flash = flash();
    ?><!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($title) ?> — <?= APP_NAME ?></title>
<style>
:root{--ink:#0b1120;--ink2:#161d2e;--line:#e6eaf2;--mute:#7384a3;--brand:#f9c21a;--bg:#f4f6fa}
*{box-sizing:border-box}body{margin:0;font:15px/1.45 system-ui,Segoe UI,Roboto,sans-serif;background:var(--bg);color:#161d2e}
a{color:inherit}header{background:var(--ink);color:#fff;display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;padding:12px 20px}
.logo{font-weight:900;font-size:19px;text-decoration:none}.logo b{color:var(--brand)}
nav{display:flex;flex-wrap:wrap;gap:4px;flex:1}nav a{padding:7px 12px;border-radius:8px;text-decoration:none;color:#cdd5e3;font-weight:600;font-size:14px}
nav a:hover{background:var(--ink2);color:#fff}nav a.on{background:var(--brand);color:var(--ink)}
main{max-width:1100px;margin:0 auto;padding:24px 16px}h1{font-size:24px;margin:0 0 18px}h2{font-size:16px;margin:0 0 12px}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:18px;overflow-x:auto}
.grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.row{display:flex;flex-wrap:wrap;gap:10px;align-items:end}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mute);padding:8px}
td{padding:9px 8px;border-top:1px solid var(--line);vertical-align:middle}
label{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#52627f;margin-bottom:10px}
input,select,textarea{display:block;width:100%;margin-top:4px;padding:8px 10px;border:1px solid #cdd5e3;border-radius:8px;font:inherit;background:#fff;text-transform:none;font-weight:400;letter-spacing:0;color:#161d2e}
input[type=checkbox]{display:inline;width:auto;margin:0 6px 0 0}input[type=color]{padding:2px;height:38px}
.btn{display:inline-block;border:0;border-radius:8px;padding:9px 14px;font:inherit;font-weight:700;cursor:pointer;background:var(--brand);color:var(--ink);text-decoration:none;width:auto;margin:0}
.btn.ghost{background:#fff;border:1px solid #cdd5e3;color:#283247}.btn.red{background:#dc2626;color:#fff}.btn.sm{padding:5px 9px;font-size:13px}
.badge{display:inline-block;border-radius:99px;padding:2px 9px;font-size:12px;font-weight:700;background:#e6eaf2;color:#52627f}.badge.ok{background:#d1fae5;color:#047857}.badge.warn{background:#ffefb8;color:#8f6500}
.mute{color:var(--mute);font-size:13px}.big{font-size:30px;font-weight:900;line-height:1}.flash{background:#d1fae5;color:#065f46;padding:10px 14px;border-radius:8px;margin-bottom:16px}
.code{font:900 34px monospace;letter-spacing:.3em}form.inline{display:inline}.bars{display:flex;align-items:flex-end;gap:6px;height:110px}
.bars div{flex:1;background:var(--ink);border-radius:4px 4px 0 0;min-height:2px}.thumb{width:72px;height:42px;object-fit:cover;border-radius:6px;background:var(--ink);display:block}
</style></head><body>
<?php if ($u): ?><header><a class="logo" href="index.php">Yes<b>DOOH</b></a><nav><?= $nav ?></nav>
<form method="post" action="index.php?p=sair" class="inline"><?= csrf_field() ?><button class="btn ghost sm">Sair</button></form></header><?php endif ?>
<main><?php if ($flash): ?><div class="flash" role="status"><?= e($flash) ?></div><?php endif ?>
<?= $body ?></main></body></html><?php
}
