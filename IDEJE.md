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
| 1 | Windows (PowerShell pokretač, izbor bez curses) | danas radi samo macOS i Linux |
| 2 | automatski prelazak kad limit pukne (uz jednu potvrdu unaprijed) | sad pita, pa čeka /exit ili da |
| 3 | prijava novog naloga u privatnom prozoru sama (BROWSER) | preglednik uzme već prijavljeni claude.ai nalog |
| 4 | `/accounts` pokazuje i Codex limit (iz njegovih logova, kao borrow) | svi limiti na jednom mjestu |
