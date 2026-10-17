---
description: Podijeli svoje AI alate (Claude, Codex, Gemini) kolegama u internoj mreži — pregled, odobri, odbij, ugasi
argument-hint: "[status | odobri <id> | odbij <id> | stop | --alati codex,claude --nacin pitaj|vjerujem --ko ime1,ime2 --do 20:00]"
allowed-tools: Bash(node *)
---
The tool is `node "${CLAUDE_PLUGIN_ROOT}/scripts/borrow.mjs"` (call it B below; always write the full path). Arguments: `$ARGUMENTS`

- Arguments `status`, `odobri <id>`, `odbij <id>` or `stop`: run `B share <arguments>` and show the output exactly.
- Arguments with options (`--alati …`): run `B share <arguments>` and show the output.
- No arguments: run `B share status`. If it already shares, show the status table (pending requests)
  and, if some wait, ask which to approve. If it does not share yet, ask the user in ONE short question, in their
  language: which tools to share (default: every one installed here), and whether to ask for each request or to trust
  certain colleagues until a time. Then run `B share --alati … --nacin pitaj|vjerujem [--ko …] [--do HH:MM]`.
- A pending request: before approving, run `B share prompt <id>` and show the user who asks, which tool and the full prompt; approve only on their
  word. Never approve or refuse on your own.
- If the output says no team code is set, tell the user that colleagues must use the same one: `B setup --tim <kod>`
  (and `B setup --ime <ime>` for the name colleagues see).
