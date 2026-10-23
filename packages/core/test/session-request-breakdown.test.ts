import { describe, expect, test } from "bun:test"
import { Message, SystemPart, ToolDefinition } from "@opencode/ai"
import { SessionRequestBreakdown } from "@opencode/core/session/request-breakdown"

const text = (chars: number) => "x".repeat(chars)

describe("SessionRequestBreakdown", () => {
  test("splits a request by origin", () => {
    const breakdown = SessionRequestBreakdown.make({
      system: [SystemPart.make(text(400))],
      tools: [
        ToolDefinition.make({ name: "lookup", description: text(80), inputSchema: { type: "object" } }),
      ],
      messages: [
        Message.user(text(40)),
        Message.assistant([
          { type: "reasoning", text: text(20) },
          { type: "text", text: text(80) },
          { type: "tool-call", id: "call_1", name: "lookup", input: {} },
        ]),
        Message.tool({ id: "call_1", name: "lookup", result: { type: "text", value: text(200) } }),
        Message.system(text(60)),
      ],
    })

    expect(breakdown.system).toBe(100 + 15)
    expect(breakdown.user).toBe(10)
    expect(breakdown.assistant).toBe(20)
    expect(breakdown.reasoning).toBe(5)
    expect(breakdown.toolResults).toBe(50)
    expect(breakdown.tools).toBeGreaterThan(20)
    expect(breakdown.toolCalls).toBeGreaterThan(0)
    expect(breakdown.media).toBe(0)
    expect(breakdown.summary).toBe(0)
    expect(SessionRequestBreakdown.total(breakdown)).toBe(
      breakdown.system +
        breakdown.tools +
        breakdown.user +
        breakdown.assistant +
        breakdown.reasoning +
        breakdown.toolCalls +
        breakdown.toolResults +
        breakdown.media +
        breakdown.summary,
    )
  })

  test("an empty request is all zeroes", () => {
    const breakdown = SessionRequestBreakdown.make({ system: [], tools: [], messages: [] })
    expect(SessionRequestBreakdown.total(breakdown)).toBe(0)
  })
})
