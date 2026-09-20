import { useEffect, useMemo, useState } from "react";

import { Mail, Send } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import type { EmailDraft } from "../../../shared/types/email";

interface EmailApprovalDialogProps {
	open: boolean;
	draft?: EmailDraft | null;
	sending?: boolean;

	onOpenChange: (open: boolean) => void;

	onApprove: (draft: EmailDraft) => void | Promise<void>;
}

const EMAIL_PREVIEW_LENGTH = 2500;

export function EmailApprovalDialog({
	open,
	draft,
	sending = false,
	onOpenChange,
	onApprove,
}: EmailApprovalDialogProps) {
	const [to, setTo] = useState("");

	const [subject, setSubject] = useState("");

	useEffect(() => {
		if (!draft) {
			return;
		}

		setTo(draft.to.join(", "));

		setSubject(draft.subject);
	}, [draft]);

	const recipients = to
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);

	const preview = useMemo(() => {
		if (!draft?.body) {
			return "";
		}

		if (draft.body.length <= EMAIL_PREVIEW_LENGTH) {
			return draft.body;
		}

		return draft.body.slice(0, EMAIL_PREVIEW_LENGTH) + "\n\n…";
	}, [draft?.body]);

	const canSend =
		recipients.length > 0 &&
		subject.trim().length > 0 &&
		!!draft?.body &&
		!sending;

	async function handleApprove() {
		if (!draft || !canSend) {
			return;
		}

		await onApprove({
			...draft,

			to: recipients,

			subject: subject.trim(),

			// body는 수정하지 않고
			// 원본 그대로 전송
			body: draft.body,
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="
					flex
					max-h-[90vh]
					w-[95vw]
					max-w-5xl
					flex-col
					overflow-hidden
				"
			>
				<DialogHeader className="shrink-0">
					<DialogTitle className="flex items-center gap-2">
						<Mail className="h-5 w-5" />
						Review Email
					</DialogTitle>

					<DialogDescription>
						Review the recipient, subject, and message preview before sending.
					</DialogDescription>
				</DialogHeader>

				<div className="min-h-0 flex-1 overflow-y-auto pr-2">
					<div className="space-y-5">
						<div className="space-y-2">
							<Label>From</Label>

							<Input value="cra-assistant@warwarsn.online" disabled />
						</div>

						<div className="space-y-2">
							<Label htmlFor="email-to">To</Label>

							<Input
								id="email-to"
								value={to}
								onChange={(event) => setTo(event.target.value)}
								placeholder="recipient@example.com"
							/>

							<p className="text-xs text-muted-foreground">
								Separate multiple recipients with commas.
							</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="email-subject">Subject</Label>

							<Input
								id="email-subject"
								value={subject}
								onChange={(event) => setSubject(event.target.value)}
							/>
						</div>

						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Label>Message Preview</Label>

								{draft?.body && (
									<span className="text-xs text-muted-foreground">
										{draft.body.length} characters
									</span>
								)}
							</div>

							<div className="max-h-75 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 font-mono text-sm leading-relaxed">
								{preview || "No message content."}
							</div>

							{draft?.body && draft.body.length > EMAIL_PREVIEW_LENGTH && (
								<p className="text-xs text-muted-foreground">
									Only the first {EMAIL_PREVIEW_LENGTH} characters are shown.
									The full report will be sent.
								</p>
							)}
						</div>

						{draft?.sourceArtifact?.path && (
							<div className="rounded-md border bg-muted/40 p-3">
								<div className="text-xs font-medium">Source artifact</div>

								<div className="mt-1 break-all font-mono text-xs text-muted-foreground">
									{draft.sourceArtifact.path}
								</div>
							</div>
						)}
					</div>
				</div>

				<DialogFooter className="shrink-0 border-t pt-4">
					<Button
						type="button"
						variant="outline"
						disabled={sending}
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>

					<Button type="button" disabled={!canSend} onClick={handleApprove}>
						<Send className="mr-2 h-4 w-4" />

						{sending ? "Sending..." : "Approve & Send"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
