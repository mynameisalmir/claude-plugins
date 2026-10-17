---
description: Tvoji Claude nalozi — limit svakog, prelazak na drugi usred razgovora, novi nalog (prvi put: /accounts install)
argument-hint: "[<id> | add <ime> | remove <id> | refresh | install]"
allowed-tools: Bash(python3 *)
---
Run `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/accounts.py" komanda $ARGUMENTS` and show the user its output exactly as it is
(it is already a table or a short message), with nothing added. If it says the session is being switched, add nothing.
For `install`: first tell the user in one line what it changes (one function in the shell profile, the status line in
~/.claude/settings.json, both with a backup) and run it only after they agree.
