---
name: webui-system-management
description: >
  Operate the Hermes Trading Web UI as a long-lived service. Use whenever the
  user asks to open / show / launch / start / stop / restart / update the
  trading UI, dashboard, charts UI, or "the web UI", or asks what URL it's on.
  Covers: knowing where the repo lives, starting/stopping/restarting the
  server, finding its port, and pulling updates (which also refreshes the
  trading-widgets skill). Works for any agent runtime (Hermes, Claude Code,
  Codex, etc.) that can run shell commands and keep notes/memory.
---

# Web UI System Management

You manage the **Hermes Trading Web UI** server for the user. This skill makes
you the operator: you know where it lives, how to bring it up or down, what URL
it's serving, and how to keep it (and the `trading-widgets` skill) up to date.

It pairs with the `trading-widgets` skill (the rendering contract). Keep **both**
in your active skill set.

## 1. Know where it lives (persist this to memory)

The first time you set this up, record these facts in your long-term memory /
notes so future sessions can act without re-deriving them:

- `WEBUI_REPO` — absolute path to the repo clone (e.g. `~/Development/hermes-trading-webui`)
- `WEBUI_HOST` / `WEBUI_PORT` — where it binds (default `127.0.0.1:8787`)
- `WEBUI_URL` — `http://<host>:<port>`

> Hermes: save with the `memory` toolset (a note like
> `webui: repo=<path> url=http://127.0.0.1:8787 manage via ./ctl.sh`).
> Other agents: write the same line to your persistent notes / MEMORY file.

If the path isn't in memory yet, find it:
```bash
# the canonical clone location used by the installer:
ls -d ~/hermes-trading-webui ~/Development/hermes-trading-webui 2>/dev/null
# or locate by file:
find ~ -maxdepth 4 -name ctl.sh -path '*hermes-trading-webui*' 2>/dev/null | head -1
```
If it isn't cloned anywhere, clone it (see the install guide
`INSTALL_FOR_AGENTS.md` in the repo, or):
```bash
git clone https://github.com/singhvedant/hermes-trading-webui.git ~/hermes-trading-webui
```
Then record the path in memory.

## 2. Start / open the UI

```bash
cd "$WEBUI_REPO"
./ctl.sh start            # background daemon, owns ~/.hermes/webui.pid
./ctl.sh status           # confirm: "● hermes-webui — running" + Health: ok
```
Report `WEBUI_URL` to the user (default `http://127.0.0.1:8787`). To expose on
the LAN: `HERMES_WEBUI_HOST=0.0.0.0 ./ctl.sh start`.

`ctl.sh start` is idempotent — if it's already up it says so and does nothing.

## 3. Find the port (when memory is missing or stale)

```bash
cd "$WEBUI_REPO" && ./ctl.sh status     # prints bound host:port + health
# fallback if started another way:
lsof -nP -iTCP -sTCP:LISTEN | grep -i python   # find the listening port
```
Update memory if the port differs from what you stored.

## 4. Stop

```bash
cd "$WEBUI_REPO" && ./ctl.sh stop       # SIGTERM, waits, then SIGKILL
```
> `ctl.sh stop` only stops a server **it** started (it owns the PID file). If the
> server was launched with `./start.sh` or bare `python3 bootstrap.py`, stop it
> by port instead: `lsof -iTCP:$WEBUI_PORT -sTCP:LISTEN` → `kill <PID>`.

## 5. Restart (after an update, or to apply config changes)

```bash
cd "$WEBUI_REPO" && ./ctl.sh restart
./ctl.sh status
```
Static asset changes (CSS/JS) only need a browser hard-refresh, not a restart.

## 6. Update the UI **and** refresh skills

Pull the latest UI and re-sync the skills it ships so your widget vocabulary
stays current. Run this when the user asks to "update the trading UI" or
periodically as maintenance:

```bash
cd "$WEBUI_REPO"
git pull origin master

# Re-install every skill the repo ships into the agent skills dir, so updated
# or newly added skills (e.g. trading-widgets gaining a new widget type) take
# effect. Safe to re-run; it overwrites in place.
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
mkdir -p "$HERMES_HOME/skills"
for d in skills/*/; do
  name="$(basename "$d")"
  rm -rf "$HERMES_HOME/skills/$name"
  cp -R "$d" "$HERMES_HOME/skills/$name"
done

./ctl.sh restart        # pick up server/template changes
```
After updating, re-read `skills/trading-widgets/SKILL.md` if its contents
changed so you emit any new widget types correctly. Then tell the user what
changed (summarize `git log` since the previous pull if useful).

> Keep `trading-widgets` and `webui-system-management` **enabled** in the Skills
> panel (the layers icon in the UI's left rail). If a skill is toggled off there
> it won't load into the agent.

## 7. Quick reference

| User says | You do |
|---|---|
| "open / show the trading UI" | `./ctl.sh start` → report URL |
| "what's the UI URL / port" | `./ctl.sh status` (or recall from memory) |
| "stop the UI" | `./ctl.sh stop` |
| "restart the UI" | `./ctl.sh restart` |
| "update the trading UI" | §6: `git pull` + re-sync skills + restart |
| "is the UI running?" | `./ctl.sh status` + `curl -fsS $WEBUI_URL/health` |

Always confirm the outcome with `./ctl.sh status` (and a `/health` check) before
telling the user it's up — report the real state, including failures with the
log tail from `./ctl.sh logs --lines 50 --no-follow`.
