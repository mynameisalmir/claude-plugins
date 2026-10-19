#!/usr/bin/env python3
"""Self-check of the switch on this computer (macOS, Linux, Windows): python3 proba.py   (Windows: py -3 proba.py)

A fake `claude` in a temporary home asks for a switch the way `!accounts privatni` does; the real launcher has to end it
and start it again on the other account with --resume of the same session, in the folder the session was in.
Touches nothing outside the temporary folder and spends no limit."""
import json, os, subprocess, sys, tempfile

SKRIPTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'accounts.py')
h = tempfile.mkdtemp(prefix='accounts-proba-č-')   # č: Windows paths and pipes outside cp1252
kanta, log, radni = os.path.join(h, 'bin'), os.path.join(h, 'log.jsonl'), os.path.join(h, 'radni-ž')
for d in (kanta, radni, os.path.join(h, '.claude', 'projects')): os.makedirs(d)
lazni = os.path.join(kanta, 'lazni.py')
open(lazni, 'w', encoding='utf-8').write(f'''import json, os, subprocess, sys, time
open({log!r}, 'a', encoding='utf-8').write(json.dumps({{'args': sys.argv[1:], 'dir': os.environ.get('CLAUDE_CONFIG_DIR'), 'cwd': os.getcwd()}}) + '\\n')
if '--resume' in sys.argv: sys.exit(0)
py = [sys.executable, {SKRIPTA!r}]
ulaz = json.dumps({{'session_id': 'S1', 'cwd': {radni!r}, 'rate_limits': {{'five_hour': {{'used_percentage': 97}}}}}}, ensure_ascii=False)
subprocess.run(py + ['statusline'], input=ulaz.encode('utf-8'), capture_output=True)   # what Claude Code sends, in UTF-8
subprocess.run(py + ['komanda', 'privatni'])   # = !accounts privatni
time.sleep(30)   # the launcher has to end this
''')
if os.name == 'nt': open(os.path.join(kanta, 'claude.cmd'), 'w').write(f'@"{sys.executable}" "{lazni}" %*\n')
else:
    open(os.path.join(kanta, 'claude'), 'w').write(f'#!/bin/sh\nexec "{sys.executable}" "{lazni}" "$@"\n'); os.chmod(os.path.join(kanta, 'claude'), 0o755)

env = dict(os.environ, HOME=h, USERPROFILE=h, PATH=kanta + os.pathsep + os.environ['PATH'])
for k in ('CLAUDE_CONFIG_DIR', 'ACCOUNTS_LAUNCHER'): env.pop(k, None)
py = [sys.executable, SKRIPTA]
subprocess.run(py + ['komanda', 'add', 'Privatni'], env=env, capture_output=True, check=True)
privatni = os.path.join(h, '.claude-accounts', 'privatni')
json.dump({'oauthAccount': {'emailAddress': 'p@primjer.ba'}}, open(os.path.join(privatni, '.claude.json'), 'w'))
r = subprocess.run(py + ['launch', '--proba'], env=env, cwd=h, capture_output=True, timeout=60)

pokretanja = [json.loads(l) for l in open(log, encoding='utf-8')]
provjere = [
    ('dva pokretanja: prvo, pa nastavak', len(pokretanja) == 2),
    ('nastavak je --resume S1', len(pokretanja) == 2 and pokretanja[1]['args'] == ['--resume', 'S1']),
    ('nastavak je na nalogu Privatni', len(pokretanja) == 2 and os.path.samefile(pokretanja[1]['dir'] or h, privatni)),
    ('nastavak je u folderu sesije', len(pokretanja) == 2 and os.path.samefile(pokretanja[1]['cwd'], radni)),
    ('Privatni dijeli projects sa ~/.claude', os.path.samefile(os.path.join(privatni, 'projects'), os.path.join(h, '.claude', 'projects'))),
]
for ime, ok in provjere: print(('OK   ' if ok else 'PADA ') + ime)
if not all(ok for _, ok in provjere):
    print('\npokretanja:', pokretanja, '\nlauncher:', r.stdout.decode('utf-8', 'replace'), r.stderr.decode('utf-8', 'replace'), '\nfolder:', h); sys.exit(1)
