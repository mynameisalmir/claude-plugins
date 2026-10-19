---
description: Tvoji Claude nalozi — limit svakog, prelazak na drugi usred razgovora, novi nalog (prvi put: /accounts install)
argument-hint: "[<id> | add <ime> | remove <id> | refresh | install]"
allowed-tools: Bash(~/.local/bin/accounts*), Bash(python3 *), Bash(python *), Bash(py *)
---
!`~/.local/bin/accounts $ARGUMENTS`

The output above came from the user's own computer before you were asked (so a switch works even at the usage limit).
Show it to the user exactly as it is, with nothing added. If it says the session is being switched, add nothing.
If it says the tool is missing (No such file), tell the user to run `/accounts install` once; for `install`, tell them in one line what it
changes (one function in the shell profile, the status line in ~/.claude/settings.json, the `accounts` command, all with a
backup; on Windows also `claude` in the PowerShell profile) before running `python3 "${CLAUDE_PLUGIN_ROOT}/scripts/accounts.py" install`
on their word. On Windows `python3` is often missing or a Microsoft Store stub: then use `python`, or `py -3`; with no Python
at all, tell them to install it once (`winget install Python.Python.3.13`) and open a new terminal.
