# Changelog

> **English** · [简体中文](./CHANGELOG.zh-CN.md)

All notable changes to this project will be recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows [Semantic Versioning](https://semver.org/).

## [1.1.3] - 2026-05-30

### Fixed
- CLI launcher now retries the Electron binary download via a mirror (`npmmirror.com`) when the default GitHub source fails — common in regions where `github.com` is blocked or rate-limited. Prints actionable `ELECTRON_MIRROR` instructions (bash + PowerShell) if both attempts fail. Respects an existing `ELECTRON_MIRROR` if the user set one.

[1.1.3]: https://github.com/Lition13/claude-session-viewer/releases/tag/v1.1.3

## [1.1.2] - 2026-05-30

### Fixed
- CLI launcher now self-heals when the Electron runtime binary failed to download during install (interrupted `postinstall` left `electron/path.txt` missing, causing a cryptic `ENOENT` crash on launch). The launcher detects the missing binary, runs Electron's installer once, and then starts the app — with a clear message and actionable fallback instructions if the download still fails.

[1.1.2]: https://github.com/Lition13/claude-session-viewer/releases/tag/v1.1.2

## [1.1.1] - 2026-05-30

### Security
- Upgraded Electron from `^33.4.0` to `^42.3.0`, clearing all known Electron runtime advisories (`GHSA-vmqv-hx8q-j7mg` and related). Production install (`npm audit --omit=dev`) now reports 0 vulnerabilities.

[1.1.1]: https://github.com/Lition13/claude-session-viewer/releases/tag/v1.1.1

## [1.1.0] - 2026-05-30

### Added

#### Agent Teams / swarm support
- Dedicated renderers for multi-agent (Agent Teams) tool calls that previously fell through to a raw JSON dump: `TeamCreate`, `TeamDelete`, `SendMessage`, `Agent`, `TaskOutput`, `TaskStop`
- Structured task rows for `TaskList` / `TaskGet` (status icon, id, owner badge, blocked-by indicator)
- `SendMessage` shows sender → target routing, summary, message body, and structured protocol messages (shutdown / plan-approval)
- `Agent` shows sub-agent type, status, token / tool-call / duration stats, prompt and result
- Teammate messages: `<teammate-message>` blocks delivered as user text are now parsed and rendered as task-assignment, plan-approval, shutdown, and task-completed cards; idle / terminated / shutdown-approved lifecycle noise is silently hidden
- New chip colors and header summaries for the above tools
- HTML export mirrors all of the above

### Changed
- Parser now preserves the structured `toolUseResult` object on tool results so rich renderers can read routing / tasks / team metadata

[1.1.0]: https://github.com/Lition13/claude-session-viewer/releases/tag/v1.1.0

## [1.0.0] - 2026-04-30

Initial public release.

### Highlights
- A complete, local-only viewer for Claude Code sessions
- Per-tool rendering, full token + cost analytics, HTML / Markdown export
- Three themes (dark / light / sepia) with a custom frameless titlebar
- Custom app icon

### Added

#### Browsing & rendering
- Session browser: scans every Claude Code session under `~/.claude/projects/`, grouped by project and date
- Full conversation rendering: user messages, assistant replies, collapsible thinking blocks, tool calls and results
- Tool-specific renderers: Edit (diff), Read, Write, Bash, Grep, Glob, TodoWrite, AskUserQuestion, TaskCreate/Update, Agent, WebFetch, WebSearch, and others
- Slash command rendering: detects `<command-name>` triples and pairs them with `local_command` output, with ANSI colors preserved
- Sub-agent conversation viewer
- Replay mode: step-through playback with pause / speed (0.5x–5x) / seek and full keyboard support
- Shiki syntax highlighting (30+ languages, no WASM dependency)

#### Analytics
- Per-session stats: token usage (input / output / cache read / cache write), tool ranking, cost estimate, output-tokens-per-turn chart
- Global dashboard: cross-session totals, daily trend, cumulative cost, model breakdown
- Insights: health score and inefficiency detection (repeated calls, fix loops, empty results, excessive reads, large-write-then-edit)
- Aggregation across main session + sub-agents with last-write-wins per `message.id`

#### Export
- HTML export: self-contained offline file matching the in-app rendering, including ANSI-colored slash commands and per-tool views
- Markdown export
- Raw JSON view

#### Search & management
- Cross-session search: click a hit to jump straight to the matching message
- In-session search (Ctrl+F)
- Session deletion: cleans up all 6 related locations (jsonl, sub-agents, file-history, telemetry, tasks, index)
- Bulk deletion
- "Open in Claude Code": one-click `claude --resume`; on Windows prefers Windows Terminal
- File watcher: auto-refresh on new sessions

#### UI & personalization
- Three themes: Dark, Light, and Sepia (paper) for long-form reading
- Custom frameless titlebar with built-in window controls (minimize / maximize / close); native menu bar removed in favor of in-app shortcuts
- Linear / Notion-inspired visual design: refined design tokens (4-step elevation, accent ramp, soft borders), 2px role rails on message bubbles, soft tinted tool chips, slim auto-fading scrollbars, fade-in modal overlays with backdrop blur
- Custom font (6 options) and font size
- Model pricing config: built-in Claude Opus / Sonnet / Haiku, plus user-defined models (GPT-4o, DeepSeek, etc.)
- App icon (window + Windows taskbar + packaged installer)

[1.0.0]: https://github.com/Lition13/claude-session-viewer/releases/tag/v1.0.0
