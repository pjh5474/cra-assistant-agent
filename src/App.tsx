import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useState } from "react";

type FileEntry = {
	path: string;
	type: "file" | "directory";
	size: number;
	updatedAt: number;
};

type AgentState = { files: FileEntry[] };

type AgentStub = {
	readWorkspaceFile: (path: string) => Promise<string | null>;
};

function App() {
	const [agentState, setAgentState] = useState<AgentState>({ files: [] });
	const [openFile, setOpenFile] = useState<{
		path: string;
		content: string | null;
	} | null>(null);
	const [loadingFile, setLoadingFile] = useState(false);

	const agent = useAgent<AgentState>({
		agent: "CraAssistantAgent",
		onStateUpdate: setAgentState,
	});

	const handleFileClick = async (path: string) => {
		setLoadingFile(true);
		setOpenFile({ path, content: null });
		const stub = agent.stub as AgentStub;
		const content = await stub.readWorkspaceFile(path);
		setOpenFile({ path, content });
		setLoadingFile(false);
	};

	const formatSize = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	};

	const {
		messages,
		sendMessage,
		clearHistory,
		status,
		stop,
		addToolApprovalResponse,
	} = useAgentChat({ agent });

	const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();
		const formData = new FormData(e.currentTarget);
		const message = formData.get("input") as string;
		if (!message?.trim()) return;
		sendMessage({ text: message });
		e.currentTarget.reset();
	};

	function renderMessage(msg: UIMessage) {
		return msg.parts.map((part, i) => {
			if (part.type === "text")
				return (
					<p key={i} className="whitespace-pre-wrap leading-relaxed">
						{part.text}
					</p>
				);
			if (part.type === "reasoning")
				return (
					<p key={i} className="text-xs italic text-zinc-500">
						{part.text}
					</p>
				);
			if (isToolUIPart(part)) {
				if ("approval" in part && part.state === "approval-requested") {
					return (
						<div
							key={i}
							className="text-sm bg-yellow-50 border border-yellow-300 p-2 rounded my-1"
						>
							<div>
								<strong>Approve {getToolName(part)}?</strong>
							</div>
							{"input" in part && part.input != null && (
								<pre className="mt-1">
									{JSON.stringify(part.input, null, 2)}
								</pre>
							)}
							<div className="mt-2 flex gap-2">
								<button
									className="px-3 py-1 bg-green-500 text-white rounded"
									onClick={() =>
										addToolApprovalResponse({
											id: part.approval.id,
											approved: true,
										})
									}
								>
									Approve
								</button>
								<button
									className="px-3 py-1 bg-red-500 text-white rounded"
									onClick={() =>
										addToolApprovalResponse({
											id: part.approval.id,
											approved: false,
										})
									}
								>
									Reject
								</button>
							</div>
						</div>
					);
				}

				if (part.state === "output-denied") {
					return (
						<div
							key={i}
							className="text-sm bg-red-50 border border-red-300 p-2 rounded my-1"
						>
							<strong>{getToolName(part)}</strong> — Rejected
						</div>
					);
				}

				return (
					<div
						key={i}
						className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs"
					>
						<div className="flex items-center gap-2">
							<span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
								{getToolName(part)}
							</span>
							<span className="text-zinc-500">{part.state}</span>
						</div>
						{"input" in part && part.input != null && (
							<pre className="mt-1 overflow-x-auto text-zinc-600">
								{JSON.stringify(part.input, null, 2)}
							</pre>
						)}
						{part.state === "output-available" && (
							<pre className="mt-1 overflow-x-auto text-zinc-600">
								{JSON.stringify(part.output, null, 2)}
							</pre>
						)}
					</div>
				);
			}
			return null;
		});
	}

	return (
		<div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
			<header className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
				<div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
					<h1 className="shrink-0 text-sm font-semibold tracking-tight">
						🧠 Think Agent
					</h1>

					<form onSubmit={handleSubmit} className="flex flex-1 gap-2">
						<input
							name="input"
							placeholder="Type a message..."
							autoComplete="off"
							className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm outline-none transition focus:border-zinc-400 focus:bg-white"
						/>
						<button
							type="submit"
							className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
						>
							Send
						</button>
					</form>
					<button
						onClick={clearHistory}
						className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
					>
						Clear
					</button>
					<button
						onClick={stop}
						className="shrink-0 rounded-md px-2 py-1 text-xs text-red-500 transition hover:bg-red-100 hover:text-red-900"
					>
						Stop
					</button>
					<span className="shrink-0 text-xs text-zinc-400">{status}</span>
				</div>
			</header>

			<main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 pb-24">
				<section className="rounded-2xl border border-zinc-200 bg-white p-4">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-semibold tracking-tight">Workspace</h2>
						<span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
							{agentState.files.length}
						</span>
					</div>
					{agentState.files.length === 0 ? (
						<p className="mt-2 text-sm text-zinc-400">No files yet.</p>
					) : (
						<ul className="mt-3 space-y-1">
							{agentState.files.map((file) => (
								<li key={file.path}>
									<button
										type="button"
										onClick={() => handleFileClick(file.path)}
										disabled={file.type === "directory"}
										className="flex w-full items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-left text-sm transition enabled:hover:bg-zinc-100 disabled:cursor-default"
									>
										<span className="text-zinc-400">
											{file.type === "directory" ? "📁" : "📄"}
										</span>
										<span className="flex-1 truncate font-mono text-xs text-zinc-700">
											{file.path}
										</span>
										{file.type === "file" && (
											<span className="shrink-0 text-xs text-zinc-400">
												{formatSize(file.size)}
											</span>
										)}
									</button>
								</li>
							))}
						</ul>
					)}

					{openFile && (
						<div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
							<div className="flex items-center justify-between gap-2">
								<span className="truncate font-mono text-xs text-zinc-700">
									{openFile.path}
								</span>
								<button
									onClick={() => setOpenFile(null)}
									className="shrink-0 rounded-md px-2 py-0.5 text-xs text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-900"
								>
									Close
								</button>
							</div>
							{loadingFile ? (
								<p className="mt-2 text-xs text-zinc-400">Loading…</p>
							) : openFile.content === null ? (
								<p className="mt-2 text-xs text-zinc-400">
									(File is empty or could not be read.)
								</p>
							) : (
								<pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-zinc-700">
									{openFile.content}
								</pre>
							)}
						</div>
					)}
				</section>

				<div className="flex-1 space-y-4">
					{messages.length === 0 && (
						<div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-zinc-400">
							Say something to get started.
						</div>
					)}
					{messages.map((message) => {
						const isUser = message.role === "user";
						return (
							<div
								key={message.id}
								className={`flex ${isUser ? "justify-end" : "justify-start"}`}
							>
								<div
									className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
										isUser
											? "bg-zinc-900 text-white"
											: "border border-zinc-200 bg-white text-zinc-900"
									}`}
								>
									{renderMessage(message)}
								</div>
							</div>
						);
					})}
				</div>
			</main>
		</div>
	);
}

export default App;
