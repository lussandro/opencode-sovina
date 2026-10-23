export * as ConfigCaveman from "./caveman.js"

import { Schema } from "effect"

/** `true` and "full" are the default; "lite" only trims filler; `false` restores the stock communication style. */
export const Level = Schema.Literals(["lite", "full"])
export type Level = typeof Level.Type

export const Caveman = Schema.Union([Schema.Boolean, Level])
export type Caveman = typeof Caveman.Type
