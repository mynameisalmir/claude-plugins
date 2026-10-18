---
description: Pozajmi kolegin AI alat (Claude, Codex, Gemini) — izaberi kolegu i alat, pošalji prompt, dobij rezultat
argument-hint: "[<kolega> <alat> <prompt>]"
allowed-tools: Bash(node *)
---
The tool is `node "${CLAUDE_PLUGIN_ROOT}/scripts/borrow.mjs"` (call it B below; always write the full path). Arguments: `$ARGUMENTS`

1. If the arguments are empty or lack a prompt: run `B list` and show its table to the user exactly. Then ask, in one
   short question in the user's language, which colleague and tool, and what the prompt is. If nobody shares, say so
   and mention that the colleague runs /share, and that both must have the same team code (`B setup --tim <kod>`).
2. With colleague, tool and prompt known: write the prompt to a temporary file exactly as the user gave it, and run
   `B ask <kolega> <alat> --out "<current project>/pozajmljeno/<short-name>" < <that file>` in the background (it waits for
   the colleague's approval and the work; images can take minutes). Tell the user in one line that it was sent.
   If the task is work ON THE PROJECT (fix, change, add code), run it from the project folder with `--repo`
   (`--putanje a,b` to send only some folders): the colleague's tool gets a copy of the last commit (no .env or keys) and
   only its diff comes back. Say first that uncommitted changes are not sent.
3. When it finishes, show the answer text, and list the files it saved. Show any image it saved (png/jpg/webp) to the user.
   With `--repo`: show the change summary it printed and offer `B primijeni <id>` — it puts the change on a new branch
   `borrow/<id>` in its own folder; the user's working folder is never touched. Run it only on their word.
   If the colleague refused or an error came back, say so plainly.
