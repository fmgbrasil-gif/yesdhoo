<?php
/**
 * API do player: api.php?a=pair | sync | heartbeat | widget
 * Mesmo contrato da versao Node, para que o mesmo aplicativo Android funcione nas duas.
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';

function out(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function body(): array { return json_decode(file_get_contents('php://input') ?: '', true) ?: []; }
function device_screen(): array
{
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? $_SERVER['HTTP_X_DEVICE_TOKEN'] ?? '';
    $token = preg_replace('/^Bearer\s+/i', '', $h);
    $s = strlen($token) === 64 ? one('SELECT * FROM screens WHERE token = ?', [$token]) : null;
    if (!$s) out(['error' => 'Dispositivo não pareado.'], 401);
    return $s;
}
function clean_info(mixed $info): string
{
    $o = [];
    if (is_array($info)) foreach (['model', 'os', 'app', 'resolution'] as $k) if (isset($info[$k]) && is_string($info[$k])) $o[$k] = mb_substr($info[$k], 0, 120);
    return json_encode($o, JSON_UNESCAPED_UNICODE);
}
/** Busca dados externos com cache em arquivo; se a fonte cair, devolve o ultimo valor conhecido. */
function cached(string $key, int $minutes, callable $load): mixed
{
    $dir = DATA_DIR . '/cache';
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    $file = $dir . '/' . sha1($key) . '.json';
    if (is_file($file) && time() - filemtime($file) < $minutes * 60) return json_decode(file_get_contents($file), true);
    $data = $load();
    if ($data !== null) { file_put_contents($file, json_encode($data), LOCK_EX); return $data; }
    return is_file($file) ? json_decode(file_get_contents($file), true) : null;
}
/** So permite enderecos publicos (os feeds sao informados pelo usuario). */
function public_url(string $url): bool
{
    $p = parse_url($url);
    if (!$p || !in_array($p['scheme'] ?? '', ['http', 'https'], true) || empty($p['host'])) return false;
    $ips = filter_var($p['host'], FILTER_VALIDATE_IP) ? [$p['host']] : (gethostbynamel($p['host']) ?: []);
    if (!$ips) return false;
    foreach ($ips as $ip) if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
    return true;
}
function http_get(string $url): ?string
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; DOOH-Player/1.0)']);
    $res = curl_exec($ch);
    $ok = $res !== false && curl_getinfo($ch, CURLINFO_HTTP_CODE) === 200;
    curl_close($ch);
    return $ok ? substr((string) $res, 0, 2_000_000) : null;
}

$a = $_GET['a'] ?? '';

if ($a === 'pair') {
    $b = body();
    $code = preg_replace('/[^A-Z0-9]/', '', strtoupper((string) ($b['code'] ?? '')));
    if (strlen($code) !== 6) out(['error' => 'Código inválido.'], 400);
    $s = one('SELECT * FROM screens WHERE code = ?', [$code]);
    if (!$s) { usleep(400000); out(['error' => 'Código não encontrado. Confira no painel.'], 404); }
    if ($s['token']) out(['error' => 'Esta tela já está pareada com outro dispositivo. Use “Resetar pareamento” no painel.'], 409);
    $token = bin2hex(random_bytes(32));
    q('UPDATE screens SET token=?, info=?, last_seen=? WHERE id=?', [$token, clean_info($b['info'] ?? null), time(), $s['id']]);
    out(['token' => $token, 'name' => $s['name']]);
}

$s = device_screen();
$sid = (int) $s['id'];

if ($a === 'sync') {
    $base = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
    $slots = [];
    foreach (all('SELECT m.* FROM items i JOIN medias m ON m.id = i.media_id WHERE i.screen_id=? AND m.active=1 ORDER BY i.pos, i.id', [$sid]) as $m) {
        if (!compatible($m, $s['orientation'])) continue;
        $slots[] = [[
            'id' => (string) $m['id'], 'name' => $m['name'], 'type' => $m['type'], 'kind' => $m['kind'], 'duration' => (int) $m['duration'],
            'src' => $m['file'] ? "$base/uploads/{$m['file']}" : null, 'url' => $m['url'], 'config' => json_decode($m['config'], true) ?: new stdClass(),
            'startDate' => $m['start_date'], 'endDate' => $m['end_date'], 'shiftStart' => $m['shift_start'], 'shiftEnd' => $m['shift_end'], 'weekDays' => $m['week_days'],
        ]];
    }
    q('UPDATE screens SET synced_at=?, synced_version=version, last_seen=? WHERE id=?', [time(), time(), $sid]);
    out(['version' => (int) $s['version'], 'slots' => $slots, 'screen' => [
        'name' => $s['name'], 'orientation' => $s['orientation'], 'timezone' => $s['timezone'], 'updateFrequency' => (int) $s['update_freq'], 'audioEnabled' => (bool) $s['audio'],
        'footer' => $s['footer_on'] ? ['text' => $s['footer_text']] : null,
    ]]);
}

if ($a === 'heartbeat') {
    $b = body();
    $now = time();
    try { $day = (new DateTime('now', new DateTimeZone($s['timezone'])))->format('Y-m-d'); } catch (Exception) { $day = date('Y-m-d'); }
    // soma o tempo no ar se a tela nao ficou muda entre um batimento e outro
    $gap = $s['last_seen'] ? ($now - (int) $s['last_seen']) / 60 : 99;
    if ($gap >= 0.5 && $gap <= 3) q('INSERT INTO uptime (screen_id, day, minutes) VALUES (?,?,?) ON CONFLICT(screen_id, day) DO UPDATE SET minutes = minutes + excluded.minutes', [$sid, $day, (int) round($gap)]);
    foreach ((array) ($b['plays'] ?? []) as $mediaId => $n) {
        $n = max(0, min(500, (int) $n));
        if ($n && val('SELECT 1 FROM medias WHERE id=?', [(int) $mediaId]))
            q('INSERT INTO plays (screen_id, media_id, day, count) VALUES (?,?,?,?) ON CONFLICT(screen_id, media_id, day) DO UPDATE SET count = count + excluded.count', [$sid, (int) $mediaId, $day, $n]);
    }
    foreach ((array) ($b['executed'] ?? []) as $cid) q("UPDATE commands SET status='executado', executed=? WHERE id=? AND screen_id=?", [$now, (int) $cid, $sid]);
    q('UPDATE screens SET last_seen=?, info=? WHERE id=?', [$now, isset($b['info']) ? clean_info($b['info']) : $s['info'], $sid]);
    $cmds = array_map(fn($c) => ['id' => (string) $c['id'], 'type' => $c['type']], all("SELECT id, type FROM commands WHERE screen_id=? AND status='pendente' ORDER BY id", [$sid]));
    out(['version' => (int) $s['version'], 'commands' => $cmds]);
}

if ($a === 'widget') {
    $kind = $_GET['kind'] ?? '';
    if ($kind === 'rss') {
        $m = one("SELECT * FROM medias WHERE id=? AND type='rss'", [(int) ($_GET['id'] ?? 0)]);
        $items = $m ? cached('rss:' . $m['url'], 30, function () use ($m) {
            if (!public_url($m['url']) || !($xml = http_get($m['url']))) return null;
            $doc = @simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NOCDATA | LIBXML_NONET);
            if (!$doc) return null;
            $list = [];
            foreach (($doc->channel->item ?? $doc->entry ?? []) as $it) {
                $media = $it->children('http://search.yahoo.com/mrss/');
                $img = (string) ($media->content[0]?->attributes()['url'] ?? $media->thumbnail[0]?->attributes()['url'] ?? $it->enclosure['url'] ?? '');
                if (!$img && preg_match('/<img[^>]+src="([^"]+)"/', (string) $it->description, $mm)) $img = $mm[1];
                $clean = fn(string $t) => trim(preg_replace('/\s+/', ' ', html_entity_decode(strip_tags($t), ENT_QUOTES, 'UTF-8')));
                $title = $clean((string) $it->title);
                if ($title !== '') $list[] = ['title' => $title, 'summary' => mb_substr($clean((string) ($it->description ?? $it->summary)), 0, 220), 'image' => $img ?: null];
                if (count($list) >= 15) break;
            }
            return $list ?: null;
        }) : null;
        out(['items' => $items ?? []]);
    }
    if ($kind === 'dolar') {
        out(cached('dolar', 30, function () {
            $j = json_decode(http_get('https://economia.awesomeapi.com.br/json/last/USD-BRL') ?? '', true);
            return isset($j['USDBRL']['bid']) ? ['value' => (float) $j['USDBRL']['bid'], 'change' => (float) ($j['USDBRL']['pctChange'] ?? 0)] : null;
        }) ?? []);
    }
    if ($kind === 'clima') {
        if ($s['lat'] === null || $s['lng'] === null) out([]);
        $la = round((float) $s['lat'], 3); $lo = round((float) $s['lng'], 3);
        out(cached("clima:$la,$lo", 30, function () use ($la, $lo, $s) {
            $j = json_decode(http_get("https://api.open-meteo.com/v1/forecast?latitude=$la&longitude=$lo&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1") ?? '', true);
            return isset($j['current']['temperature_2m']) ? ['temp' => (int) round($j['current']['temperature_2m']), 'code' => (int) $j['current']['weather_code'],
                'max' => (int) round($j['daily']['temperature_2m_max'][0]), 'min' => (int) round($j['daily']['temperature_2m_min'][0]), 'city' => $s['city']] : null;
        }) ?? []);
    }
}
out(['error' => 'Chamada desconhecida.'], 400);
