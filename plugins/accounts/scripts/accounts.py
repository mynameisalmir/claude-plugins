#!/usr/bin/env python3
"""/accounts: several Claude Code logins on one Mac that share everything except the login.

Each extra account is its own CLAUDE_CONFIG_DIR under ~/.claude-accounts/<id>/ whose shared parts (skills, plugins,
memory, settings, history…) are symlinks to ~/.claude, so only the login and the limits differ. The first account is
the existing ~/.claude itself (no CLAUDE_CONFIG_DIR).

  accounts.py launch [claude args]   the `claude` shell function: pick an account, run Claude Code, and when a session
                                     asked for a switch, start again on the new account resuming the same conversation
  accounts.py komanda "<args>"       /accounts in a session: table | <id> (switch) | add <name> | refresh
  accounts.py switch <id>            ends the running session; the launcher resumes it on <id>
  accounts.py statusline             statusLine command: remembers the limits it is given, prints one line
  accounts.py hook                   UserPromptSubmit hook: near the limit, Claude asks whether to switch
  accounts.py install                once per computer: the `claude` launcher in the shell profile + the status line
"""
import datetime as dt, json, os, re, shutil, signal, subprocess, sys, time
try: import curses
except ImportError: curses = None   # Windows: no picker yet

HOME = os.path.expanduser('~'); A = HOME + '/.claude-accounts'; GLAVNI = HOME + '/.claude'
SPISAK, STANJE, SESIJE, ZAHTJEV = A + '/accounts.json', A + '/stanje', A + '/sesije', A + '/zahtjev.json'
# what an extra account shares with ~/.claude (everything a person would call „my Claude”); the login, the state file
# (.claude.json) and the running-session registry stay its own
DIJELI = ['settings.json', 'settings.local.json', 'CLAUDE.md', 'skills', 'commands', 'agents', 'plugins', 'projects',
          'output-styles', 'plans', 'history.jsonl', 'file-history', 'todos', 'ponytail-modes']
UPOZORI_5H, UPOZORI_7D = 90, 95
for d in (A, STANJE, SESIJE): os.makedirs(d, exist_ok=True)


def citaj(p, d=None):
    try: return json.load(open(p))
    except (OSError, ValueError): return d

def pisi(p, o):
    t = p + '.tmp'; json.dump(o, open(t, 'w'), ensure_ascii=False, indent=1); os.replace(t, p)

def nalozi():
    s = citaj(SPISAK)
    if not s: s = {'nalozi': [{'id': 'glavni', 'ime': 'Glavni', 'dir': None}], 'zadnji': 'glavni'}; pisi(SPISAK, s)
    return s

def dir_od(n): return n['dir'] or GLAVNI
def stanje_fajl(n): return n['dir'] + '/.claude.json' if n['dir'] else HOME + '/.claude.json'

def trenutni():
    cd = os.environ.get('CLAUDE_CONFIG_DIR')
    for n in nalozi()['nalozi']:
        if (n['dir'] or None) == (os.path.realpath(cd) if cd else None): return n
    return nalozi()['nalozi'][0]

def nalog(i):
    for n in nalozi()['nalozi']:
        if n['id'] == i or n['ime'].lower() == i.lower(): return n
    return None

def profil(n):   # email and plan as Claude Code itself stored them (no tokens are read)
    o = (citaj(stanje_fajl(n), {}) or {}).get('oauthAccount') or {}
    tip = o.get('organizationType') or ''; tier = o.get('organizationRateLimitTier') or o.get('seatTier') or ''
    plan = {'claude_max': 'Max', 'claude_pro': 'Pro', 'claude_team': 'Team', 'claude_enterprise': 'Enterprise'}.get(tip, tip or '?')
    m = re.search(r'(\d+x)', tier or '')
    return {'email': o.get('emailAddress'), 'plan': plan + (' ' + m.group(1) if m else ''), 'prijavljen': bool(o)}

def limit(n):
    s = citaj(f"{STANJE}/{n['id']}.json", {}) or {}
    now = time.time(); out = {}
    for k in ('five_hour', 'seven_day'):
        w = s.get(k) or {}
        pct, reset = w.get('pct'), w.get('reset')
        if reset and reset < now: pct = 0   # the window has rolled over since we last saw it
        out[k] = (pct, reset)
    out['star'] = s.get('ts'); return out

def vrijeme(t, dan=False):
    if not t: return '—'
    d = dt.datetime.fromtimestamp(t)
    return d.strftime(('%a ' if dan else '') + '%H:%M').replace('Mon', 'pon').replace('Tue', 'uto').replace('Wed', 'sri') \
        .replace('Thu', 'čet').replace('Fri', 'pet').replace('Sat', 'sub').replace('Sun', 'ned')

def preporuka():
    best, bv = None, 999
    for n in nalozi()['nalozi']:
        if not profil(n)['prijavljen']: continue
        l = limit(n); h, w = (l['five_hour'][0] or 0), (l['seven_day'][0] or 0)
        v = h if w < UPOZORI_7D else 200 + w
        if v < bv: best, bv = n, v
    return best

def red(n, s):
    p, l = profil(n), limit(n); h, w = l['five_hour'], l['seven_day']
    pct = lambda x: '—' if x[0] is None else f'{x[0]:.0f} %'
    return {'★': '★' if s and s['id'] == n['id'] else '', 'ime': n['ime'], 'email': p['email'] or '—', 'plan': p['plan'],
            '5h': f"{pct(h)} · reset {vrijeme(h[1])}", '7d': f"{pct(w)} · reset {vrijeme(w[1], True)}",
            'prijava': '✅' if p['prijavljen'] else '⚠️ nije prijavljen', 'id': n['id']}


# ---------------------------------------------------------------- what the running Claude Code tells us
def statusline():
    try: d = json.load(sys.stdin)
    except ValueError: d = {}
    n = trenutni(); rl = d.get('rate_limits') or {}
    s = citaj(f"{STANJE}/{n['id']}.json", {}) or {}
    for k in ('five_hour', 'seven_day'):
        w = rl.get(k)
        if w and w.get('used_percentage') is not None: s[k] = {'pct': w['used_percentage'], 'reset': w.get('resets_at')}
    if rl: s['ts'] = time.time(); pisi(f"{STANJE}/{n['id']}.json", s)
    pid = claude_pid()   # which running Claude Code this is, so /accounts <id> knows what to resume
    if d.get('session_id') and pid: pisi(f"{SESIJE}/{pid}.json", {'session': d['session_id'], 'cwd': (d.get('workspace') or {}).get('current_dir') or d.get('cwd'), 'nalog': n['id']})
    pony = ''
    pf = os.path.join(os.environ.get('CLAUDE_CONFIG_DIR') or GLAVNI, '.ponytail-active')
    if os.path.exists(pf) and os.path.exists(GLAVNI + '/ponytail-statusline.sh'):
        pony = subprocess.run(['bash', GLAVNI + '/ponytail-statusline.sh'], capture_output=True, text=True).stdout.strip() + ' · '
    l = limit(n); h, w = l['five_hour'][0], l['seven_day'][0]
    boja = lambda x, g: '' if x is None else ('\033[31m' if x >= g else '\033[33m' if x >= g - 20 else '\033[32m')
    tekst = lambda x, g, t: f"{boja(x, g)}{t} {'—' if x is None else f'{x:.0f}%'}\033[0m"
    print(f"{pony}{n['ime']} · {tekst(h, UPOZORI_5H, '5h')} · {tekst(w, UPOZORI_7D, '7d')}")

def hook():
    try: d = json.load(sys.stdin)
    except ValueError: return
    n = trenutni(); l = limit(n); h, w = (l['five_hour'][0] or 0), (l['seven_day'][0] or 0)
    if h < UPOZORI_5H and w < UPOZORI_7D: return
    znak = f"{A}/upozoren-{d.get('session_id')}-{n['id']}-{l['five_hour'][1]}"   # once per session and window
    if os.path.exists(znak): return
    open(znak, 'w').close()
    b = preporuka()
    if not b or b['id'] == n['id']:
        poruka = f"The user's Claude account „{n['ime']}” is at {h:.0f}% of its 5-hour limit and {w:.0f}% weekly, and no other saved account has more room. Tell them in one short line, in their language."
    else:
        bl = limit(b)
        poruka = (f"The user's Claude account „{n['ime']}” is at {h:.0f}% of its 5-hour limit and {w:.0f}% weekly. Before anything else, ask them in "
                  f"one short line, in their language, whether to continue this conversation on their account „{b['ime']}” ({(bl['five_hour'][0] or 0):.0f}% used). "
                  f"If they say yes, run exactly: python3 ~/.claude-accounts/accounts.py switch {b['id']}  — it ends this session and the same conversation "
                  f"resumes on that account within seconds. If they say no, carry on.")
    print(json.dumps({'hookSpecificOutput': {'hookEventName': 'UserPromptSubmit', 'additionalContext': poruka}}))


# ---------------------------------------------------------------- switching
def claude_pid():
    p = os.getppid()
    for _ in range(8):   # walk up to the Claude Code process that runs this command
        r = subprocess.run(['ps', '-o', 'ppid=,command=', '-p', str(p)], capture_output=True, text=True).stdout.strip()
        if not r: return None
        pp, cmd = r.split(None, 1)
        if re.search(r'(^|/)claude(\s|$)', cmd) or '/claude-code/' in cmd or re.search(r'/bin/claude\b', cmd): return p
        p = int(pp)
    return None

def switch(i):
    n = nalog(i)
    if not n: print(f'Nema naloga „{i}”. ' + ', '.join(x['id'] for x in nalozi()['nalozi'])); return 1
    if not profil(n)['prijavljen']: print(f"Nalog „{n['ime']}” nije prijavljen: pokreni `claude`, izaberi ga i prijavi se."); return 1
    if not os.environ.get('ACCOUNTS_LAUNCHER'):   # nobody would resume it: closing this session would just end it
        print('Ova sesija nije pokrenuta preko `claude` sa izborom naloga, pa je ne zatvaram. Otvori novi tab i pokreni `claude`.'); return 1
    pid = claude_pid(); s = citaj(f'{SESIJE}/{pid}.json', {}) if pid else {}
    if not pid or not s.get('session'):
        print('Ne nalazim ovu sesiju (pokrenuta je bez /accounts pokretača?). Izađi sa /exit i pokreni `claude` iz novog taba.'); return 1
    pisi(ZAHTJEV, {'nalog': n['id'], 'session': s['session'], 'cwd': s.get('cwd'), 'pid': pid, 'ts': time.time()})
    print(f"Prelazim na „{n['ime']}”: ova sesija se zatvara i isti razgovor se nastavlja za par sekundi.")
    sys.stdout.flush()
    subprocess.Popen(['sh', '-c', f'sleep 1.5; kill -TERM {pid}'], start_new_session=True)
    return 0


# ---------------------------------------------------------------- the launcher
def birac(stdscr, stavke, sel):
    curses.curs_set(0); curses.use_default_colors()
    while True:
        stdscr.erase(); h, w = stdscr.getmaxyx()
        stdscr.addstr(0, 0, 'Claude Code — izaberi nalog   (↑↓ Enter · r osvježi · d ukloni · q izlaz)'[:w - 1], curses.A_BOLD)
        for k, (oznaka, _) in enumerate(stavke):
            stdscr.addstr(2 + k, 0, ('› ' if k == sel else '  ') + oznaka[:w - 3], curses.A_REVERSE if k == sel else 0)
        c = stdscr.getch()
        if c in (curses.KEY_UP, ord('k')): sel = (sel - 1) % len(stavke)
        elif c in (curses.KEY_DOWN, ord('j')): sel = (sel + 1) % len(stavke)
        elif c in (10, 13, curses.KEY_ENTER): return stavke[sel][1]
        elif c in (ord('r'), ord('R')): return '__osvjezi'
        elif c in (ord('d'), ord('D')) and not stavke[sel][1].startswith('__'): return '__ukloni:' + stavke[sel][1]
        elif c in (ord('q'), 27): return None

def izaberi():
    while True:
        s = preporuka(); stavke = []; sel = 0
        for k, n in enumerate(nalozi()['nalozi']):
            r = red(n, s)
            stavke.append((f"{r['★'] or ' '} {r['ime']:<12} {r['email']:<34} {r['plan']:<8} 5h {r['5h']:<18} 7d {r['7d']:<22} {r['prijava']}", n['id']))
            if s and n['id'] == s['id']: sel = k
        stavke.append(('+ Dodaj nalog', '__dodaj'))
        izbor = curses.wrapper(birac, stavke, sel)
        if izbor == '__osvjezi': osvjezi(); continue
        if izbor and izbor.startswith('__ukloni:'):
            n = nalog(izbor.split(':', 1)[1])
            if n and input(f"Ukloniti „{n['ime']}” sa spiska? [d/N] ").strip().lower() in ('d', 'da', 'y'): print(ukloni(n['id'])); time.sleep(1.5)
            continue
        if izbor == '__dodaj':
            ime = input('Ime novog naloga (npr. Firma, Privat): ').strip()
            if ime: return dodaj(ime)['id']
            continue
        return izbor

def env_za(n):
    e = dict(os.environ, ACCOUNTS_LAUNCHER='1')   # tells switch() someone is waiting to resume this session
    if n['dir']: e['CLAUDE_CONFIG_DIR'] = n['dir']
    else: e.pop('CLAUDE_CONFIG_DIR', None)
    return e

def launch(args):
    s = nalozi()
    if args: n = nalog(s.get('zadnji') or 'glavni') or s['nalozi'][0]   # `claude <args>`: last account, no picker
    else:
        i = izaberi()
        if not i: return 0
        n = nalog(i)
    while True:
        s = nalozi(); s['zadnji'] = n['id']; pisi(SPISAK, s)
        if os.path.exists(ZAHTJEV): os.remove(ZAHTJEV)
        old = [signal.signal(x, signal.SIG_IGN) for x in (signal.SIGINT, signal.SIGQUIT)]   # Ctrl+C belongs to Claude Code
        try: rc = subprocess.call(['claude'] + args, env=env_za(n))
        finally: [signal.signal(x, o) for x, o in zip((signal.SIGINT, signal.SIGQUIT), old)]
        z = citaj(ZAHTJEV)
        if z and time.time() - z.get('ts', 0) < 120:
            n = nalog(z['nalog']); args = ['--resume', z['session']]
            if z.get('cwd') and os.path.isdir(z['cwd']): os.chdir(z['cwd'])
            print(f"\n→ nastavljam razgovor na nalogu „{n['ime']}”…\n"); continue
        b, cur = preporuka(), n
        h = limit(cur)['five_hour'][0] or 0
        if h >= 95 and b and b['id'] != cur['id'] and sys.stdin.isatty():   # the limit ran out (the last number seen may stop short of 100)
            if input(f"„{cur['ime']}” je potrošen. Nastavi na „{b['ime']}”? [Enter = da, n = ne] ").strip().lower() not in ('n', 'ne'):
                n = b; args = ['--continue']; continue
        return rc


def dodaj(ime):
    s = nalozi(); i = re.sub(r'[^a-z0-9]+', '-', ime.lower()).strip('-') or 'nalog'
    while nalog(i): i += '-2'
    d = f'{A}/{i}'; os.makedirs(d, exist_ok=True)
    for x in DIJELI:
        if os.path.exists(f'{GLAVNI}/{x}') and not os.path.lexists(f'{d}/{x}'): os.symlink(f'{GLAVNI}/{x}', f'{d}/{x}')
    g = citaj(HOME + '/.claude.json', {}) or {}   # the user's MCP servers and trusted folders come along; never the login
    pisi(f'{d}/.claude.json', {k: g[k] for k in ('mcpServers', 'projects', 'theme') if k in g})
    s['nalozi'].append({'id': i, 'ime': ime, 'dir': d}); pisi(SPISAK, s)
    print(f"Nalog „{ime}” dodat. Claude Code se sad otvara na njemu: prijavi se (/login ako ne ponudi sam)."); return s['nalozi'][-1]

def ukloni(i):   # off the list; its folder goes to obrisani/ (kept, nothing hard-deleted), shared parts are only links
    n = nalog(i)
    if not n: return f'Nema naloga „{i}”.'
    if not n['dir']: return 'Glavni nalog (~/.claude) se ne uklanja.'
    if n['id'] == trenutni()['id']: return f"Sad radiš na „{n['ime']}”: pređi na drugi nalog, pa ga ukloni."
    s = nalozi(); s['nalozi'] = [x for x in s['nalozi'] if x['id'] != n['id']]
    if s.get('zadnji') == n['id']: s['zadnji'] = 'glavni'
    os.makedirs(f'{A}/obrisani', exist_ok=True)
    if os.path.isdir(n['dir']): os.replace(n['dir'], f"{A}/obrisani/{n['id']}-{time.strftime('%Y%m%d-%H%M%S')}")
    for f in (f"{STANJE}/{n['id']}.json",):
        if os.path.exists(f): os.remove(f)
    pisi(SPISAK, s)
    return f"Nalog „{n['ime']}” je uklonjen sa spiska (folder je u ~/.claude-accounts/obrisani/). Prijava ostaje u Keychainu dok je ne odjaviš: ako hoćeš i nju, prije uklanjanja u tom nalogu ukucaj /logout."

def osvjezi(samo=None):   # a tiny request per account, read the limits Claude Code reports back
    for n in nalozi()['nalozi']:
        if (samo and n['id'] != samo) or not profil(n)['prijavljen']: continue
        print(f"osvježavam {n['ime']}…", flush=True)
        try:
            o = subprocess.run(['claude', '-p', 'ok', '--model', 'haiku', '--output-format', 'stream-json', '--verbose', '--max-turns', '1'],
                               env=env_za(n), capture_output=True, text=True, timeout=90).stdout
        except subprocess.TimeoutExpired: continue
        s = citaj(f"{STANJE}/{n['id']}.json", {}) or {}
        for line in o.splitlines():
            if '"rate_limit_event"' not in line: continue
            try: w = json.loads(line).get('rate_limit_info', {}).get('unifiedWindows', {})
            except ValueError: continue
            for k in ('five_hour', 'seven_day'):
                if w.get(k, {}).get('utilization') is not None: s[k] = {'pct': w[k]['utilization'] * 100, 'reset': w[k].get('resetsAt')}
        s['ts'] = time.time(); pisi(f"{STANJE}/{n['id']}.json", s)

def tabela():
    s, cur = preporuka(), trenutni()
    out = ['| | Nalog | Email | Plan | 5h | Sedmično | Prijava |', '| --- | --- | --- | --- | --- | --- | --- |']
    for n in nalozi()['nalozi']:
        r = red(n, s)
        out.append(f"| {r['★']}{' ← sad' if n['id'] == cur['id'] else ''} | {r['ime']} (`{r['id']}`) | {r['email']} | {r['plan']} | {r['5h']} | {r['7d']} | {r['prijava']} |")
    out.append('\nPrelazak: `/accounts <id>` · novi nalog: `/accounts add <ime>` · ukloni: `/accounts remove <id>` · svjež limit: `/accounts refresh`')
    return '\n'.join(out)


def instaliraj():   # the parts a plugin cannot set itself: the launcher function and the status line (both backed up)
    if os.name == 'nt': return 'Na Windowsu /accounts još ne radi (nema pokretača za PowerShell). Radi na macOS-u i Linuxu.'
    dst = A + '/accounts.py'
    if os.path.realpath(__file__) != os.path.realpath(dst): shutil.copy2(__file__, dst)   # a stable path for the launcher and the status line
    zsh = 'zsh' in os.environ.get('SHELL', ''); prof = HOME + ('/.zshrc' if zsh else '/.bashrc')
    uslov = '[[ -o interactive && -t 0 && -t 1 ]]' if zsh else '[[ $- == *i* && -t 0 && -t 1 ]]'
    fn = f'claude() {{ if {uslov}; then python3 ~/.claude-accounts/accounts.py launch "$@"; else command claude "$@"; fi }}'
    out = []
    staro = open(prof).read() if os.path.exists(prof) else ''
    if 'claude-accounts/accounts.py launch' not in staro:
        if staro: shutil.copy2(prof, prof + time.strftime('.bak-accounts-%Y%m%d-%H%M'))
        open(prof, 'a').write('\n# /accounts: `claude` first asks which saved account to use; a switch from inside a session resumes the same conversation\n' + fn + '\n')
        out.append(f'pokretač dodat u {prof}')
    else: out.append(f'pokretač već postoji u {prof}')
    sp = GLAVNI + '/settings.json'; st = citaj(sp, {}) or {}
    cmd = 'python3 ~/.claude-accounts/accounts.py statusline'
    if not st.get('statusLine'):
        if os.path.exists(sp): shutil.copy2(sp, sp + time.strftime('.bak-accounts-%Y%m%d-%H%M'))
        st['statusLine'] = {'type': 'command', 'command': cmd}; pisi(sp, st); out.append('statusna linija postavljena')
    elif st['statusLine'].get('command') != cmd: out.append('statusnu liniju NISAM dirao (već imaš svoju); limit se zapisuje samo uz našu')
    else: out.append('statusna linija već postoji')
    b = HOME + '/.local/bin/accounts'   # works without Claude: in a terminal, or as `!accounts …` inside a session at the limit
    os.makedirs(os.path.dirname(b), exist_ok=True)
    open(b, 'w').write('#!/bin/sh\n# /accounts without Claude (works at the limit too): accounts | accounts <id> | add | remove | refresh\nexec python3 ~/.claude-accounts/accounts.py komanda "$@"\n')
    os.chmod(b, 0o755); out.append('komanda `accounts` u ~/.local/bin')
    return 'Instalirano: ' + ' · '.join(out) + '. Otvori novi tab i pokreni `claude`.'

def komanda(a):
    a = a.split()
    if not a: print(tabela()); return 0
    if a[0] in ('install', 'instaliraj'): print(instaliraj()); return 0
    if a[0] in ('help', '-h', '--help'): print(__doc__); return 0
    if a[0] in ('refresh', 'osvjezi'): osvjezi(); print(tabela()); return 0
    if a[0] in ('remove', 'ukloni', 'rm'):
        print(ukloni(a[1]) if len(a) > 1 else 'Koji? /accounts remove <id>'); print(); print(tabela()); return 0
    if a[0] in ('add', 'dodaj'):
        if len(a) < 2: print('Daj ime: /accounts add Firma'); return 0
        n = dodaj(' '.join(a[1:]))
        print(f"\nPrijava se ne može obaviti unutar ove sesije: otvori novi tab, pokreni `claude`, izaberi „{n['ime']}” i prijavi se."); return 0
    return switch(a[0])

if __name__ == '__main__':
    c, rest = (sys.argv[1] if len(sys.argv) > 1 else ''), sys.argv[2:]
    if c == 'launch': sys.exit(launch(rest))
    if c == 'komanda': sys.exit(komanda(' '.join(rest)))
    if c == 'switch': sys.exit(switch(rest[0] if rest else ''))
    if c == 'install': print(instaliraj()); sys.exit(0)
    if c == 'statusline': statusline()
    elif c == 'hook': hook()
    elif c == 'refresh': osvjezi(rest[0] if rest else None); print(tabela())
    else: print(tabela())
