import { cmd } from "./cmd"
import { Session } from "../../session"
import { Provider } from "../../provider/provider"
import { Global } from "../../global"
import path from "path"
import fs from "fs/promises"
import { UI } from "../ui"
import { bootstrap } from "../bootstrap"
import { Bus } from "../../bus"
import { MessageV2 } from "../../session/message-v2"
import { Mode } from "../../session/mode"
import { Identifier } from "../../id/id"

export const OrchestrateCommand = cmd({
  command: "orchestrate <query>",
  describe: "create an orchestrated session with multiple agents",
  builder: (yargs) => {
    return yargs
      .positional("query", {
        describe: "the task to orchestrate",
        type: "string",
      })
      .option("n-sessions", {
        alias: "n",
        describe: "number of sessions to create",
        type: "number",
        default: 3,
      })
      .option("model", {
        type: "string",
        alias: ["m"],
        describe: "model to use in the format of provider/model",
        default: "github-copilot/claude-3.5-sonnet",
      })
  },
  handler: async (args: any) => {
    await bootstrap({ cwd: process.cwd() }, async () => {
      UI.println(UI.logo())
      UI.empty()

      const { providerID, modelID } = Provider.parseModel(args.model)
      UI.println(UI.Style.TEXT_NORMAL_BOLD + "@ ", UI.Style.TEXT_NORMAL + `${providerID}/${modelID}`)
      UI.empty()

      // Create orchestrator directory
      const orchestratorDir = path.join(Global.Path.data, "orchestrator")
      await fs.mkdir(orchestratorDir, { recursive: true })

      // Get existing auth data to copy to each session
      const mainAuthFile = Global.getAuthFile()
      const mainAuthData = await Bun.file(mainAuthFile)
        .json()
        .catch(() => ({}))

      // Create shared memory and progress files
      const memoryFile = path.join(orchestratorDir, "memory.md")
      const progressFile = path.join(orchestratorDir, "progress.md")
      await Bun.write(memoryFile, "# Shared Memory\n\n")
      await Bun.write(progressFile, "# Progress Tracker\n\n")

      // Create auth files for all sessions first
      for (let i = 1; i <= args.nSessions; i++) {
        const authFile = path.join(orchestratorDir, `auth-${i}.json`)
        await Bun.write(authFile, JSON.stringify(mainAuthData, null, 2))
      }

      // Create main orchestrator session
      const orchestratorSession = await Session.create()
      UI.println(UI.Style.TEXT_INFO_BOLD + "Orchestrator session: ", UI.Style.TEXT_NORMAL + orchestratorSession.id)

      // Get build mode configuration
      const buildMode = await Mode.get("build")

      // Create sub-agent sessions
      const sessions = []
      for (let i = 1; i <= args.nSessions; i++) {
        const session = await Session.create(orchestratorSession.id)
        sessions.push(session)

        // Set up message handler for each session
        Bus.subscribe(MessageV2.Event.PartUpdated, async (evt) => {
          if (evt.properties.part.sessionID !== session.id) return
          if (evt.properties.part.type === "text") {
            UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Session ${i}: `, UI.Style.TEXT_NORMAL + evt.properties.part.text)
          }
        })
      }

      UI.println(UI.Style.TEXT_INFO_BOLD + `Created ${args.nSessions} orchestrated sessions`)
      UI.println(UI.Style.TEXT_NORMAL + `Memory file: ${memoryFile}`)
      UI.println(UI.Style.TEXT_NORMAL + `Progress file: ${progressFile}`)
      UI.println(UI.Style.TEXT_NORMAL + `Auth files created in: ${orchestratorDir}`)
      UI.empty()

      // Start each session with its specific part of the task
      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i]
        const sessionNumber = i + 1

        // Start the session with its task
        Session.chat({
          sessionID: session.id,
          providerID: providerID,
          modelID: modelID,
          mode: "build",
          system:
            buildMode.prompt ??
            `You are working on part ${sessionNumber} of ${args.nSessions} for the task: ${args.query}\n\nShared memory file: ${memoryFile}\nProgress tracker file: ${progressFile}\n\nUse these files to coordinate with other agents working on different parts of the task.`,
          tools: buildMode.tools ?? {},
          parts: [
            {
              id: Identifier.ascending("part"),
              type: "text",
              text: `You are agent ${sessionNumber} working on part ${sessionNumber} of ${args.nSessions}.\nTask description: ${args.query}\n\nPlease update the memory.md and progress.md files as you work to share information with other agents.`,
            },
          ],
        }).catch((error) => {
          UI.println(
            UI.Style.TEXT_WARNING_BOLD + `Session ${sessionNumber} error: `,
            UI.Style.TEXT_NORMAL + error.message,
          )
        })
      }

      UI.println(UI.Style.TEXT_NORMAL + "Sessions are now running. Check the progress file for updates.")
      UI.empty()
    })
  },
})
