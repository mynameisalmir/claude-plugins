---
description: Tvoji Claude nalozi — limit svakog, prelazak na drugi usred razgovora, novi nalog (prvi put: /accounts install)
argument-hint: "[<id> | add <ime> | remove <id> | refresh | install]"
allowed-tools: Bash(python3 *)
---
!`python3 ~/.claude-accounts/accounts.py komanda $ARGUMENTS`

The output above came from the user's own computer before you were asked (so a switch works even at the usage limit).
Show it to the user exactly as it is, with nothing added. If it says the session is being switched, add nothing.
If it says the tool is missing, tell the user to run `/accounts install` once; for `install`, tell them in one line what it
changes (one function in the shell profile, the status line in ~/.claude/settings.json, the `accounts` command, all with a
backup) before running `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/accounts.py" install` on their word.
