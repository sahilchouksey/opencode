import { Tool } from "./tool"
import DESCRIPTION from "./orchestrator.txt"
import { z } from "zod"
import { Session } from "../session"
import { Agent } from "../agent/agent"
import { Provider } from "../provider/provider"
import { Global } from "../global"
import { Bus } from "../bus"
import { MessageV2 } from "../session/message-v2"
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
      const statusFile = path.join(orchestratorDir, "status.json")

      await Bun.write(memoryFile, "# Shared Memory\n\n")
      await Bun.write(progressFile, "# Progress Tracker\n\n")

      // Initialize status tracking
      const status = {
        launched: new Date().toISOString(),
        total: params.parts,
        completed: 0,
        sessions: {} as Record<string, { status: string; lastUpdate: string; currentTask?: string }>,
      }
      await Bun.write(statusFile, JSON.stringify(status, null, 2))

      // Create sessions with different auth files
      const sessions = []
      const sessionPromises = []
      let progressOutput = `🚀 Orchestrator launched ${params.parts} parallel sessions for: ${params.description}\n\n`

      // Track session activities
      const sessionActivity = new Map<string, { sessionNumber: number; status: string; lastActivity: string }>()

      for (let i = 1; i <= params.parts; i++) {
        // Create new session
        const session = await Session.create(ctx.sessionID)
        sessions.push(session.id)

        // Initialize session tracking
        sessionActivity.set(session.id, {
          sessionNumber: i,
          status: "starting",
          lastActivity: "Session created",
        })

        // Update status file
        status.sessions[session.id] = {
          status: "starting",
          lastUpdate: new Date().toISOString(),
          currentTask: "Initializing session",
        }
        await Bun.write(statusFile, JSON.stringify(status, null, 2))

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

        progressOutput += `📋 Session ${i} (${session.id}): ${taskPart}\n`

        // Subscribe to session events for real-time updates
        const updateProgress = async (sessionID: string, activity: string, taskUpdate?: string) => {
          const current = sessionActivity.get(sessionID)
          if (current) {
            current.lastActivity = activity
            current.status = taskUpdate || current.status
            sessionActivity.set(sessionID, current)

            // Update status file
            status.sessions[sessionID] = {
              status: current.status,
              lastUpdate: new Date().toISOString(),
              currentTask: activity,
            }
            await Bun.write(statusFile, JSON.stringify(status, null, 2))

            // Update progress file with real-time info
            const progressContent = `# Progress Tracker\n\nLast Updated: ${new Date().toISOString()}\n\n## Session Status\n\n${Array.from(
              sessionActivity.entries(),
            )
              .map(
                ([id, info]) =>
                  `### Session ${info.sessionNumber} (${id})\n- Status: ${info.status}\n- Last Activity: ${info.lastActivity}\n`,
              )
              .join("\n")}\n\n## Detailed Progress\n\n`
            await Bun.write(progressFile, progressContent)
          }
        }

        // Subscribe to message events for this session
        const unsubscribe = Bus.subscribe(MessageV2.Event.Updated, async (event) => {
          if (event.properties.info.sessionID === session.id) {
            await updateProgress(session.id, "Processing message", "working")
          }
        })

        // Subscribe to tool execution events
        const unsubscribeTool = Bus.subscribe(MessageV2.Event.PartUpdated, async (event) => {
          if (event.properties.part.sessionID === session.id && event.properties.part.type === "tool") {
            const part = event.properties.part as any
            if (part.state?.status === "running") {
              await updateProgress(session.id, `Using tool: ${part.tool}`, "executing")
            } else if (part.state?.status === "completed") {
              await updateProgress(session.id, `Completed tool: ${part.tool}`, "working")
            }
          }
        })

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
- Status file: ${statusFile} (real-time status of all sessions)

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
1. Read the memory.md, progress.md, and status.json files to understand what other agents may have done
2. Work on your specific part of the task
3. Update these files with your progress and findings
4. Coordinate with other agents through these shared files

Begin working on your assigned part now.`,
            },
          ],
        })
          .then(async (result) => {
            // Mark session as completed
            await updateProgress(session.id, "Session completed", "completed")
            status.completed += 1
            await Bun.write(statusFile, JSON.stringify(status, null, 2))

            // Cleanup subscriptions
            unsubscribe()
            unsubscribeTool()

            return result
          })
          .catch(async (error) => {
            await updateProgress(session.id, `Session failed: ${error.message}`, "error")
            unsubscribe()
            unsubscribeTool()
            return null
          })

        sessionPromises.push(sessionPromise)

        // Update progress immediately after starting
        await updateProgress(session.id, "Session started", "working")
      }

      progressOutput += `\n📂 Coordination Files:\n   Memory: ${memoryFile}\n   Progress: ${progressFile}\n   Status: ${statusFile}\n\n`
      progressOutput += `⚡ All ${params.parts} sessions are running in parallel. Monitor progress via the files above.\n\n`
      progressOutput += `📊 Real-time Status:\n${Array.from(sessionActivity.entries())
        .map(([, info]) => `   Session ${info.sessionNumber}: ${info.status} - ${info.lastActivity}`)
        .join("\n")}`

      // Don't await the session promises - let them run in background
      // But start a background task to monitor overall completion
      Promise.all(sessionPromises)
        .then(async () => {
          const finalStatus = {
            ...status,
            completed: status.total,
            finished: new Date().toISOString(),
          }
          await Bun.write(statusFile, JSON.stringify(finalStatus, null, 2))

          const finalProgress = await Bun.file(progressFile).text()
          await Bun.write(
            progressFile,
            finalProgress + `\n\n## 🎉 All Sessions Completed\n\nFinished at: ${new Date().toISOString()}\n`,
          )
        })
        .catch(() => {
          // Handle any errors silently
        })

      return {
        title: params.description,
        metadata: {
          summary: [],
          sessions: sessions,
          memoryFile,
          progressFile,
          statusFile,
          totalSessions: params.parts,
        },
        output: progressOutput,
      }
    },
  }
})
