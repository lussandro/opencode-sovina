<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">The open source AI coding agent.</p>
<p align="center">
  <a href="https://opencode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/@opencode/cli"><img alt="npm" src="https://img.shields.io/npm/v/@opencode/cli?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/opencode/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/opencode/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

---

## opencode-sovina

A fork of OpenCode that spends fewer tokens and tells you what it spent. Same agent and models; less ceremony in the prompt, in tool output and in history. Every change below says how it was verified, and what was not.

### What changed

| Change | What it does | Effect | Evidence |
| --- | --- | --- | --- |
| **Compact skill catalog** | One line per skill (`- id: description`), descriptions cut at 300 characters on a sentence or word boundary. Skills still load in full when used. | 4490 → 1995 tokens for 32 skills (-56%) | Measured on a real install |
| **Code Mode on demand** | `execute` and its catalog are only offered when an MCP server or other external tool exists. | About -1,200 tokens per request with no MCP | Measured (6 of the 8 built-in tools; a floor) |
| **Leaner tool output** | `glob` returns paths relative to the project; `grep` shows a 400-character window centered on the match and drops the blank line after each hit. | `glob` -40% (100 paths); `grep` -8% typical, -80% on minified lines | Measured on this repo with real `rg` output |
| **Prune cold tool output** | Replaces old `read`/`grep`/`glob`/`shell`/`webfetch` output with a stub, but only after the prompt cache has gone cold. | -7% to -45% cost, depending on how often you pause | **Simulated**, not measured in real sessions |
| **Repeated-call dedupe** | A call whose input and output match an earlier one still in view becomes a pointer to it. | Depends on your workflow | **Not measured** |
| **Caveman replies** (default on) | Terse chat replies. Code, commands, paths and errors stay verbatim; warnings and destructive actions stay in full sentences. | Costs about 240 input tokens (cached) | Output saving **not measured** |
| **Dev skills** | Six lean skills in `skills/`: `dev-debugging`, `dev-testing`, `dev-backend`, `dev-frontend`, `dev-infra`, `dev-review`. | About 410 tokens each when loaded, against 2,000 to 9,000 for typical skills | Measured; size is enforced by a test |
| **Honest cost reporting** | `generate` and warming usage now count toward session cost; every request records where its input tokens come from. | See [Measuring](#measuring) | Tested |

### What is and is not proven

- **Measured:** the skill catalog, Code Mode and tool-output numbers above. They are real sizes, not estimates, but they are *sizes*: the saving per request is that many tokens times your cache price, roughly 1% to 2% of a typical request each.
- **Simulated:** pruning. Cutting history in the middle of a conversation invalidates the provider cache, which in the simulation cost up to 94% more in long sessions with Anthropic-style pricing (and saved a few percent only in short ones). So this fork prunes only when the cache is already cold, where it is free. The -7% to -45% assumes you pause between prompts often enough; your real number depends on that. Set `prune.idle` to match your provider's cache lifetime.
- **Not verified:** whether Caveman actually shortens output for your models, and how often dedupe fires. Measure both before trusting them (see below).
- **Not done:** an opt-in one-hour cache lifetime, and a leaner `general` subagent.

### Configuration

All three are optional; these are the defaults.

```jsonc
{
  "caveman": "full",   // "lite" trims filler only; false restores the stock style
  "prune": true,       // or { "idle": "5 minutes", "keep": 6, "min": 10000 }
  "codemode": "auto"   // "on" always offers execute, "off" never does
}
```

- `prune.idle` is how long without a response before the cache is assumed cold. Use `"0 seconds"` for providers with no prompt cache, where pruning eagerly is cheaper.
- `prune.keep` is how many recent results are never pruned. `prune.min` is the least a prune must remove to be worth doing.
- `prune: false` also turns off repeated-call dedupe.
- `codemode: "auto"` hides OpenCode's own rarely used tools (worktrees, session rename, model list). Use `"on"` if you rely on them.

### Measuring

```bash
opencode stats --cost
```

shows cost per prompt and per step, and where the average request's input tokens come from (example output):

```
COST & TOKENS
  cost                $12.34
  cached input        32.3%
  cost / prompt       $3.08
  cost / step         $2.06
  tokens / step       3.1k

REQUEST CONTEXT (avg est. tokens over 6 requests)
  tool results             6k   60.0%  ████████████
  tool definitions       2.5k   25.0%  █████
  system prompt            1k   10.0%  ██
```

The breakdown is an estimate (about 4 characters per token), recorded on each step. To judge Caveman or pruning, run the same task twice, once with the feature off, and compare `output`, `cost / prompt` and `tool results`.

### Skills

```bash
script/install-skills.sh   # links skills/dev-* into ~/.config/opencode/skills
```

It never overwrites an existing skill of the same name. The six skills add about 260 tokens to the catalog, so they pay off together with `skills/coding-profile.json`: merge its `policies` into your config to hide 13 skills that are not about code. On the install it was measured on, that took the catalog from 4490 tokens (old format) to 1423 with the six dev skills included.

### Developing

```bash
bun install
cd packages/core && bun run test       # also: packages/{schema,client,cli}
```

- Tests need [ripgrep](https://github.com/BurntSushi/ripgrep) on `PATH`; without it the `Ripgrep` and `search tools` suites fail.
- Use a recent Node for `bun run lint` and `bun run typecheck`, the checks the pre-push hook runs. Both passed with Node 24.0.1. With Node 20.19 the root typecheck crashed turbo with a segfault and oxlint could not load its TypeScript plugin.
- `core` runs about 6,500 tests in a few minutes. The GitLab OAuth tests can fail in the full run and pass on their own; they bind a local callback port, so run them in isolation if they fail.

### Staying in sync with upstream

```bash
git fetch upstream && git rebase upstream/dev
```

Most changes are new files. These existing files are the likely conflicts: `core/src/session/{context,generate,compaction,stats}.ts`, `core/src/skill/instructions.ts`, `core/src/tool/plugin/{glob,grep}.ts`, `core/src/plugin/internal.ts`, and `schema/src/{config,session-event,token-usage,session-stats}.ts`. Regenerate the client with `bun run generate` in `packages/client` after resolving schema conflicts.

---

[![OpenCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://opencode.ai)

---

### Installation

```bash
# YOLO
curl -fsSL https://opencode.ai/v2/install | bash

# Package managers
npm i -g @opencode/cli@latest      # or bun/pnpm/yarn
brew install anomalyco/tap/opencode-v2 # macOS and Linux (recommended, always up to date)
brew install opencode              # macOS and Linux (official brew formula, updated less)
sudo pacman -S opencode            # Arch Linux (Stable)
paru -S opencode-beta              # Arch Linux (Latest from AUR)
mise use -g opencode               # Any OS
nix run github:anomalyco/opencode  # Nix
```

> [!TIP]
> Remove versions older than 0.1.x before installing.

### Desktop App (BETA)

OpenCode is also available as a desktop application. Download it from [opencode.ai/download](https://opencode.ai/download).

| Platform              | Download                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `opencode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `opencode-desktop-mac-x64.dmg`     |
| Windows               | `opencode-desktop-win-x64.exe`     |
| Linux                 | `.deb`, `.rpm`, or `.AppImage`     |

```bash
# macOS (Homebrew)
brew install --cask opencode-desktop
```

#### Installation Directory

The install script installs OpenCode to `$HOME/.opencode/bin`.

### Agents

OpenCode includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

Learn more about [agents](https://opencode.ai/v2/docs/agents).

### Documentation

For more info on how to configure OpenCode, [**head over to our docs**](https://opencode.ai/v2/docs).

### Contributing

If you're interested in contributing to OpenCode, please read our [contributing docs](./CONTRIBUTING.md) before submitting a pull request.

### Building on OpenCode

If you are working on a project that's related to OpenCode and is using "opencode" as part of its name, for example "opencode-dashboard" or "opencode-mobile", please add a note to your README to clarify that it is not built by the OpenCode team and is not affiliated with us in any way.

---

**Join our community** [Discord](https://discord.gg/opencode) | [X.com](https://x.com/opencode)
