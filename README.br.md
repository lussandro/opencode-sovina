<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="Logo do OpenCode">
    </picture>
  </a>
</p>
<p align="center">O agente de programação com IA de código aberto.</p>
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

Um fork do OpenCode que gasta menos tokens e mostra quanto gastou. Mesmo agente, mesmos modelos; menos cerimônia no prompt, na saída das ferramentas e no histórico. Cada mudança abaixo diz como foi verificada, e o que não foi.

### O que mudou

| Mudança | O que faz | Efeito | Evidência |
| --- | --- | --- | --- |
| **Catálogo de skills compacto** | Uma linha por skill (`- id: descrição`), descrições cortadas em 300 caracteres, em fim de frase ou de palavra. A skill continua carregando inteira quando usada. | 4490 → 1995 tokens em 32 skills (-56%) | Medido numa instalação real |
| **Code Mode sob demanda** | `execute` e o catálogo só são oferecidos quando existe um servidor MCP ou outra ferramenta externa. | Cerca de -1.200 tokens por request sem MCP | Medido (6 das 8 ferramentas internas; é um piso) |
| **Saída de tools mais enxuta** | `glob` devolve caminhos relativos ao projeto; `grep` mostra uma janela de 400 caracteres centrada no trecho encontrado e tira a linha em branco após cada resultado. | `glob` -40% (100 caminhos); `grep` -8% típico, -80% em linhas minificadas | Medido neste repositório, com saída real do `rg` |
| **Poda de saída com cache frio** | Troca saídas antigas de `read`/`grep`/`glob`/`shell`/`webfetch` por um stub, mas só depois que o cache do prompt esfriou. | -7% a -45% de custo, conforme a frequência das suas pausas | **Simulado**, não medido em sessões reais |
| **Dedupe de chamadas repetidas** | Uma chamada com input e saída iguais a uma anterior ainda visível vira um ponteiro para ela. | Depende do seu fluxo | **Não medido** |
| **Respostas Caveman** (ligado por padrão) | Respostas curtas no chat. Código, comandos, caminhos e erros ficam literais; avisos e ações destrutivas ficam em frases completas. | Custa cerca de 240 tokens de entrada (em cache) | Economia na saída **não medida** |
| **Skills de dev** | Seis skills enxutas em `skills/`: `dev-debugging`, `dev-testing`, `dev-backend`, `dev-frontend`, `dev-infra`, `dev-review`. | Cerca de 410 tokens cada ao carregar, contra 2.000 a 9.000 de skills típicas | Medido; o tamanho é imposto por um teste |
| **Custo reportado com honestidade** | O uso de `generate` e do warming passa a entrar no custo da sessão; cada request registra de onde vêm seus tokens de entrada. | Veja [Medição](#medição) | Testado |

### O que está e o que não está provado

- **Medido:** os números de catálogo de skills, Code Mode e saída de tools acima. São tamanhos reais, não estimativas, mas são *tamanhos*: a economia por request é essa quantidade de tokens vezes o seu preço de cache, algo como 1% a 2% de um request típico cada.
- **Simulado:** a poda. Cortar o histórico no meio da conversa invalida o cache do provider, o que na simulação custou até 94% a mais em sessões longas com preço no estilo Anthropic (e economizou poucos por cento só em sessões curtas). Por isso este fork só poda quando o cache já esfriou, onde sai de graça. Os -7% a -45% supõem que você pausa entre prompts com frequência suficiente; o seu número real depende disso. Ajuste `prune.idle` à vida do cache do seu provider.
- **Não verificado:** se o Caveman realmente encurta a saída nos seus modelos, e com que frequência o dedupe dispara. Meça os dois antes de confiar (veja abaixo).
- **Não feito:** vida de cache de uma hora como opção, e um subagente `general` mais enxuto.

### Configuração

As três são opcionais; estes são os padrões.

```jsonc
{
  "caveman": "full",   // "lite" só corta enchimento; false volta ao estilo original
  "prune": true,       // ou { "idle": "5 minutes", "keep": 6, "min": 10000 }
  "codemode": "auto"   // "on" sempre oferece o execute, "off" nunca oferece
}
```

- `prune.idle` é quanto tempo sem resposta até assumir o cache como frio. Use `"0 seconds"` em provedores sem cache de prompt, onde podar sempre é mais barato.
- `prune.keep` é quantos resultados recentes nunca são podados. `prune.min` é o mínimo que uma poda precisa remover para valer a pena.
- `prune: false` também desliga o dedupe de chamadas repetidas.
- `codemode: "auto"` esconde as ferramentas internas pouco usadas do OpenCode (worktrees, renomear sessão, lista de modelos). Use `"on"` se você depende delas.

### Medição

```bash
opencode stats --cost
```

mostra o custo por prompt e por step, e de onde vêm os tokens de entrada do request médio (exemplo de saída):

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

O breakdown é uma estimativa (cerca de 4 caracteres por token), gravada em cada step. Para avaliar o Caveman ou a poda, rode a mesma tarefa duas vezes, uma com o recurso desligado, e compare `output`, `cost / prompt` e `tool results`.

### Skills

```bash
script/install-skills.sh   # linka skills/dev-* em ~/.config/opencode/skills
```

Nunca sobrescreve uma skill existente com o mesmo nome. As seis skills somam cerca de 260 tokens ao catálogo, então compensam junto com `skills/coding-profile.json`: mescle o `policies` dele na sua config para esconder 13 skills que não são de código. Na instalação em que foi medido, isso levou o catálogo de 4490 tokens (formato antigo) para 1423 com as seis skills de dev incluídas.

### Desenvolvimento

```bash
bun install
cd packages/core && bun run test       # também: packages/{schema,client,cli}
```

- Os testes precisam do [ripgrep](https://github.com/BurntSushi/ripgrep) no `PATH`; sem ele, as suítes `Ripgrep` e `search tools` falham.
- Use um Node recente no `bun run lint` e no `bun run typecheck`, as verificações que o hook de pre-push roda. Os dois passaram com o Node 24.0.1. Com o Node 20.19, o typecheck da raiz derrubou o turbo com segfault e o oxlint não conseguiu carregar o plugin em TypeScript.
- O `core` roda cerca de 6.500 testes em poucos minutos. Os testes de GitLab OAuth podem falhar na suíte completa e passar isolados; eles usam uma porta local de callback, então rode-os isolados se falharem.

### Manter em sincronia com o upstream

```bash
git fetch upstream && git rebase upstream/dev
```

A maior parte das mudanças são arquivos novos. Estes arquivos existentes são os conflitos prováveis: `core/src/session/{context,generate,compaction,stats}.ts`, `core/src/skill/instructions.ts`, `core/src/tool/plugin/{glob,grep}.ts`, `core/src/plugin/internal.ts` e `schema/src/{config,session-event,token-usage,session-stats}.ts`. Regenere o client com `bun run generate` em `packages/client` depois de resolver conflitos de schema.

---

[![OpenCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://opencode.ai)

---

### Instalação

```bash
# YOLO
curl -fsSL https://opencode.ai/v2/install | bash

# Gerenciadores de pacotes
npm i -g @opencode/cli@latest      # ou bun/pnpm/yarn
brew install anomalyco/tap/opencode-v2 # macOS e Linux (recomendado, sempre atualizado)
brew install opencode              # macOS e Linux (fórmula oficial do brew, atualiza menos)
sudo pacman -S opencode            # Arch Linux (Stable)
paru -S opencode-beta              # Arch Linux (Latest from AUR)
mise use -g opencode               # qualquer sistema
nix run github:anomalyco/opencode  # Nix
```

> [!TIP]
> Remova versões anteriores a 0.1.x antes de instalar.

### App desktop (BETA)

O OpenCode também está disponível como aplicativo desktop. Baixe em [opencode.ai/download](https://opencode.ai/download).

| Plataforma            | Download                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `opencode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `opencode-desktop-mac-x64.dmg`     |
| Windows               | `opencode-desktop-win-x64.exe`     |
| Linux                 | `.deb`, `.rpm` ou AppImage         |

```bash
# macOS (Homebrew)
brew install --cask opencode-desktop
```

#### Diretório de instalação

O script de instalação instala o OpenCode em `$HOME/.opencode/bin`.

### Agents

O OpenCode inclui dois agents integrados, que você pode alternar com a tecla `Tab`.

- **build** - Padrão, agent com acesso total para trabalho de desenvolvimento
- **plan** - Agent somente leitura para análise e exploração de código
  - Nega edições de arquivos por padrão
  - Pede permissão antes de executar comandos bash
  - Ideal para explorar codebases desconhecidas ou planejar mudanças

Também há um subagent **general** para buscas complexas e tarefas em várias etapas.
Ele é usado internamente e pode ser invocado com `@general` nas mensagens.

Saiba mais sobre [agents](https://opencode.ai/v2/docs/agents).

### Documentação

Para mais informações sobre como configurar o OpenCode, [**veja nossa documentação**](https://opencode.ai/v2/docs).

### Contribuir

Se você tem interesse em contribuir com o OpenCode, leia os [contributing docs](./CONTRIBUTING.md) antes de enviar um pull request.

### Construindo com OpenCode

Se você estiver trabalhando em um projeto relacionado ao OpenCode e estiver usando "opencode" como parte do nome (por exemplo, "opencode-dashboard" ou "opencode-mobile"), adicione uma nota no README para deixar claro que não foi construído pela equipe do OpenCode e não é afiliado a nós de nenhuma forma.

---

**Junte-se à nossa comunidade** [Discord](https://discord.gg/opencode) | [X.com](https://x.com/opencode)
