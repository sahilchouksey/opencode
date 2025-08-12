import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test"
import { OrchestratorTool } from "../../src/tool/orchestrator"
import { App } from "../../src/app/app"
import { Log } from "../../src/util/log"
import path from "path"

// Mock console methods to capture terminal output
let consoleOutputs: string[] = []
let consoleSpy: any

const ctx = {
  sessionID: "test-orchestrator",
  messageID: "",
  toolCallID: "",
  abort: AbortSignal.any([]),
  metadata: () => {},
}

describe("tool.orchestrator.output", () => {
  beforeEach(() => {
    consoleOutputs = []
    // Spy on console methods to capture any terminal output
    consoleSpy = spyOn(console, "log").mockImplementation((...args) => {
      consoleOutputs.push(args.join(" "))
    })
    Log.init({ print: false })
  })

  afterEach(() => {
    consoleSpy?.mockRestore()
  })

  test("should have test files available", async () => {
    const projectRoot = path.join(__dirname, "../..")
    const testFile1Path = path.join(projectRoot, "test/fixtures/orchestrator-test-file-1.txt")
    const testFile2Path = path.join(projectRoot, "test/fixtures/orchestrator-test-file-2.txt")

    // Verify our test files exist
    const file1 = Bun.file(testFile1Path)
    const file2 = Bun.file(testFile2Path)

    expect(await file1.exists()).toBe(true)
    expect(await file2.exists()).toBe(true)

    const file1Content = await file1.text()
    const file2Content = await file2.text()

    expect(file1Content).toContain("first test file")
    expect(file2Content).toContain("second test file")
    expect(file1Content).not.toEqual(file2Content)
  })

  test("should verify orchestrator output appears in chat interface", async () => {
    await App.provide({ cwd: process.cwd() }, async () => {
      const orchestratorTool = await OrchestratorTool.init()

      // Execute orchestrator with minimal test parameters
      const result = await orchestratorTool.execute(
        {
          description: "Test output routing",
          prompt:
            "Create a simple test to verify that orchestrator output appears in the chat interface and not in the terminal. Create two simple text files with different content.",
          parts: 2,
          subagent_type: "general",
        },
        ctx,
      )

      // Verify structured output format
      expect(result).toHaveProperty("title")
      expect(result).toHaveProperty("metadata")
      expect(result).toHaveProperty("output")

      // Verify title matches description
      expect(result.title).toBe("Test output routing")

      // Verify metadata contains expected properties
      expect(result.metadata).toHaveProperty("sessions")
      expect(result.metadata).toHaveProperty("memoryFile")
      expect(result.metadata).toHaveProperty("progressFile")
      expect(result.metadata).toHaveProperty("totalSessions")
      expect(result.metadata.totalSessions).toBe(2)
      expect(Array.isArray(result.metadata.sessions)).toBe(true)
      expect(result.metadata.sessions).toHaveLength(2)

      // Verify output contains expected content
      expect(result.output).toContain("🚀 Orchestrator launched 2 parallel sessions")
      expect(result.output).toContain("Test output routing")
      expect(result.output).toContain("Session Details:")
      expect(result.output).toContain("Coordination Files:")
      expect(result.output).toContain("Memory:")
      expect(result.output).toContain("Progress:")

      // Critical test: verify NO output went to terminal/console
      expect(consoleOutputs).toHaveLength(0)

      // Verify coordination files were created
      const memoryFilePath = result.metadata.memoryFile
      const progressFilePath = result.metadata.progressFile
      expect(memoryFilePath).toContain("orchestrator")
      expect(progressFilePath).toContain("orchestrator")

      // Verify files exist
      const memoryFile = Bun.file(memoryFilePath)
      const progressFile = Bun.file(progressFilePath)
      expect(await memoryFile.exists()).toBe(true)
      expect(await progressFile.exists()).toBe(true)

      // Verify file contents
      const memoryContent = await memoryFile.text()
      const progressContent = await progressFile.text()
      expect(memoryContent).toContain("# Shared Memory")
      expect(progressContent).toContain("# Progress Tracker")
    })
  })

  test("should not leak output to terminal", async () => {
    await App.provide({ cwd: process.cwd() }, async () => {
      const orchestratorTool = await OrchestratorTool.init()

      const result = await orchestratorTool.execute(
        {
          description: "Multi session test",
          prompt: "Test with multiple sessions",
          parts: 3,
          subagent_type: "general",
        },
        ctx,
      )

      expect(result.metadata.totalSessions).toBe(3)
      expect(result.metadata.sessions).toHaveLength(3)
      expect(result.output).toContain("🚀 Orchestrator launched 3 parallel sessions")

      // Verify no terminal output - this is the critical test
      expect(consoleOutputs).toHaveLength(0)

      // Verify session details formatting
      const sessionLines = result.output.split("\n").filter((line) => line.trim().startsWith("Session "))
      expect(sessionLines.length).toBeGreaterThanOrEqual(3)

      // Each session should have a proper ID
      for (const sessionLine of sessionLines) {
        expect(sessionLine).toMatch(/Session \d+: /)
      }

      // Verify coordination files are properly referenced
      expect(result.output).toContain("Memory:")
      expect(result.output).toContain("Progress:")
      expect(result.output).toContain(result.metadata.memoryFile)
      expect(result.output).toContain(result.metadata.progressFile)
    })
  })
})
