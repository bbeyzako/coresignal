import { NextRequest, NextResponse } from "next/server";

const ROOM_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const TECHNOCore_ORIGIN = "https://technocore.chat";

type UnknownRecord = Record<string, unknown>;

type NormalizedMessage = {
  seq: number;
  from: string;
  text: string;
  ts: string | null;
  categories: string[];
  verified: boolean;
};

const categoryRules: Array<[string, RegExp]> = [
  ["testnet", /\btestnet\b/i],
  ["faucet", /\bfaucet\b/i],
  ["airdrop", /\bairdrop\b/i],
  ["inference", /\b(inference|model|llm|prompt|token usage)\b/i],
  ["miner", /\b(miner|mining|compute|gpu)\b/i],
  ["validator", /\b(validator|node|consensus)\b/i],
  ["did", /\b(did:key|decentralized identity|identity proof|signature)\b/i],
  ["release", /\b(release|version|v\d+\.\d+|upgrade|changelog)\b/i],
  ["project", /\b(github|repo|project|tool|dashboard|app)\b/i],
];

const stopWords = new Set([
  "about",
  "after",
  "again",
  "also",
  "been",
  "being",
  "could",
  "from",
  "have",
  "here",
  "into",
  "just",
  "more",
  "only",
  "room",
  "should",
  "some",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "using",
  "very",
  "what",
  "when",
  "where",
  "which",
  "will",
  "with",
  "would",
  "your",
]);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function extractMessages(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  for (const key of ["messages", "items", "data", "results"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function normalizeMessage(value: unknown, index: number): NormalizedMessage | null {
  if (!isRecord(value)) return null;

  const author = isRecord(value.author) ? value.author : null;
  const sender = isRecord(value.sender) ? value.sender : null;
  const explicitDid = firstString(value.did, author?.did, sender?.did);
  const from = firstString(
    explicitDid,
    value.from,
    value.nick,
    value.user,
    author?.id,
    author?.name,
    sender?.id,
    sender?.name,
    "anonymous",
  );
  const text = firstString(
    value.text,
    value.message,
    value.body,
    value.content,
  ).slice(0, 1200);

  if (!text) return null;

  const sequenceValue = Number(
    value.seq ?? value.sequence ?? value.id ?? index + 1,
  );
  const seq = Number.isFinite(sequenceValue) ? sequenceValue : index + 1;
  const ts = firstString(
    value.ts,
    value.time,
    value.timestamp,
    value.createdAt,
    value.created_at,
  );
  const categories = categoryRules
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label);
  const verified =
    from.startsWith("did:key:") ||
    explicitDid.startsWith("did:key:") ||
    value.verified === true ||
    value.signed === true;

  return {
    seq,
    from,
    text,
    ts: ts || null,
    categories,
    verified,
  };
}

function topKeywords(messages: NormalizedMessage[]) {
  const counts = new Map<string, number>();

  for (const message of messages) {
    const uniqueWords = new Set(
      message.text
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, " ")
        .match(/[a-z][a-z0-9-]{3,}/g) ?? [],
    );
    for (const word of uniqueWords) {
      if (!stopWords.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 7)
    .map(([label, count]) => ({ label, count }));
}

async function sha256(payload: unknown) {
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function GET(request: NextRequest) {
  const room = (request.nextUrl.searchParams.get("room") ?? "technocore")
    .trim()
    .toLowerCase();
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 200);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(500, Math.max(20, Math.floor(requestedLimit)))
    : 200;

  if (!ROOM_PATTERN.test(room)) {
    return NextResponse.json(
      { error: "Use 1–48 lowercase letters, numbers, hyphens, or underscores." },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(
      `${TECHNOCore_ORIGIN}/r/${encodeURIComponent(room)}?format=json&limit=${limit}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "CoreSignal/0.1 (+public-room-intelligence)",
        },
        signal: AbortSignal.timeout(9000),
      },
    );

    if (!upstream.ok) {
      throw new Error(`Technocore returned HTTP ${upstream.status}.`);
    }

    const payload = (await upstream.json()) as unknown;
    const messages = extractMessages(payload)
      .map(normalizeMessage)
      .filter((message): message is NormalizedMessage => message !== null)
      .sort((a, b) => a.seq - b.seq);

    const writers = new Set(messages.map((message) => message.from));
    const verifiedMessages = messages.filter((message) => message.verified).length;
    const links = messages.reduce(
      (total, message) => total + (message.text.match(/https?:\/\/\S+/g)?.length ?? 0),
      0,
    );
    const highSignalMessages = messages.filter(
      (message) => message.categories.length > 0 || /https?:\/\/\S+/.test(message.text),
    );
    const topicCounts = new Map<string, number>();
    for (const message of messages) {
      for (const category of message.categories) {
        topicCounts.set(category, (topicCounts.get(category) ?? 0) + 1);
      }
    }
    const categoryTopics = [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, count }));
    const keywordTopics = topKeywords(messages).filter(
      (keyword) => !topicCounts.has(keyword.label),
    );
    const topics = [...categoryTopics, ...keywordTopics].slice(0, 7);
    const first = messages.at(0)?.seq ?? null;
    const last = messages.at(-1)?.seq ?? null;
    const generatedAt = new Date().toISOString();
    const leadTopics = topics.slice(0, 3).map((topic) => topic.label);
    const digest = messages.length
      ? `CoreSignal sampled ${messages.length} messages from ${writers.size} writers. ${highSignalMessages.length} messages contain operational keywords or links${leadTopics.length ? `, led by ${leadTopics.join(", ")}` : ""}. ${verifiedMessages} messages expose a DID-backed sender identity; this proves continuity, not credibility.`
      : `No readable messages were returned for /${room} in the current window.`;

    const receiptPayload = {
      schema: "coresignal-report-v1",
      source: TECHNOCore_ORIGIN,
      room,
      generatedAt,
      sequence: { first, last },
      counts: {
        messages: messages.length,
        uniqueWriters: writers.size,
        verifiedMessages,
        highSignalMessages: highSignalMessages.length,
        links,
      },
    };

    return NextResponse.json(
      {
        room,
        generatedAt,
        digest,
        metrics: receiptPayload.counts,
        sequence: receiptPayload.sequence,
        topics,
        signals: highSignalMessages.slice(-12).reverse(),
        receipt: {
          payload: receiptPayload,
          sha256: await sha256(receiptPayload),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown upstream error.";
    return NextResponse.json(
      { error: `Technocore room could not be read: ${detail}` },
      {
        status: 502,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }
}
