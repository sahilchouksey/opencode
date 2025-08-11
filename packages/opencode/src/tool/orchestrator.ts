import { Tool } from "./tool"
import DESCRIPTION from "./orchestrator.txt"
import { z } from "zod"
import { Session } from "../session"
import { Agent } from "../agent/agent"
import { Provider } from "../provider/provider"
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
      const sessionPromises = []

      for (let i = 1; i <= params.parts; i++) {
        // Create new session
        const session = await Session.create(ctx.sessionID)
        sessions.push(session.id)

        // Assign task part to session
        const agent = await Agent.get(params.subagent_type)
        if (!agent) {
          throw new Error(`Agent type "${params.subagent_type}" not found`)
        }
        const model = agent.model ?? (await Provider.defaultModel())

        const taskPart =
          i === 1
            ? "initial setup and foundation"
            : i === params.parts
              ? "final integration and testing"
              : `core implementation for section ${i}`

        // Create task for this session
        const sessionPromise = Session.chat({
          sessionID: session.id,
          providerID: model.providerID,
          modelID: model.modelID,
          agent: "build",
          system: `You are working on part ${i} of ${params.parts} for the task: ${params.prompt}

Focus area: ${taskPart}

Shared coordination files:
- Memory file: ${memoryFile} (use this to share findings and decisions)
- Progress file: ${progressFile} (use this to track your progress and coordinate with other agents)

IMPORTANT: Read these files at the start, update them as you work, and check them periodically to see what other agents have accomplished.`,
          tools: {
            ...agent.tools,
            orchestrator: false,
          },
          parts: [
            {
              id: "part-" + i,
              type: "text",
              text: `You are agent ${i} working on part ${i} of ${params.parts}.

Task: ${params.prompt}
Your focus: ${taskPart}

Instructions:
1. Read the memory.md and progress.md files to understand what other agents may have done
2. Work on your specific part of the task
3. Update both files with your progress and findings
4. Coordinate with other agents through these shared files

Begin working on your assigned part now.`,
            },
          ],
        }).catch((_error) => {
          return null
        })

        sessionPromises.push(sessionPromise)
      }

      // Return immediately with session info (don't wait for completion)
      return {
        title: params.description,
        metadata: {
          summary: [],
          sessions: sessions,
          memoryFile,
          progressFile,
          totalSessions: params.parts,
        },
        output: `🚀 Orchestrator launched ${params.parts} parallel sessions for: ${params.description}

📋 Session Details:
${sessions.map((id, i) => `   Session ${i + 1}: ${id}`).join("\n")}

📂 Coordination Files:
   Memory: ${memoryFile}
   Progress: ${progressFile}

⚡ All sessions are running in parallel. Check the progress file to monitor their work.`,
      }
    },
  }
})
