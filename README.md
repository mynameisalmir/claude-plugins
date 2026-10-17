# borrow — pozajmi kolegin AI alat

Plugin za Claude Code: kolega podijeli svoj Claude, Codex ili Gemini u internoj mreži (`/share`), a ti mu pošalješ prompt
(`/borrow`). Prompt se izvrši na **njegovoj** pretplati, tek kad on odobri (ili ako ti vjeruje), a odgovor i fajlovi
(npr. slike) stignu kod tebe u `pozajmljeno/`. Niko se ne prijavljuje na tuđi nalog.

Za firmine planove u internoj mreži: dijeljenje lične pretplate sa drugom osobom pravila zabranjuju.

## Instalacija (Mac, Windows, Linux)

Treba Node 18+ (imaš ga ako imaš Codex ili Gemini CLI) i Claude Code.

```
claude plugin marketplace add mynameisalmir/claude-plugins
claude plugin install borrow@lumi-tim
```

Jednom po računaru postavi ime koje kolege vide i **isti tim kod kao kolege**:

```
node <plugin>/scripts/borrow.mjs setup --ime Marko --tim <tajni-kod-tima>
```

(ili u Claude Codeu: „postavi borrow ime Marko i tim kod …”).

## Upotreba

| Ko | Komanda |
| --- | --- |
| kolega koji daje | `/share` — izabere alate i da li ga pita za svaki zahtjev ili vjeruje nekima do nekog sata |
| kolega koji daje | `/share` opet — vidi zahtjeve, pa `odobri <id>` / `odbij <id>`; `/share stop` gasi |
| ti | `/borrow` — spisak ko šta dijeli i sa kolikim limitom (★ najslobodniji), izabereš i napišeš prompt |

## Kako radi

- Kolegin računar svake 3 s javlja u lokalnu mrežu (UDP 8764) šta dijeli, samo za tvoj tim kod; zahtjevi idu HTTP-om
  na port 8765 i potpisani su tim kodom.
- Prompt ide alatu preko stdin-a, nikad kroz komandnu liniju; radi u praznom privremenom folderu.
- Odobravanje sa strane koja daje radi samo na njegovom računaru (lokalni ključ).
- Limit: Codex iz njegovih lokalnih logova, Claude iz `/accounts` ako ga koristi; ništa se ne troši za prikaz.
- Mreže gdje broadcast ne prolazi (npr. WSL2): `setup --peer <ip-kolege>`.

Test bez pravih alata: `BORROW_TEST=1` dodaje alat `proba`.

---

# accounts — više Claude naloga na jednom računaru (macOS, Linux)

```
claude plugin install accounts@lumi-tim
```

Pa jednom u Claude Codeu: `/accounts install` (doda funkciju `claude` u `~/.zshrc` ili `~/.bashrc` i statusnu liniju; oboje
uz backup). Od tada `claude` prvo pokaže spisak naloga (★ = najviše slobodnog limita), `+ Dodaj nalog` dodaje novi.

| Komanda | Šta |
| --- | --- |
| `/accounts` | svi nalozi: email, plan, 5h i sedmični limit sa resetom |
| `/accounts <id>` | isti razgovor se nastavlja na drugom nalogu (sesija se sama zatvori i nastavi) |
| `/accounts add <ime>` · `remove <id>` · `refresh` | novi nalog · ukloni · svjež limit |

Dodatni nalozi dijele sve sa `~/.claude` osim prijave. Prijava drugog naloga: preglednik zna uzeti već prijavljeni
claude.ai nalog — u tom nalogu `/login`, link otvori u privatnom prozoru. Windows: još ne.
