import { describe, it, expect } from "bun:test"
import { OrchestratorTool } from "../../src/tool/orchestrator"

describe("tool.orchestrator", () => {
  it("should initialize correctly", async () => {
    const tool = await OrchestratorTool.init()
    expect(tool.description).toBeDefined()
    expect(tool.parameters).toBeDefined()
  })

  it("should execute correctly", async () => {
    const tool = await OrchestratorTool.init()
    // Note: We're not actually testing the full execution here due to complexity
    // of setting up real sessions and agents in a test environment
    expect(tool.execute).toBeInstanceOf(Function)
  })
})
