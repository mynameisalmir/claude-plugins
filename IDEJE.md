# Ideje za kasnije

## borrow
| # | Ideja | Kako |
| --- | --- | --- |
| 1 | izbor modela | `/borrow` šalje model uz zahtjev (Codex `-m`, Claude `--model`, Gemini `-m`); kolega na `/share` bira dozvoljene (npr. Codex samo `sol`, ne skupa `astra`); spisak pokazuje dozvoljene |
| 2 | ~~ime marketplacea `mynameisalmir`~~ ✅ urađeno 17.10. (`100ec10`) | `borrow@mynameisalmir`, `accounts@mynameisalmir` |
| 3 | Codex slike samo iz sesije tog zahtjeva (fix uz `7262aa2`) | danas se šalje svaka nova slika iz `~/.codex/generated_images`, pa ode i slika koju dijeli sam pravi u Codexu u isto vrijeme; uzeti samo folder čije je ime ID Codex sesije zahtjeva (isti kao u `rollout-…<id>.jsonl`). Usput: jedan nečitljiv folder (ima ih ~6.800) sad tiho baci sve slike, pa kolega dobije samo tekst bez greške. Uz test |

## accounts
| # | Ideja | Zašto |
| --- | --- | --- |
| 1 | ~~Windows (PowerShell pokretač, izbor bez curses)~~ ✅ 0.2.0 (19.10.) | provjera na Windowsu: `proba.py` |
| 2 | automatski prelazak kad limit pukne (uz jednu potvrdu unaprijed) | sad pita, pa čeka /exit ili da |
| 3 | prijava novog naloga u privatnom prozoru sama (BROWSER) | preglednik uzme već prijavljeni claude.ai nalog |
| 4 | `/accounts` pokazuje i Codex limit (iz njegovih logova, kao borrow) | svi limiti na jednom mjestu |
| 5 | email u `/accounts` iz pouzdanog izvora | 18.10. Glavni je pokazao blsw@outlook.com iako je prijavljen clicker.team (limiti su dokazali: 36 % pet naspram 0 % sub): Claude Code je upisao tuđi profil u `~/.claude.json` (20:48). Email/plan pamtiti po nalogu u `accounts.json` u trenutku prijave i ne čitati ga kasnije iz zajedničkog fajla |
