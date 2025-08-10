import { Tool } from "./tool"
import DESCRIPTION from "./orchestrator.txt"
import { z } from "zod"
import { Session } from "../session"
import { Agent } from "../agent/agent"
import { Global } from "../global"
import path from "path"
import fs from "fs/promises"

export const OrchestratorTool = Tool.define("orchestrator", async () => {
  return {
    description: DESCRIPTION,
    parameters: z.object({
      description: z.string().describe("A short (3-5 words) description of the orchestrated task"),
      prompt: z.string().describe("The complex task to split and orchestrate"),
      parts: z.number().min(1).max(10).describe("Number of parts to split the task into (1-10)"),
      subagent_type: z.string().describe("The type of specialized agent to use for each task part"),
    }),
    async execute(params, ctx) {
      const orchestratorDir = path.join(Global.Path.data, "orchestrator")
      await fs.mkdir(orchestratorDir, { recursive: true })

      // Create shared memory and progress files
      const memoryFile = path.join(orchestratorDir, "memory.md")
      const progressFile = path.join(orchestratorDir, "progress.md")
      await Bun.write(memoryFile, "# Shared Memory\n\n")
      await Bun.write(progressFile, "# Progress Tracker\n\n")

      // Create sessions with different auth files
      const sessions = []
      for (let i = 1; i <= params.parts; i++) {
        // Create new session
        const session = await Session.create(ctx.sessionID)
        sessions.push(session.id)

        // Assign task part to session
        const agent = await Agent.get(params.subagent_type)
        const model = agent.model ?? {
          modelID: "claude-3.5-sonnet",
          providerID: "anthropic",
        }

        // Create task for this session
        await Session.chat({
          sessionID: session.id,
          providerID: model.providerID,
          modelID: model.modelID,
          mode: "build",
          system: `You are working on part ${i} of ${params.parts} for the task: ${params.prompt}\n\nShared memory file: ${memoryFile}\nProgress tracker file: ${progressFile}\n\nUse these files to coordinate with other agents working on different parts of the task.`,
          tools: {
            ...agent.tools,
            orchestrator: false,
          },
          parts: [
            {
              id: "part-" + i,
              type: "text",
              text: `You are agent ${i} working on part ${i} of ${params.parts}.\nTask description: ${params.prompt}\n\nPlease update the memory.md and progress.md files as you work to share information with other agents.`,
            },
          ],
        })
      }

      return {
        title: params.description,
        metadata: {
          summary: [],
          sessions: sessions,
        },
        output: `Orchestrator created ${params.parts} sessions for task: ${params.description}\nSession IDs: ${sessions.join(", ")}\nMemory file: ${memoryFile}\nProgress file: ${progressFile}`,
      }
    },
  }
})
