#!/usr/bin/env node
// borrow: send a prompt to a colleague's AI tool (Claude, Codex, Gemini) on the internal network; it runs on their
// subscription, they approve it, and the answer (text and any files it made) comes back. Node 18+, no packages,
// macOS / Windows / Linux.
//
//   share [--alati codex,claude,gemini] [--nacin pitaj|vjerujem] [--ko ana,marko] [--do 20:00]   start sharing
//   share stop | share status | share prompt <id> | share odobri <id> | share odbij <id>          the sharer's side
//   list [--json]                                                                                  who shares what now
//   ask <ime> <alat> [--repo [--putanje a,b]] [--out <dir>] [prompt…]   (or the prompt on stdin)     borrow; --repo sends the project
//   primijeni <id>                            the colleague's diff on a new branch borrow/<id> in its own worktree
//   setup [--ime <ime>] [--tim <kod>] [--port <n>] [--peer <ip>]                                     once per computer
//   install                                   the `borrow` and `share` terminal commands (they work without Claude)
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(os.homedir(), '.claude-borrow');
const CFG = path.join(DIR, 'config.json'), SHARE = path.join(DIR, 'share.json'), LOG = path.join(DIR, 'server.log');
const OGLAS = 8764;                          // UDP port of the „I share” announcements
const MAX_FAJLOVI = 25 * 2 ** 20, MAX_PROMPT = 200_000, MAX_BODY = 40 * 2 ** 20, ROK = 30 * 60_000;
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const NE_SALJI = ['.env*', '*.pem', '*.key', '*.p12', '*.pfx', 'id_rsa*', 'id_ed25519*'];   // never leaves the computer, even if git tracks it
const WIN = process.platform === 'win32';
fs.mkdirSync(DIR, { recursive: true });

const citaj = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const pisi = (p, o) => { fs.writeFileSync(p + '.tmp', JSON.stringify(o, null, 1)); fs.renameSync(p + '.tmp', p); };
const cfg = () => ({ ime: os.userInfo().username, tim: '', port: 8765, peers: [], ...citaj(CFG, {}) });
const arg = (a, k, d) => { const i = a.indexOf(k); return i >= 0 ? a.splice(i, 2)[1] : d; };
const potpis = (tim, s) => tim ? crypto.createHmac('sha256', tim).update(s).digest('hex') : '';
const timOznaka = tim => tim ? crypto.createHash('sha256').update('borrow:' + tim).digest('hex').slice(0, 10) : '';

// ------------------------------------------------------------------ tools: how each runs a prompt (the prompt goes on
// stdin, never into the command line, so nothing a colleague writes can become a shell command on Windows)
const ALATI = {
  claude: { cmd: 'claude', args: d => ['-p', '--output-format', 'text', '--permission-mode', 'acceptEdits'], ime: 'Claude' },
  codex: { cmd: 'codex', args: d => ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', d, '-o', path.join(d, '.odgovor.txt'), '-'], ime: 'Codex', odgovor: '.odgovor.txt' },
  gemini: { cmd: 'gemini', args: d => ['--yolo'], ime: 'Gemini' },
  ...(process.env.BORROW_TEST ? { proba: { cmd: process.execPath, args: d => ['-e', "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{require('fs').writeFileSync('slika.txt','nacrtano: '+s);if(require('fs').existsSync('README.md'))require('fs').appendFileSync('README.md','\\nproba: '+s.trim()+'\\n');console.log('ok: '+s)})"], ime: 'Proba' } } : {}),
};
const imaAlat = a => spawnSync(WIN ? 'where' : 'which', [ALATI[a].cmd], { stdio: 'ignore', shell: false }).status === 0;

// what is known about each tool's limit without spending anything: read from the tool's own local files
function limit(a) {
  try {
    if (a === 'codex') {   // Codex writes rate_limits into its session logs
      const base = path.join(os.homedir(), '.codex', 'sessions'); let naj = null;
      const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (e.name.startsWith('rollout-') && (!naj || fs.statSync(p).mtimeMs > naj[1])) naj = [p, fs.statSync(p).mtimeMs]; } };
      walk(base); if (!naj) return null;
      const nadji = o => { if (!o || typeof o !== 'object') return null; if (o.rate_limits) return o.rate_limits;
        for (const v of Object.values(o)) { const r = nadji(v); if (r) return r; } return null; };
      const l = fs.readFileSync(naj[0], 'utf8').split('\n').reverse().find(x => x.includes('"rate_limits"')); if (!l) return null;
      const rl = nadji(JSON.parse(l)); const p = rl && rl.primary;
      return p ? { pct: p.used_percent, prozor: p.window_minutes >= 10080 ? 'sedmično' : `${Math.round(p.window_minutes / 60)} h`, reset: p.resets_at, plan: rl.plan_type } : null;
    }
    if (a === 'claude') {   // /accounts (if the sharer uses it) remembers the limits Claude Code reports
      const s = citaj(path.join(os.homedir(), '.claude-accounts', 'accounts.json'));
      const id = (s && s.zadnji) || 'glavni', st = citaj(path.join(os.homedir(), '.claude-accounts', 'stanje', id + '.json'));
      if (!st) return null; const h = st.five_hour || {}, w = st.seven_day || {};
      return { pct: h.pct, prozor: '5h', reset: h.reset, sedmicno: w.pct };
    }
  } catch { /* unknown is fine */ }
  return null;
}

// ------------------------------------------------------------------ the sharer: a small server + announcements
function server() {
  const c = cfg(), s = citaj(SHARE, {}); const zahtjevi = new Map();
  const log = m => fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`);
  const aktivan = () => !s.do || Date.now() < s.do;
  const vjeruje = od => s.nacin === 'vjerujem' && aktivan() && (!s.ko?.length || s.ko.includes(od));
  const obavijesti = (naslov, tekst) => {   // a desktop notification on any OS; failing quietly is fine
    const t = tekst.replace(/["'`$\\]/g, '');
    if (process.platform === 'darwin') spawn('osascript', ['-e', `display notification "${t}" with title "${naslov}"`], { stdio: 'ignore' });
    else if (WIN) spawn('powershell', ['-NoProfile', '-Command', `[reflection.assembly]::loadwithpartialname('System.Windows.Forms')|Out-Null;$n=New-Object System.Windows.Forms.NotifyIcon;$n.Icon=[System.Drawing.SystemIcons]::Information;$n.Visible=$true;$n.ShowBalloonTip(8000,'${naslov}','${t}',0);Start-Sleep 9`], { stdio: 'ignore', detached: true });
    else spawn('notify-send', [naslov, t], { stdio: 'ignore' });
  };
  const pokreni = z => {
    z.status = 'radi'; z.pocetak = Date.now();
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'borrow-')); const A = ALATI[z.alat];
    let ulaz = z.prompt;
    if (z.repo) {   // a copy of the borrower's project (their last commit): unpack, make it a git repo, the diff goes back
      const tgz = d + '.tgz'; fs.writeFileSync(tgz, Buffer.from(z.repo.tar, 'base64'));
      const git = (...x) => spawnSync('git', ['-c', 'user.name=borrow', '-c', 'user.email=borrow@local', ...x], { cwd: d, encoding: 'utf8' });
      const t = spawnSync('tar', ['-xzf', tgz, '-C', d]); fs.rmSync(tgz, { force: true });
      if (t.status !== 0) return Object.assign(z, { status: 'greska', greska: 'ne mogu raspakovati projekat (tar)' });
      if (git('init', '-q').status !== 0) return Object.assign(z, { status: 'greska', greska: 'na ovom računaru nema gita' });
      git('add', '-A'); git('commit', '-qm', 'base', '--no-verify');
      ulaz = `You are working in a copy of the project "${z.repo.ime}" (this folder; it is a git repo at the project's last commit). ` +
        'Do the task below directly in these files. Do not commit, do not touch anything outside this folder. ' +
        'At the end, say in two or three lines what you changed.\n\n' + z.prompt;
    }
    const q = x => WIN && /[\s&()^]/.test(x) ? `"${x}"` : x;   // cmd.exe needs quotes around a path with spaces; our args never hold user text
    const p = spawn(A.cmd, A.args(d).map(q), { cwd: d, shell: WIN, windowsHide: true });   // shell only for the .cmd shims on Windows
    let out = '', err = ''; p.stdout.on('data', x => out += x); p.stderr.on('data', x => err += x);
    p.stdin.end(ulaz);
    const ubij = setTimeout(() => { try { p.kill(); } catch {} }, ROK);
    p.on('error', e => { clearTimeout(ubij); Object.assign(z, { status: 'greska', greska: String(e.message) }); log(`greska ${z.id} ${e.message}`); });
    p.on('close', code => {
      clearTimeout(ubij);
      const fajlovi = []; let ukupno = 0;
      const walk = (dd, rel = '') => { for (const e of fs.readdirSync(dd, { withFileTypes: true })) { const ap = path.join(dd, e.name), rp = path.join(rel, e.name);
        if (e.isDirectory()) walk(ap, rp); else if (e.name !== A.odgovor) { const b = fs.readFileSync(ap); ukupno += b.length; if (ukupno <= MAX_FAJLOVI) fajlovi.push({ ime: rp, b64: b.toString('base64') }); } } };
      if (!z.repo) try { walk(d); } catch {}   // with a project copy only the diff goes back, not the whole project
      if (z.alat === 'codex') try {   // Codex keeps the pictures it draws in its own folder, not in the work dir
        const gi = path.join(os.homedir(), '.codex', 'generated_images');
        for (const t of fs.readdirSync(gi)) for (const f of fs.readdirSync(path.join(gi, t))) {
          const ap = path.join(gi, t, f); if (fs.statSync(ap).mtimeMs < z.pocetak || !/\.(png|jpe?g|webp)$/i.test(f)) continue;
          const b = fs.readFileSync(ap); ukupno += b.length; if (ukupno <= MAX_FAJLOVI) fajlovi.push({ ime: f, b64: b.toString('base64') });
        }
      } catch {}
      const tekst = (A.odgovor && fs.existsSync(path.join(d, A.odgovor)) ? fs.readFileSync(path.join(d, A.odgovor), 'utf8') : out).trim();
      let patch;
      if (z.repo) { if (A.odgovor) fs.rmSync(path.join(d, A.odgovor), { force: true });
        const g = (...x) => spawnSync('git', x, { cwd: d, encoding: 'utf8', maxBuffer: 64 * 2 ** 20 });
        g('add', '-A'); patch = g('diff', '--cached', '--binary', g('rev-list', '--max-parents=0', 'HEAD').stdout.trim()).stdout; }
      Object.assign(z, { status: code === 0 ? 'gotovo' : 'greska', kod: code, tekst, patch, greska: code === 0 ? undefined : err.slice(-2000), fajlovi, preveliko: ukupno > MAX_FAJLOVI, trajanje: Date.now() - z.pocetak });
      fs.rmSync(d, { recursive: true, force: true }); delete z.repo; log(`${z.status} ${z.id} ${z.od} ${z.alat} ${fajlovi.length} fajlova${patch != null ? `, izmjena ${patch.length} B` : ''}`);
    });
  };
  const odgovori = (res, kod, o) => { res.writeHead(kod, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const lokalno = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && req.headers['x-admin'] === s.admin;
  http.createServer((req, res) => {
    let body = ''; req.on('data', x => { body += x; if (body.length > MAX_BODY) req.destroy(); });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x'); const dio = u.pathname.split('/').filter(Boolean);
      if (req.method === 'POST' && dio[0] === 'zahtjev') {
        let o; try { o = JSON.parse(body); } catch { return odgovori(res, 400, { greska: 'loš JSON' }); }
        const rh = o.repo ? sha(String(o.repo.tar || '')) : '';   // the project copy is signed too
        if (c.tim && potpis(c.tim, `${o.od}|${o.alat}|${o.prompt}${rh ? '|' + rh : ''}`) !== o.sig) return odgovori(res, 403, { greska: 'drugi tim' });
        if (o.repo && (typeof o.repo.tar !== 'string' || o.repo.tar.length > MAX_FAJLOVI * 1.4)) return odgovori(res, 413, { greska: 'projekat je prevelik (preko 25 MB)' });
        if (!aktivan()) return odgovori(res, 410, { greska: 'dijeljenje je isteklo' });
        if (!s.alati.includes(o.alat)) return odgovori(res, 404, { greska: `ne dijelim ${o.alat}` });
        if (typeof o.prompt !== 'string' || !o.prompt.trim() || o.prompt.length > MAX_PROMPT) return odgovori(res, 400, { greska: 'prazan ili predug prompt' });
        const z = { id: crypto.randomBytes(4).toString('hex'), od: String(o.od || '?').slice(0, 40), alat: o.alat, prompt: o.prompt, repo: o.repo ? { tar: o.repo.tar, ime: String(o.repo.ime || 'projekat').slice(0, 80) } : undefined, status: 'ceka', stigao: Date.now() };
        zahtjevi.set(z.id, z); log(`zahtjev ${z.id} od ${z.od} ${z.alat}`);
        if (vjeruje(z.od)) pokreni(z);
        else obavijesti('Pozajmica', `${z.od} traži ${ALATI[z.alat].ime}: share odobri ${z.id}`);
        return odgovori(res, 200, { id: z.id, status: z.status });
      }
      if (req.method === 'GET' && dio[0] === 'zahtjev' && dio[1]) {
        const z = zahtjevi.get(dio[1]); if (!z) return odgovori(res, 404, { greska: 'nema' });
        const { prompt, repo, ...javno } = z; return odgovori(res, 200, javno);
      }
      if (dio[0] === 'admin' && lokalno(req)) {   // only the sharer, on their own computer
        if (dio[1] === 'spisak') return odgovori(res, 200, [...zahtjevi.values()].map(({ fajlovi, tekst, repo, patch, ...z }) => ({ ...z, prompt: (repo ? '[projekat] ' : '') + z.prompt.slice(0, 300) })));
        const z = zahtjevi.get(dio[2]); if (!z) return odgovori(res, 404, { greska: 'nema' });
        if (dio[1] === 'prompt') return odgovori(res, 200, { id: z.id, od: z.od, alat: z.alat, prompt: z.prompt });
        if (dio[1] === 'odobri' && z.status === 'ceka') pokreni(z);
        if (dio[1] === 'odbij' && z.status === 'ceka') z.status = 'odbijeno';
        return odgovori(res, 200, { id: z.id, status: z.status });
      }
      odgovori(res, 404, { greska: 'nema' });
    });
  }).listen(c.port, '0.0.0.0', () => log(`slušam ${c.port}, dijelim ${s.alati}`));

  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.bind(() => { sock.setBroadcast(true); });
  const adrese = () => { const out = new Set(['255.255.255.255']);   // and each network's own broadcast address
    for (const ifs of Object.values(os.networkInterfaces())) for (const i of ifs || []) if (i.family === 'IPv4' && !i.internal) {
      const a = i.address.split('.').map(Number), m = i.netmask.split('.').map(Number); out.add(a.map((x, k) => (x | (~m[k] & 255))).join('.')); }
    return [...out, ...(c.peers || [])]; };
  const oglasi = () => {
    if (!aktivan()) { log('isteklo, gasim'); process.exit(0); }
    const poruka = Buffer.from(JSON.stringify({ v: 1, ime: c.ime, port: c.port, tim: timOznaka(c.tim), nacin: s.nacin, do: s.do || null,
      alati: s.alati.map(a => ({ alat: a, limit: limit(a) })) }));
    for (const a of adrese()) sock.send(poruka, OGLAS, a, () => {});
  };
  setInterval(oglasi, 3000); setTimeout(oglasi, 300);
}

async function adminZovi(put) {
  const s = citaj(SHARE); if (!s?.pid) throw new Error('ne dijeliš ništa (pokreni: share)');
  const r = await fetch(`http://127.0.0.1:${cfg().port}/admin/${put}`, { method: 'POST', headers: { 'x-admin': s.admin } });
  return r.json();
}
const zivo = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function share(a) {
  const pod = a[0];
  if (pod === 'stop') { const s = citaj(SHARE); if (s?.pid && zivo(s.pid)) process.kill(s.pid); fs.rmSync(SHARE, { force: true }); console.log('Dijeljenje ugašeno.'); return; }
  if (pod === 'prompt') { const r = await adminZovi(`prompt/${a[1]}`); return console.log(r.greska || `${r.od} traži ${r.alat}:\n\n${r.prompt}`); }
  if (pod === 'status' || pod === 'odobri' || pod === 'odbij') {
    const s = citaj(SHARE); if (!s?.pid || !zivo(s.pid)) return console.log('Ne dijeliš ništa. Pokreni: share --alati codex');
    if (pod !== 'status') { const r = await adminZovi(`${pod}/${a[1]}`); return console.log(r.greska || `Zahtjev ${r.id}: ${r.status}`); }
    const z = await (await fetch(`http://127.0.0.1:${cfg().port}/admin/spisak`, { headers: { 'x-admin': s.admin } })).json();
    console.log(`Dijeliš: ${s.alati.join(', ')} · ${s.nacin === 'vjerujem' ? `vjeruješ ${s.ko?.length ? s.ko.join(', ') : 'svima iz tima'}` : 'pitaš za svaki zahtjev'}${s.do ? ` · do ${new Date(s.do).toLocaleTimeString().slice(0, 5)}` : ''}`);
    if (!z.length) return console.log('Zahtjeva još nema.');
    console.log('\n| id | ko | alat | stanje | prompt |\n| --- | --- | --- | --- | --- |');
    for (const x of z) console.log(`| ${x.id} | ${x.od} | ${x.alat} | ${x.status} | ${x.prompt.replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, 90)} |`);
    if (z.some(x => x.status === 'ceka')) console.log('\nOdobri: share odobri <id> · odbij: share odbij <id>');
    return;
  }
  const alati = (arg(a, '--alati', '') || Object.keys(ALATI).filter(imaAlat).join(',')).split(',').filter(Boolean);
  const nepoznati = alati.filter(x => !ALATI[x]); if (nepoznati.length) return console.log(`Ne znam alat: ${nepoznati.join(', ')}. Znam: ${Object.keys(ALATI).join(', ')}`);
  const nema = alati.filter(x => !imaAlat(x)); if (nema.length) return console.log(`Na ovom računaru nema: ${nema.join(', ')}`);
  if (!alati.length) return console.log('Ne nalazim nijedan alat za dijeljenje (claude, codex, gemini).');
  const nacin = arg(a, '--nacin', 'pitaj'), ko = (arg(a, '--ko', '') || '').split(',').filter(Boolean), doStr = arg(a, '--do', '');
  let doMs = null; if (doStr) { const [h, m] = doStr.split(':').map(Number); const t = new Date(); t.setHours(h, m || 0, 0, 0); if (t < new Date()) t.setDate(t.getDate() + 1); doMs = +t; }
  const stari = citaj(SHARE); if (stari?.pid && zivo(stari.pid)) process.kill(stari.pid);
  pisi(SHARE, { alati, nacin, ko, do: doMs, admin: crypto.randomBytes(16).toString('hex') });
  const p = spawn(process.execPath, [fileURLToPath(import.meta.url), 'server'], { detached: true, stdio: 'ignore', windowsHide: true });
  p.unref(); pisi(SHARE, { ...citaj(SHARE), pid: p.pid });
  const c = cfg();
  console.log(`Dijeliš ${alati.join(', ')} kao „${c.ime}” na portu ${c.port} · ${nacin === 'vjerujem' ? `vjeruješ ${ko.length ? ko.join(', ') : 'svima iz tima'}` : 'pitaće te za svaki zahtjev'}${doMs ? ` · do ${doStr}` : ''}.`);
  if (!c.tim) console.log('Napomena: tim kod nije postavljen, pa te vidi svako u ovoj mreži. Postavi ga: setup --tim <kod> (isti kod kod svih kolega).');
}

// ------------------------------------------------------------------ the borrower
function slusaj(ms = 3500) {
  return new Promise(ok => {
    const c = cfg(), moj = timOznaka(c.tim), vidim = new Map();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sock.on('message', (m, r) => { try { const o = JSON.parse(m); if (o.v !== 1 || o.tim !== moj) return;
      const k = `${o.ime}:${o.port}`, bilo = vidim.get(k);   // one colleague heard on several networks: keep one address, loopback last
      if (!bilo || bilo.host.startsWith('127.')) vidim.set(k, { ...o, host: r.address }); } catch {} });
    sock.on('error', () => ok([]));
    sock.bind(OGLAS, () => setTimeout(() => { sock.close(); ok([...vidim.values()]); }, ms));
  });
}
const vrijeme = t => t ? new Date(t * 1000).toLocaleString('sr-Latn-ME', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
const limitTekst = l => !l || l.pct == null ? '—' : `${Math.round(l.pct)} % ${l.prozor || ''}${l.sedmicno != null ? ` · sedmično ${Math.round(l.sedmicno)} %` : ''}${l.reset ? ` · reset ${vrijeme(l.reset)}` : ''}`;

async function list(a) {
  const v = await slusaj();
  if (a.includes('--json')) return console.log(JSON.stringify(v, null, 1));
  if (!v.length) return console.log('Trenutno niko iz tvog tima ne dijeli ništa (ili ste u različitim mrežama, ili vam se tim kod razlikuje).');
  const redovi = v.flatMap(x => x.alati.map(t => ({ ime: x.ime, alat: t.alat, limit: t.limit, nacin: x.nacin })));
  const naj = {}; for (const r of redovi) { const p = r.limit?.pct ?? 50; if (!naj[r.alat] || p < naj[r.alat]) naj[r.alat] = p; }
  console.log('| | Kolega | Alat | Limit | Odobravanje |\n| --- | --- | --- | --- | --- |');
  for (const r of redovi) console.log(`| ${(r.limit?.pct ?? 50) === naj[r.alat] ? '★' : ''} | ${r.ime} | ${ALATI[r.alat]?.ime || r.alat} (\`${r.alat}\`) | ${limitTekst(r.limit)} | ${r.nacin === 'vjerujem' ? 'odmah' : 'pita ga'} |`);
  console.log('\nPozajmi: ask <kolega> <alat> "<prompt>"');
}

async function ask(a) {
  const out = arg(a, '--out', null), putanje = arg(a, '--putanje', '');
  const saRepo = a.includes('--repo'); if (saRepo) a.splice(a.indexOf('--repo'), 1);
  const [ime, alat, ...ostalo] = a;
  if (!ime || !alat) return console.log('ask <kolega> <alat> "<prompt>"');
  let prompt = ostalo.join(' ');
  if (!prompt && !process.stdin.isTTY) prompt = fs.readFileSync(0, 'utf8');
  if (!prompt.trim()) return console.log('Fali prompt.');
  const v = (await slusaj()).find(x => x.ime.toLowerCase() === ime.toLowerCase());
  if (!v) return console.log(`„${ime}” trenutno ne dijeli ništa u tvojoj mreži.`);
  if (!v.alati.some(t => t.alat === alat)) return console.log(`${v.ime} ne dijeli ${alat}, nego: ${v.alati.map(t => t.alat).join(', ')}`);
  const c = cfg(), base = `http://${v.host}:${v.port}`;
  let repo = null, rh = '', korijen = null, baza = null;
  if (saRepo) {   // the project's last commit; uncommitted work stays here, untouched
    const g = (...x) => spawnSync('git', x, { encoding: 'buffer', maxBuffer: 200 * 2 ** 20 });
    korijen = g('rev-parse', '--show-toplevel').stdout.toString().trim(); if (!korijen) return console.log('--repo: ovdje nema git projekta.');
    baza = g('-C', korijen, 'rev-parse', 'HEAD').stdout.toString().trim();
    if (g('-C', korijen, 'status', '--porcelain').stdout.length) console.log('Pažnja: necommitovane izmjene se ne šalju; kolega radi na zadnjem commitu.');
    const spec = [...(putanje ? putanje.split(',') : ['.']), ...NE_SALJI.map(x => `:(exclude,glob)**/${x}`)];
    const t = g('-C', korijen, 'archive', '--format=tar.gz', 'HEAD', '--', ...spec);
    if (t.status !== 0) return console.log('git archive nije uspio: ' + t.stderr.toString().slice(0, 300));
    if (t.stdout.length > MAX_FAJLOVI) return console.log(`Projekat je ${Math.round(t.stdout.length / 2 ** 20)} MB spakovan (granica 25): suzi sa --putanje src,docs`);
    repo = { tar: t.stdout.toString('base64'), ime: path.basename(korijen) }; rh = sha(repo.tar);
    console.log(`Šaljem ${repo.ime} (zadnji commit ${baza.slice(0, 7)}, ${Math.round(t.stdout.length / 1024)} KB, bez ${NE_SALJI.join(' ')}).`);
  }
  const r = await (await fetch(`${base}/zahtjev`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ od: c.ime, alat, prompt, repo, sig: potpis(c.tim, `${c.ime}|${alat}|${prompt}${rh ? '|' + rh : ''}`) }) })).json();
  if (r.greska) return console.log(`${v.ime}: ${r.greska}`);
  console.log(`Poslato ${v.ime} (${ALATI[alat]?.ime || alat}), zahtjev ${r.id}. ${r.status === 'ceka' ? `Čeka da ${v.ime} odobri…` : 'Radi…'}`);
  let z, javio = r.status, t0 = Date.now();
  while (true) {
    await new Promise(x => setTimeout(x, 3000));
    try { z = await (await fetch(`${base}/zahtjev/${r.id}`, { signal: AbortSignal.timeout(15000) })).json(); } catch { if (Date.now() - t0 > ROK + 600_000) return console.log('Veza prekinuta.'); continue; }
    if (z.status !== javio) { javio = z.status; if (z.status === 'radi') console.log(`${v.ime} je odobrio, radi…`); }
    if (['gotovo', 'greska', 'odbijeno'].includes(z.status)) break;
  }
  if (z.status === 'odbijeno') return console.log(`${v.ime} je odbio zahtjev.`);
  if (z.status === 'greska') return console.log(`Greška kod ${v.ime}: ${z.greska || z.kod}`);
  const cilj = out || path.join(process.cwd(), 'pozajmljeno', `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${v.ime}-${alat}`);
  if (z.fajlovi?.length) { for (const f of z.fajlovi) { const p = path.join(cilj, path.normalize(f.ime).replace(/^(\.\.(\/|\\|$))+/, ''));
    if (!p.startsWith(cilj)) continue; fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.from(f.b64, 'base64')); } }
  console.log(`\nGotovo za ${Math.round(z.trajanje / 1000)} s.\n\n${z.tekst || '(bez teksta)'}`);
  if (z.fajlovi?.length) console.log(`\nFajlovi (${z.fajlovi.length}) u ${cilj}:\n` + z.fajlovi.map(f => '  ' + f.ime).join('\n'));
  if (z.preveliko) console.log('(dio fajlova nije poslat: preko 25 MB)');
  if (saRepo) {
    if (!z.patch?.trim()) return console.log('\nU projektu nije ništa promijenjeno.');
    const pd = path.join(DIR, 'primljeno'); fs.mkdirSync(pd, { recursive: true });   // kept outside the project, so the repo stays clean
    const pf = path.join(pd, `${r.id}.patch`); fs.writeFileSync(pf, z.patch);
    const st = spawnSync('git', ['-C', korijen, 'apply', '--stat', pf], { encoding: 'utf8' }).stdout;
    pisi(path.join(pd, `${r.id}.json`), { patch: pf, baza, korijen, od: v.ime, alat, prompt: prompt.slice(0, 200) });
    console.log(`\nIzmjena (${pf}):\n${st}\nPrimijeni na novu granu: borrow primijeni ${r.id}`);
  }
}

function primijeni(a) {   // the colleague's diff on its own branch, in its own folder: the borrower's work stays untouched
  const m = citaj(path.join(DIR, 'primljeno', `${a[0]}.json`)); if (!m) return console.log(`Nema primljene izmjene „${a[0]}”.`);
  const grana = `borrow/${a[0]}`, wt = `${m.korijen}-borrow-${a[0]}`;
  const g = (...x) => spawnSync('git', x, { encoding: 'utf8' });
  let r = g('-C', m.korijen, 'worktree', 'add', '-q', '-b', grana, wt, m.baza);
  if (r.status !== 0) return console.log('Ne mogu napraviti granu: ' + r.stderr.trim());
  r = g('-C', wt, 'apply', '--3way', '--index', m.patch);
  if (r.status !== 0) return console.log(`Izmjena se ne uklapa čisto (${r.stderr.trim().slice(0, 300)}).\nRiješi u ${wt} pa commit; ili odustani: git worktree remove --force ${wt} && git branch -D ${grana}`);
  g('-C', wt, 'commit', '-qm', `borrow ${a[0]} (${m.od}, ${m.alat}): ${m.prompt.replace(/\s+/g, ' ').slice(0, 72)}`, '--no-verify');
  console.log(`Izmjena je na grani ${grana} (folder ${wt}).\nPregled: git diff ${m.baza.slice(0, 7)}..${grana}\nSpajanje: git merge ${grana}\nOdustani: git worktree remove ${wt} && git branch -D ${grana}`);
}


function install() {   // terminal commands that work without Claude (also as `!borrow …` inside a session at the limit)
  const kopija = path.join(DIR, 'borrow.mjs'); fs.copyFileSync(fileURLToPath(import.meta.url), kopija);
  const gdje = WIN ? path.dirname(process.execPath) : path.join(os.homedir(), '.local', 'bin'); fs.mkdirSync(gdje, { recursive: true });
  for (const [ime, pod] of [['borrow', ''], ['share', ' share']]) {
    if (WIN) fs.writeFileSync(path.join(gdje, ime + '.cmd'), `@"${process.execPath}" "${kopija}"${pod} %*\r\n`);
    else { const f = path.join(gdje, ime); fs.writeFileSync(f, `#!/bin/sh\nexec node "${kopija}"${pod} "$@"\n`); fs.chmodSync(f, 0o755); }
  }
  console.log(`Komande \`borrow\` (list, ask, setup) i \`share\` (status, odobri, odbij, stop, --alati …) su u ${gdje}. Rade i bez Claudea: u terminalu ili kao !borrow … u sesiji.`);
}

function setup(a) {
  const c = cfg(); const ime = arg(a, '--ime', null), tim = arg(a, '--tim', null), port = arg(a, '--port', null), peer = arg(a, '--peer', null);
  if (ime) c.ime = ime; if (tim != null) c.tim = tim; if (port) c.port = Number(port); if (peer) c.peers = [...new Set([...(c.peers || []), peer])];
  pisi(CFG, c); console.log(`Ime: ${c.ime} · tim kod: ${c.tim ? 'postavljen' : 'nije'} · port: ${c.port}${c.peers.length ? ` · kolege po adresi: ${c.peers.join(', ')}` : ''}`);
}

const [k, ...a] = process.argv.slice(2);
const radnje = { server, share, list, ask, setup, install, primijeni };
if (!radnje[k]) console.log([
  'borrow list                                     ko šta dijeli i sa kolikim limitom',
  'borrow ask <kolega> <alat> "<prompt>"           odgovor ili slika od kolegin alata',
  'borrow ask <kolega> <alat> --repo "<zadatak>"   posao na ovom projektu (zadnji commit, bez .env i ključeva)',
  'borrow primijeni <id>                           izmjenu sa --repo na novu granu borrow/<id>',
  'borrow setup --ime <ime> --tim <kod>            jednom po računaru',
  'share [status | odobri <id> | odbij <id> | stop | --alati codex,claude --nacin pitaj|vjerujem]',
].join('\n'));
else Promise.resolve(radnje[k](a)).catch(e => { console.log('Greška: ' + e.message); process.exitCode = 1; });
