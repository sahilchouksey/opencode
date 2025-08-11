import { describe, test, expect } from "bun:test"
import { OrchestratorTool } from "../../src/tool/orchestrator"
import { App } from "../../src/app/app"

describe("tool.orchestrator", () => {
  test("should initialize with correct parameters", async () => {
    await App.provide({ cwd: process.cwd() }, async () => {
      const tool = await OrchestratorTool.init()

      expect(tool.description).toContain("Orchestrate complex tasks")
      expect(tool.parameters).toBeDefined()

      // Check parameter schema
      const params = tool.parameters._def.shape()
      expect(params.description).toBeDefined()
      expect(params.prompt).toBeDefined()
      expect(params.parts).toBeDefined()
      expect(params.subagent_type).toBeDefined()
    })
  })

  test("should have correct tool id", () => {
    expect(OrchestratorTool.id).toBe("orchestrator")
  })
})
