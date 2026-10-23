export * as CavemanPlugin from "./caveman.js"

import { define } from "@opencode/plugin/effect/plugin"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import { Effect } from "effect"
import { Config } from "../config.js"

import PROMPT_FULL from "./system-prompt/caveman.txt"
import PROMPT_LITE from "./system-prompt/caveman-lite.txt"

/** Prompt for a configured level, or undefined when disabled. Unset means the default, "full". */
export function prompt(setting: boolean | "lite" | "full" | undefined) {
  if (setting === false) return undefined
  return setting === "lite" ? PROMPT_LITE : PROMPT_FULL
}

/**
 * Makes chat replies terse by default: output tokens are the most expensive ones and hold the least information.
 * Only the `context` hook is wired, so titles, compaction summaries and generate requests keep their own formats.
 * Registered after the model prompt plugins, which replace `system[0]` and would otherwise discard this block.
 */
export const Plugin = define({
  id: "opencode.prompt.caveman",
  effect: Effect.fn("CavemanPlugin")(function* (ctx) {
    const config = yield* Config.Service
    const hook = (event: SessionHooks["context"]) =>
      Effect.gen(function* () {
        const text = prompt(Config.latest(yield* config.entries(), "caveman"))
        const system = event.system[0]
        if (!text || !system) return
        event.system[0] = { ...system, text: `${system.text}\n\n${text}` }
      }).pipe(Effect.catch(() => Effect.void))
    yield* ctx.session.hook("context", hook)
  }),
})
