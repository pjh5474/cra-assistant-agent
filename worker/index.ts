import { Think, skills } from "@cloudflare/think";
import { callable, routeAgentRequest } from "agents";
import type { ContextConfig } from "agents/context";
import type { SkillSource } from "agents/skills";
import { tool, type LanguageModel, type ToolSet } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import { createExtensionTools } from "@cloudflare/think/tools/extensions";

type ThinkAgentState = {
	files: {
		path: string;
		type: "file" | "directory";
		size: number;
		updatedAt: number;
	}[];
};

export class CraAssistantAgent extends Think<Env> {
	extensionLoader = this.env.LOADER;

	initialState: ThinkAgentState = {
		files: [],
	};

	async refreshFiles() {
		const all = await this.workspace.glob("**/*");
		this.setState({
			files: all.map((file) => ({
				path: file.path,
				type: file.type === "file" ? "file" : "directory",
				size: file.size,
				updatedAt: file.updatedAt,
			})),
		});
	}

	async onStart() {
		await this.refreshFiles();
	}

	async onChatResponse() {
		await this.refreshFiles();
		await this.context.refreshSystemPrompt();
	}

	getModel(): LanguageModel {
		const workersAI = createWorkersAI({ binding: this.env.AI });
		return workersAI("@cf/zai-org/glm-4.7-flash");
	}

	getTools(): ToolSet {
		return {
			getWeather: tool({
				description: "Get Weather",
				inputSchema: z.object({
					city: z.string().meta({
						description: "The city to get the weather for",
					}),
				}),
				execute: async ({ city }) => {
					return `The weather in ${city} is sunny`;
				},
			}),
			...createExtensionTools({ manager: this.extensionManager! }),
		};
	}

	configureContext(): ContextConfig[] | Promise<ContextConfig[]> {
		return [
			{
				label: "soul",
				provider: {
					get: async () => "You are very helpful but a bit sarcastic.",
				},
			},
			{
				label: "memory",
				description: "Things to remember about the user across conversations.",
				maxTokens: 10_000,
			},
		];
	}

	/** R2 skills catalog — Think adds the skills context block automatically. */
	getSkills(): SkillSource[] {
		return [
			skills.r2(this.env.SKILLS, { prefix: "skills/", refreshIntervalMs: 0 }),
		];
	}

	@callable()
	async readWorkspaceFile(path: string) {
		return await this.workspace.readFile(path);
	}
}

export default {
	async fetch(request, env) {
		return (
			(await routeAgentRequest(request, env)) ??
			new Response("Not found", { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
