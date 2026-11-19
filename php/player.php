<?php /** Player (frente): pagina unica que roda no box Android ou em qualquer navegador. */ ?><!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Player — Yes DOOH</title>
<style>
html,body{margin:0;height:100%;background:#000;overflow:hidden}
#frame{position:fixed;top:50%;left:50%;background:#000;color:#fff;overflow:hidden;display:flex;flex-direction:column;font-family:system-ui,Roboto,sans-serif}
#stage{position:relative;flex:1;min-height:0}
.full{position:absolute;top:0;left:0;width:100%;height:100%;border:0}
.center{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:calc(var(--u)*6);box-sizing:border-box}
.center>*{margin:calc(var(--u)*1.5) 0}
.media{object-fit:contain;background:#000}
.big{font-size:calc(var(--u)*13);font-weight:900;line-height:1}.label{font-size:calc(var(--u)*4);opacity:.85}
#footer{display:none;align-items:center;padding:calc(var(--u)*1.4) calc(var(--u)*3);font-size:calc(var(--u)*3.2);font-weight:700;background:#000}
#footer span:first-child{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#off{display:none;position:absolute;top:calc(var(--u)*1.5);right:calc(var(--u)*1.5);width:calc(var(--u)*1.4);height:calc(var(--u)*1.4);border-radius:50%;background:#ef4444}
#pair input{font:900 calc(var(--u)*9) monospace;letter-spacing:.3em;text-align:center;width:7em;max-width:90%;padding:.2em;border-radius:calc(var(--u));border:3px solid #f9c21a;background:#161d2e;color:#fff;outline:none}
#pair button{font-size:calc(var(--u)*4);font-weight:800;padding:.5em 1.6em;border-radius:calc(var(--u));border:0;background:#f9c21a;color:#0b1120}
</style></head><body>
<div id="frame"><div id="stage"></div><div id="footer"><span id="ftext"></span><span id="fclock"></span></div><span id="off" title="Sem conexão — reproduzindo conteúdo salvo"></span></div>
<script>
(function () {
  'use strict';
  var API = 'api.php?a=';
  var LS = { token: 'yd-player-token', data: 'yd-player-data', rotate: 'yd-player-rotate', executed: 'yd-player-executed' };
  var CACHE = 'yd-media-v1';
  var WEATHER = { 0: 'Céu limpo', 1: 'Poucas nuvens', 2: 'Parcialmente nublado', 3: 'Nublado', 45: 'Neblina', 48: 'Neblina', 51: 'Garoa', 53: 'Garoa', 55: 'Garoa', 61: 'Chuva fraca', 63: 'Chuva', 65: 'Chuva forte', 80: 'Pancadas de chuva', 81: 'Pancadas de chuva', 82: 'Temporal', 95: 'Trovoadas', 96: 'Trovoadas', 99: 'Trovoadas' };
  var frame = document.getElementById('frame'), stage = document.getElementById('stage');
  var sync = null, pos = { slot: -1, n: 0 }, plays = {}, timer = null, blobUrl = null, playing = false;

  // ----- quadro: rotacao e unidades proporcionais (funciona em WebViews antigos) -----
  var q = new URLSearchParams(location.search).get('girar');
  if (q) localStorage.setItem(LS.rotate, q);
  var rotate = Number(localStorage.getItem(LS.rotate)) || 0, turned = rotate === 90 || rotate === 270;
  function fit() {
    var w = turned ? innerHeight : innerWidth, h = turned ? innerWidth : innerHeight;
    frame.style.width = w + 'px'; frame.style.height = h + 'px';
    frame.style.transform = 'translate(-50%,-50%) rotate(' + rotate + 'deg)';
    frame.style.setProperty('--u', Math.min(w, h) / 100 + 'px');
  }
  fit(); addEventListener('resize', fit);

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function token() { return localStorage.getItem(LS.token); }
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: 'Bearer ' + token(), 'X-Device-Token': token() }, opts.headers || {});
    return fetch(API + path, opts).then(function (r) {
      if (r.status === 401) { localStorage.removeItem(LS.token); localStorage.removeItem(LS.data); location.reload(); } // tela resetada no painel
      return r;
    });
  }
  function offline(on) { document.getElementById('off').style.display = on ? 'block' : 'none'; }
  function deviceInfo() {
    var ua = navigator.userAgent, m;
    return {
      model: (m = /Android[^;]*;\s*([^)]+?)\s*(Build|\))/.exec(ua)) ? m[1] : (navigator.platform || 'Navegador'),
      os: (m = /(Android [\d.]+|Windows NT [\d.]+|Mac OS X [\d_]+|CrOS|Linux)/.exec(ua)) ? m[1] : 'Desconhecido',
      app: (m = /YesDoohPlayer\/([\d.]+)/.exec(ua)) ? 'App Android ' + m[1] : 'Navegador',
      resolution: screen.width + '×' + screen.height
    };
  }

  // ----- horario no fuso da tela e regras de agendamento -----
  function nowIn(tz) {
    var p = {};
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' })
        .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    } catch (e) { var d = new Date(); return { date: d.toISOString().slice(0, 10), time: ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2), day: d.getDay() }; }
    return { date: p.year + '-' + p.month + '-' + p.day, time: (p.hour === '24' ? '00' : p.hour) + ':' + p.minute, day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
  }
  function eligible(m) {
    var n = nowIn(sync.screen.timezone), a = m.shiftStart, b = m.shiftEnd;
    if (m.startDate && n.date < m.startDate) return false;
    if (m.endDate && n.date > m.endDate) return false;
    if (m.weekDays && m.weekDays.split(',').indexOf(String(n.day)) < 0) return false;
    if (a && b) return a <= b ? (n.time >= a && n.time <= b) : (n.time >= a || n.time <= b); // turno pode cruzar a meia-noite
    if (a) return n.time >= a;
    if (b) return n.time <= b;
    return true;
  }
  function clockText() { try { return new Intl.DateTimeFormat('pt-BR', { timeZone: sync.screen.timezone, hour: '2-digit', minute: '2-digit' }).format(new Date()); } catch (e) { return new Date().toLocaleTimeString().slice(0, 5); } }

  // ----- arquivos guardados no aparelho (toca sem internet) -----
  function precache(urls) {
    if (!('caches' in window)) return;
    caches.open(CACHE).then(function (c) {
      c.keys().then(function (keys) { keys.forEach(function (k) { if (urls.indexOf(new URL(k.url).pathname) < 0) c.delete(k); }); });
      urls.forEach(function (u) { c.match(u).then(function (hit) { if (!hit) c.add(u).catch(function () {}); }); });
    }).catch(function () {});
  }
  function cachedSrc(src) {
    if (!('caches' in window)) return Promise.resolve(src);
    return caches.open(CACHE).then(function (c) { return c.match(src); }).then(function (hit) {
      if (!hit) return src;
      return hit.blob().then(function (b) { blobUrl = URL.createObjectURL(b); return blobUrl; });
    }).catch(function () { return src; });
  }

  // ----- reproducao -----
  function clearStage() {
    clearTimeout(timer);
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    stage.innerHTML = '';
  }
  function idle(text) {
    clearStage(); playing = false;
    var d = el('div', 'full center'); d.style.background = '#0b1120';
    var t = el('p', null, 'Yes'); t.style.cssText = 'font-size:calc(var(--u)*6);font-weight:900';
    var b = el('span', null, 'DOOH'); b.style.color = '#f9c21a'; t.appendChild(b);
    d.appendChild(t); d.appendChild(el('p', 'label', text)); stage.appendChild(d);
    timer = setTimeout(next, 15000);
  }
  function next() {
    if (!sync || !sync.slots.length) return idle(sync ? sync.screen.name + ': adicione conteúdos à playlist no painel.' : 'Carregando programação...');
    for (var i = 1; i <= sync.slots.length; i++) {
      var slot = (pos.slot + i + sync.slots.length) % sync.slots.length, m = sync.slots[slot][0];
      if (!eligible(m)) continue;
      pos.slot = slot; pos.n++;
      plays[m.id] = (plays[m.id] || 0) + 1;
      return show(m);
    }
    idle('Nenhum conteúdo programado para este horário.');
  }
  function show(m) {
    clearStage(); playing = true;
    var done = false, video = m.type === 'arquivo' && m.kind === 'video';
    function go() { if (!done) { done = true; next(); } }
    timer = setTimeout(go, (m.duration + (video ? 8 : 0)) * 1000); // video avanca ao terminar; o tempo e a rede de seguranca
    function fail() { clearTimeout(timer); timer = setTimeout(go, 1000); }

    if (m.type === 'arquivo') {
      cachedSrc(m.src).then(function (src) {
        if (done) return;
        var e = el(video ? 'video' : 'img', 'full media');
        if (video) { e.autoplay = true; e.playsInline = true; e.muted = !sync.screen.audioEnabled; e.onended = go; }
        e.onerror = fail; e.src = src; stage.appendChild(e);
        if (video) { var p = e.play(); if (p && p.catch) p.catch(function () { e.muted = true; e.play().catch(fail); }); }
      });
      return;
    }
    if (m.type === 'youtube') {
      var id = (/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(m.url || '') || [])[1];
      if (!id) return fail();
      var f = el('iframe', 'full'); f.allow = 'autoplay; encrypted-media';
      f.src = 'https://www.youtube.com/embed/' + id + '?autoplay=1&mute=' + (sync.screen.audioEnabled ? 0 : 1) + '&controls=0&rel=0&playsinline=1';
      return stage.appendChild(f);
    }
    var cfg = m.config || {}, box = el('div', 'full center');
    box.style.background = cfg.bg || '#0b1120'; box.style.color = cfg.color || '#fff';
    stage.appendChild(box);
    if (m.type === 'aviso') {
      var t = el('p', null, m.name); t.style.cssText = 'font-size:calc(var(--u)*8);font-weight:900;line-height:1.1';
      var x = el('p', null, cfg.text || ''); x.style.cssText = 'font-size:calc(var(--u)*4.6);line-height:1.35;white-space:pre-wrap;color:#fff';
      box.appendChild(t); box.appendChild(x); return;
    }
    if (m.type === 'hora') {
      var dt; try { dt = new Intl.DateTimeFormat('pt-BR', { timeZone: sync.screen.timezone, weekday: 'long', day: '2-digit', month: 'long' }).format(new Date()); } catch (e) { dt = ''; }
      var c = el('p', 'big', clockText()); c.style.fontSize = 'calc(var(--u)*24)';
      box.appendChild(el('p', 'label', dt)); box.appendChild(c); return;
    }
    // noticias, dolar e clima dependem de dados do servidor; sem dados (offline), pula o slide
    api('widget&kind=' + m.type + '&id=' + m.id).then(function (r) { return r.json(); }).then(function (d) {
      if (done) return;
      if (m.type === 'dolar' && typeof d.value === 'number') {
        box.appendChild(el('p', 'label', 'Cotação do dólar hoje'));
        box.appendChild(el('p', 'big', 'R$ ' + d.value.toFixed(2).replace('.', ',')));
        box.appendChild(el('p', 'label', (d.change >= 0 ? '▲ ' : '▼ ') + Math.abs(d.change).toFixed(2).replace('.', ',') + '% no dia'));
      } else if (m.type === 'clima' && typeof d.temp === 'number') {
        box.appendChild(el('p', 'label', d.city ? 'Tempo agora em ' + d.city : 'Tempo agora'));
        var tp = el('p', 'big', d.temp + '°C'); tp.style.fontSize = 'calc(var(--u)*22)'; box.appendChild(tp);
        var w = el('p', null, WEATHER[d.code] || 'Tempo instável'); w.style.cssText = 'font-size:calc(var(--u)*5.5);font-weight:700'; box.appendChild(w);
        box.appendChild(el('p', 'label', 'Máx. ' + d.max + '° · Mín. ' + d.min + '°'));
      } else if (m.type === 'rss' && d.items && d.items.length) {
        var it = d.items[pos.n % d.items.length]; // uma manchete diferente a cada passagem
        box.className = 'full'; box.style.display = 'flex'; box.style.flexDirection = 'column';
        if (it.image) { var im = el('div'); im.style.cssText = 'flex:1;min-height:0;background-size:cover;background-position:center'; im.style.backgroundImage = 'url("' + encodeURI(it.image) + '")'; box.appendChild(im); }
        var tx = el('div'); tx.style.cssText = 'padding:calc(var(--u)*4) calc(var(--u)*5)' + (it.image ? '' : ';flex:1;display:flex;flex-direction:column;justify-content:center');
        var s = el('p', null, m.name); s.style.cssText = 'margin:0 0 calc(var(--u)*1.5);font-size:calc(var(--u)*3);font-weight:800;text-transform:uppercase;letter-spacing:.08em;opacity:.8';
        var h = el('p', null, it.title); h.style.cssText = 'margin:0;font-size:calc(var(--u)*6);font-weight:900;line-height:1.12';
        tx.appendChild(s); tx.appendChild(h);
        if (!it.image) { var sm = el('p', null, it.summary); sm.style.cssText = 'font-size:calc(var(--u)*3.6);opacity:.85'; tx.appendChild(sm); }
        box.appendChild(tx);
      } else fail();
    }).catch(fail);
  }

  // ----- conversa com o servidor -----
  function applyScreen() {
    var f = sync.screen.footer, bar = document.getElementById('footer');
    bar.style.display = f ? 'flex' : 'none';
    if (f) { document.getElementById('ftext').textContent = f.text; document.getElementById('fclock').textContent = clockText(); }
  }
  function doSync() {
    return api('sync').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
      sync = d; localStorage.setItem(LS.data, JSON.stringify(d)); offline(false); applyScreen();
      precache(d.slots.map(function (s) { return s[0].type === 'arquivo' ? s[0].src : null; }).filter(Boolean));
      if (!playing) next();
    }).catch(function () { offline(true); });
  }
  function beat() {
    var sent = plays; plays = {};
    var executed = JSON.parse(localStorage.getItem(LS.executed) || '[]');
    api('heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plays: sent, executed: executed, info: deviceInfo() }) })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) {
        offline(false); localStorage.setItem(LS.executed, '[]');
        var reload = false, clear = false;
        j.commands.forEach(function (c) { if (c.type === 'recarregar') reload = true; if (c.type === 'limpar_cache') clear = true; });
        if (j.commands.length) localStorage.setItem(LS.executed, JSON.stringify(j.commands.map(function (c) { return c.id; }))); // confirma no proximo batimento
        var after = function () {
          if (reload) return location.reload();
          if (j.commands.length || !sync || j.version !== sync.version) doSync();
          if (j.commands.length) setTimeout(beat, 1500); // confirma a execucao logo em seguida
        };
        if (clear && 'caches' in window) caches.delete(CACHE).then(after, after); else after();
      }).catch(function () { for (var k in sent) plays[k] = (plays[k] || 0) + sent[k]; offline(true); }); // guarda para reenviar
  }

  // ----- pareamento -----
  function pairing() {
    frame.style.cursor = 'auto';
    var f = el('form', 'full center'); f.id = 'pair'; f.style.background = '#0b1120';
    var t = el('p', null, 'Yes'); t.style.cssText = 'font-size:calc(var(--u)*7);font-weight:900';
    var b = el('span', null, 'DOOH'); b.style.color = '#f9c21a'; t.appendChild(b); t.appendChild(document.createTextNode(' Player'));
    var input = el('input'); input.placeholder = 'ABC123'; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Código de pareamento');
    input.oninput = function () { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); };
    var btn = el('button', null, 'Parear tela'), err = el('p', 'label'); err.style.color = '#fca5a5'; err.setAttribute('role', 'alert');
    f.appendChild(t); f.appendChild(el('p', 'label', 'Digite o código de pareamento exibido no painel, na página da tela.'));
    f.appendChild(input); f.appendChild(btn); f.appendChild(err);
    f.onsubmit = function (ev) {
      ev.preventDefault(); err.textContent = '';
      fetch(API + 'pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: input.value, info: deviceInfo() }) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw j.error; localStorage.setItem(LS.token, j.token); location.reload(); }); })
        .catch(function (m) { err.textContent = typeof m === 'string' ? m : 'Sem conexão com o servidor.'; });
    };
    stage.appendChild(f); input.focus();
  }

  if (!token()) return pairing();
  frame.style.cursor = 'none';
  try { sync = JSON.parse(localStorage.getItem(LS.data)); } catch (e) { sync = null; }
  if (sync) { applyScreen(); next(); } else idle('Carregando programação...');
  doSync().then(beat);
  setInterval(beat, 60000);
  setInterval(function () { doSync(); }, Math.max(1, sync ? sync.screen.updateFrequency : 10) * 60000);
  setInterval(function () { if (sync && sync.screen.footer) document.getElementById('fclock').textContent = clockText(); }, 10000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
</script></body></html>
