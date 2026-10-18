# claude-plugins

Dva plugina za Claude Code, za tim koji radi u istoj internoj mreži na firminim planovima.

- **Posao ne staje kad se potroši limit.** Pređeš na drugi svoj nalog i nastaviš isti razgovor (`accounts`), ili zadatak
  pošalješ kolegi (`borrow`).
- **Kolegin alat bez kolegine prijave.** Ako kolega ima Codex, Claude ili Gemini, a ti trebaš sliku ili posao na kodu,
  zadatak se izvrši na **njegovoj** pretplati, tek kad on to odobri. Niko se ne prijavljuje na tuđi nalog.
- **Rad na projektu, bezbjedno.** Kolegin alat dobije kopiju tvog projekta (bez `.env` i ključeva), a nazad stiže samo
  izmjena, na novoj grani. Tvoj radni folder se ne dira.
- **Radi i kad Claude ne radi.** Sve ima i komandu u terminalu (`accounts`, `borrow`, `share`), pa ne zavisi od tvog limita.

> Za firmine planove u internoj mreži. Dijeljenje lične pretplate sa drugom osobom pravila zabranjuju.

---

## Instalacija

Treba Claude Code i Node 18+ (imaš ga ako imaš Codex ili Gemini CLI).

```
claude plugin marketplace add mynameisalmir/claude-plugins
claude plugin install borrow@mynameisalmir
claude plugin install accounts@mynameisalmir
```

Jednom po računaru:

| Šta | Komanda |
| --- | --- |
| komande `borrow` i `share` u terminalu | `node <plugin>/scripts/borrow.mjs install` (kasnije samo `borrow install`) |
| ime koje kolege vide i **isti tim kod kao kolege** | `borrow setup --ime Marko --tim <tajni-kod-tima>` |
| `accounts`: pokretač, statusna linija i komanda `accounts` (macOS, Linux) | u Claude Codeu `/accounts install` |

Poslije ažuriranja plugina ponovi `borrow install` i `/accounts install`.

---

## borrow — pozajmi kolegin AI alat

### Kako izgleda

| Ko | Šta radi |
| --- | --- |
| **kolega** (daje) | `/share` (ili `share --alati codex,claude --nacin pitaj`): bira šta dijeli i da li odobrava svaki zahtjev ili nekome vjeruje do nekog sata |
| **ti** (tražiš) | `/borrow` (ili `borrow list`): vidiš ko šta dijeli i sa kolikim limitom (★ = najslobodniji), pa pošalješ prompt |
| **kolega** | stigne mu obavještenje; `/share` pokaže ko traži, koji alat i cijeli prompt → `odobri <id>` ili `odbij <id>` |
| **ti** | stigne odgovor i fajlovi (npr. slika od Codexa) u `pozajmljeno/` |

### Dvije vrste zadatka

| Vrsta | Komanda | Šta kolegin alat dobije | Šta stigne nazad |
| --- | --- | --- | --- |
| **prompt** (slika, tekst, pitanje) | `borrow ask Marko codex "nacrtaj …"` | samo tekst prompta | odgovor + fajlovi koje napravi |
| **rad na projektu** | iz foldera projekta: `borrow ask Marko claude --repo "popravi bug u login.ts"` | kopiju **zadnjeg commita**, bez `.env*`, `*.pem`, `*.key`, `id_rsa*`; `--putanje src,docs` šalje samo dio | samo **izmjenu** (git diff) |

Izmjenu projekta primijeniš sa `borrow primijeni <id>`: ide na novu granu `borrow/<id>`, u poseban folder pored projekta
(git worktree). Ti pregledaš (`git diff`), pustiš testove i spojiš (`git merge borrow/<id>`), ili odustaneš. Necommitovane
izmjene se ne šalju i ostaju netaknute.

Kolegin alat radi samo u privremenom folderu, ne vidi tvoje okruženje (`node_modules`, bazu) i ne može pokrenuti tvoj
projekat. Zato je provjera rezultata uvijek na tebi. Jedan zahtjev je jedan odgovor, nije razgovor.

### Ispod haube

| Dio | Kako |
| --- | --- |
| ko dijeli | kolegin računar svake 3 s javlja u lokalnu mrežu (UDP 8764) šta dijeli i limit, samo članovima istog tim koda |
| zahtjev | HTTP na kolegin port 8765, potpisan tim kodom (i kopija projekta); prompt ide alatu preko stdin-a, nikad kroz komandnu liniju |
| odobravanje | radi samo na kolegino računaru (lokalni ključ) |
| limit | Codex iz njegovih lokalnih logova, Claude iz `accounts` (ako ga koristi); prikaz ne troši ništa |
| mreže bez broadcasta (npr. WSL2) | `borrow setup --peer <ip-kolege>` |

---

## accounts — više Claude naloga na jednom računaru (macOS, Linux)

| Komanda | Šta |
| --- | --- |
| `claude` | prvo spisak naloga (★ = najviše slobodnog limita), strelicom izabereš; `+ Dodaj nalog`, `d` ukloni, `r` osvježi |
| `/accounts` ili `accounts` | svi nalozi: email, plan, 5h i sedmični limit sa resetom |
| `/accounts <id>` ili `accounts <id>` | **isti razgovor** se nastavlja na drugom nalogu (sesija se sama zatvori i nastavi) |
| `add <ime>` · `remove <id>` · `refresh` | novi nalog · ukloni sa spiska · svjež limit (sitan zahtjev po nalogu) |
| limit ≥ 90 % | Claude te pita da li da pređete na nalog sa najviše slobodnog |

Dodatni nalozi dijele sve sa `~/.claude` osim prijave: skillove, memoriju, podešavanja i historiju. Kod prijave novog
naloga preglednik zna uzeti već prijavljeni claude.ai nalog: u tom nalogu `/login`, pa link otvori u privatnom prozoru.

---

## Kad Claude zakuca limit

Slash komande `/borrow` i `/share` izvršava Claude, pa kad je limit potrošen ne odgovaraju. Komande u terminalu rade
uvijek; u sesiji ih pokreneš sa `!` ispred, i tada se izvršavaju bez Claudea:

| Komanda | Šta |
| --- | --- |
| `!accounts privatni` | pređeš na drugi svoj nalog, isti razgovor se nastavlja |
| `!borrow list` · `!borrow ask Marko claude --repo "…"` · `!borrow primijeni <id>` | pozajmica |
| `!share status` · `!share odobri <id>` · `!share stop` | strana koja daje |

`/accounts <id>` radi i na limitu, jer se prebacivanje desi na tvom računaru prije nego što se Claudeu išta pošalje.

Test bez pravih alata: `BORROW_TEST=1` dodaje alat `proba`. Ideje za dalje: [IDEJE.md](IDEJE.md).
