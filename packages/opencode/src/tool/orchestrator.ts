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
      console.log(`🚀 Starting orchestrator with ${params.parts} parallel sessions`)
      console.log(`📋 Task: ${params.description}`)
      console.log(`🎯 Agent type: ${params.subagent_type}`)

      const orchestratorDir = path.join(Global.Path.data, "orchestrator")
      await fs.mkdir(orchestratorDir, { recursive: true })

      // Create shared memory and progress files
      const memoryFile = path.join(orchestratorDir, "memory.md")
      const progressFile = path.join(orchestratorDir, "progress.md")
      await Bun.write(memoryFile, "# Shared Memory\n\n")
      await Bun.write(progressFile, "# Progress Tracker\n\n")

      console.log(`📂 Created coordination files:`)
      console.log(`   Memory: ${memoryFile}`)
      console.log(`   Progress: ${progressFile}`)

      // Create sessions with different auth files
      const sessions = []
      const sessionPromises = []

      for (let i = 1; i <= params.parts; i++) {
        console.log(`🔧 Creating session ${i}/${params.parts}...`)

        // Create new session
        const session = await Session.create(ctx.sessionID)
        sessions.push(session.id)
        console.log(`✅ Session ${i} created: ${session.id}`)

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

        console.log(`🎯 Session ${i} focus: ${taskPart}`)

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
        }).catch((error) => {
          console.error(`❌ Session ${i} failed:`, error.message)
          return null
        })

        sessionPromises.push(sessionPromise)
        console.log(`🚀 Session ${i} started working...`)
      }

      console.log(`⚡ All ${params.parts} sessions are now running in parallel`)
      console.log(`📊 Monitor progress in: ${progressFile}`)

      // Monitor progress and wait for completion
      console.log(`⏳ Monitoring ${params.parts} parallel sessions...`)

      const results = []
      let completedCount = 0

      // Show progress updates
      const progressInterval = setInterval(() => {
        const percentage = Math.round((completedCount / params.parts) * 100)
        console.log(`📊 Progress: ${completedCount}/${params.parts} sessions completed (${percentage}%)`)
      }, 5000) // Update every 5 seconds

      try {
        // Wait for all sessions to complete
        for (let i = 0; i < sessionPromises.length; i++) {
          console.log(`⏳ Waiting for session ${i + 1}...`)
          const result = await sessionPromises[i]
          if (result) {
            results.push(result)
            completedCount++
            console.log(`✅ Session ${i + 1} completed (${completedCount}/${params.parts})`)
          } else {
            console.log(`❌ Session ${i + 1} failed`)
            completedCount++
          }
        }

        clearInterval(progressInterval)
        console.log(`🎉 All ${params.parts} sessions completed!`)

        // Read final coordination files
        let memoryContent = ""
        let progressContent = ""
        try {
          memoryContent = await Bun.file(memoryFile).text()
          progressContent = await Bun.file(progressFile).text()
        } catch (e) {
          console.log("⚠️ Could not read coordination files")
        }

        return {
          title: params.description,
          metadata: {
            summary: results.filter((r) => r !== null),
            sessions: sessions,
            memoryFile,
            progressFile,
            totalSessions: params.parts,
            completedSessions: completedCount,
          },
          output: `🎉 Orchestrator completed ${params.parts} parallel sessions for: ${params.description}

📊 Results:
   Completed: ${results.length}/${params.parts} sessions
   Failed: ${params.parts - results.length} sessions

📂 Final Coordination Files:
${memoryContent ? `\n## Memory File Content:\n${memoryContent}` : ""}
${progressContent ? `\n## Progress File Content:\n${progressContent}` : ""}

✨ All parallel work has been completed!`,
        }
      } finally {
        clearInterval(progressInterval)
      }
    },
  }
})
