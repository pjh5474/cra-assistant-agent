import { XMLParser } from "fast-xml-parser";

import type {
	MFDSFeed,
	MFDSFeedType,
	MFDSCollectionResult,
	MFDSCollectionFailure,
} from "../types/mfds.ts";
import type { RegulatoryItem } from "../types/regulatory.ts";
import { MFDS_FEEDS } from "../constants.ts";

interface RSSItem {
	title?: unknown;
	link?: unknown;
	description?: unknown;
	pubDate?: unknown;
	guid?: unknown;

	[key: string]: unknown;
}

interface ParsedRSS {
	rss?: {
		channel?: {
			item?: RSSItem | RSSItem[];
		};
	};
}

export interface MFDSCollectOptions {
	/**
	 * 해당 시각 이후 게시물만 반환.
	 */
	since?: Date;

	/**
	 * 조회할 특정 MFDS feed.
	 * undefined인 경우 전체 feed 조회.
	 */
	feedTypes?: MFDSFeedType[];

	/**
	 * RSS endpoint 요청 timeout.
	 */
	timeoutMs?: number;

	/**
	 * Agent context로 불필요하게 긴 RSS description이
	 * 전달되는 것을 막기 위한 최대 문자 수.
	 */
	maxDescriptionLength?: number;
}

interface FeedCollectionResult {
	feed: MFDSFeed;
	totalFetched: number;
	items: RegulatoryItem[];
}

export class MFDSCollector {
	private readonly parser: XMLParser;

	constructor() {
		this.parser = new XMLParser({
			ignoreAttributes: false,
			trimValues: true,
			cdataPropName: "__cdata",
		});
	}

	/**
	 * Responsibility:
	 *
	 * MFDS RSS
	 *   → fetch
	 *   → parse
	 *   → normalize
	 *   → date filter
	 *   → deduplicate
	 *   → compact
	 *
	 * CRA relevance나 impact 분석은 하지 않습니다.
	 */
	async collect(
		options: MFDSCollectOptions = {},
	): Promise<MFDSCollectionResult> {
		const {
			since,
			feedTypes,
			timeoutMs = 10_000,
			maxDescriptionLength = 1_500,
		} = options;

		const feeds = feedTypes
			? MFDS_FEEDS.filter((feed) => feedTypes.includes(feed.type))
			: MFDS_FEEDS;

		const settled = await Promise.allSettled(
			feeds.map((feed) =>
				this.collectFeed(feed, {
					since,
					timeoutMs,
					maxDescriptionLength,
				}),
			),
		);

		const collectedAt = new Date().toISOString();

		const items: RegulatoryItem[] = [];
		const failures: MFDSCollectionFailure[] = [];

		let totalFetched = 0;

		settled.forEach((result, index) => {
			const feed = feeds[index];

			if (result.status === "fulfilled") {
				totalFetched += result.value.totalFetched;
				items.push(...result.value.items);

				return;
			}

			const message =
				result.reason instanceof Error
					? result.reason.message
					: String(result.reason);

			failures.push({
				source: "MFDS",
				feedType: feed.type,
				feedTitle: feed.title,
				message,
			});

			console.error(
				`[MFDSCollector] Failed to collect ${feed.type}:`,
				result.reason,
			);
		});

		const normalizedItems = this.deduplicate(items).sort(
			(a, b) =>
				this.toTimestamp(b.publishedAt) - this.toTimestamp(a.publishedAt),
		);

		return {
			source: "MFDS",
			collectedAt,
			totalFetched,
			totalReturned: normalizedItems.length,
			items: normalizedItems,
			failures,
		};
	}

	private async collectFeed(
		feed: MFDSFeed,
		options: {
			since?: Date;
			timeoutMs: number;
			maxDescriptionLength: number;
		},
	): Promise<FeedCollectionResult> {
		const xml = await this.fetchRSS(feed.url, options.timeoutMs);

		const parsed = this.parser.parse(xml) as ParsedRSS;

		const rawItems = parsed?.rss?.channel?.item;

		if (!rawItems) {
			return {
				feed,
				totalFetched: 0,
				items: [],
			};
		}

		const items = Array.isArray(rawItems) ? rawItems : [rawItems];

		const collectedAt = new Date().toISOString();

		const normalized = items
			.map((item) =>
				this.normalizeItem(
					item,
					feed,
					collectedAt,
					options.maxDescriptionLength,
				),
			)
			.filter((item): item is RegulatoryItem => item !== null)
			.filter((item) => this.isAfterSince(item.publishedAt, options.since));

		return {
			feed,
			totalFetched: items.length,
			items: normalized,
		};
	}

	private async fetchRSS(url: string, timeoutMs: number): Promise<string> {
		const controller = new AbortController();

		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		console.log("[MFDSCollector] fetching RSS from", url);

		try {
			const response = await fetch(url, {
				headers: {
					Accept:
						"application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",

					"User-Agent": "CRA-Assistant-Agent/1.0",
				},

				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(
					`MFDS RSS request failed: ${response.status} ${response.statusText} (${url})`,
				);
			}

			return await response.text();
		} finally {
			clearTimeout(timeout);
		}
	}

	private normalizeItem(
		raw: RSSItem,
		feed: MFDSFeed,
		collectedAt: string,
		maxDescriptionLength: number,
	): RegulatoryItem | null {
		const title = this.readText(raw.title);

		const url = this.readText(raw.link);

		if (!title || !url) {
			console.warn("[MFDSCollector] RSS item missing title or link", {
				feed: feed.type,
			});

			return null;
		}

		const rawDescription = this.cleanDescription(
			this.readText(raw.description),
		);

		const description = this.truncate(rawDescription, maxDescriptionLength);

		const publishedAt = this.normalizeDate(this.readText(raw.pubDate));

		const guid = this.readText(raw.guid);

		const sourceId = guid || url;

		return {
			id: this.createId(feed.type, sourceId),
			source: "MFDS",
			sourceType: feed.sourceType,
			title,
			description: description || undefined,
			url,
			publishedAt,
			collectedAt,
			sourceId,
			metadata: {
				feedType: feed.type,
				feedTitle: feed.title,
			},
		};
	}

	private readText(value: unknown): string | undefined {
		if (typeof value === "string" || typeof value === "number") {
			const text = String(value).trim();
			return text || undefined;
		}

		if (value && typeof value === "object") {
			const object = value as Record<string, unknown>;

			const cdata = object.__cdata;

			if (typeof cdata === "string") {
				return cdata.trim() || undefined;
			}

			const text = object["#text"];

			if (typeof text === "string") {
				return text.trim() || undefined;
			}
		}

		return undefined;
	}

	private cleanDescription(value?: string): string {
		if (!value) {
			return "";
		}

		return value
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<[^>]+>/g, " ")
			.replace(/&nbsp;/gi, " ")
			.replace(/&amp;/gi, "&")
			.replace(/&lt;/gi, "<")
			.replace(/&gt;/gi, ">")
			.replace(/&quot;/gi, '"')
			.replace(/\s+/g, " ")
			.trim();
	}

	private truncate(value: string, maxLength: number): string {
		if (value.length <= maxLength) {
			return value;
		}

		return `${value.slice(0, maxLength)}…`;
	}

	private normalizeDate(value?: string): string | undefined {
		if (!value) {
			return undefined;
		}

		const date = new Date(value);

		if (Number.isNaN(date.getTime())) {
			console.warn("[MFDSCollector] Invalid pubDate:", value);

			return undefined;
		}

		return date.toISOString();
	}

	private isAfterSince(
		publishedAt: string | undefined,

		since?: Date,
	): boolean {
		if (!since) {
			return true;
		}

		/**
		 * publishedAt을 파싱하지 못했다고 해서
		 * 후보 자체를 제거하지 않습니다.
		 *
		 * false negative 방지가 우선입니다.
		 */
		if (!publishedAt) {
			return true;
		}

		return new Date(publishedAt).getTime() >= since.getTime();
	}

	private deduplicate(items: RegulatoryItem[]): RegulatoryItem[] {
		const map = new Map<string, RegulatoryItem>();

		for (const item of items) {
			const key = item.url || item.sourceId;

			if (!map.has(key)) {
				map.set(key, item);
			}
		}

		return [...map.values()];
	}

	private createId(feedType: MFDSFeedType, sourceId: string): string {
		return ["mfds", feedType, encodeURIComponent(sourceId)].join(":");
	}

	private toTimestamp(value?: string): number {
		if (!value) {
			return 0;
		}

		const timestamp = new Date(value).getTime();

		return Number.isNaN(timestamp) ? 0 : timestamp;
	}
}
