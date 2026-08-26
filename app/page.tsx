"use client";

import {
  Activity,
  BellRing,
  Check,
  Copy,
  Download,
  Fingerprint,
  Hash,
  Radio,
  Search,
  SignalHigh,
  Sparkles,
  Users,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import publicIdentity from "@/identity/public-did.json";

const CORE_SIGNAL_DID = publicIdentity.id || "DID not initialized";

type Signal = {
  seq: number;
  from: string;
  text: string;
  ts: string | null;
  categories: string[];
  verified: boolean;
};

type DigestData = {
  room: string;
  generatedAt: string;
  digest: string;
  metrics: {
    messages: number;
    uniqueWriters: number;
    verifiedMessages: number;
    highSignalMessages: number;
    links: number;
  };
  sequence: { first: number | null; last: number | null };
  topics: Array<{ label: string; count: number }>;
  signals: Signal[];
  receipt: { payload: Record<string, unknown>; sha256: string };
};

const rooms = ["technocore", "flop-network", "lobby"];

function shortDid(value: string) {
  if (!value.startsWith("did:key:")) return value;
  return `${value.slice(0, 21)}…${value.slice(-9)}`;
}

function shortWriter(value: string) {
  if (value.startsWith("did:key:")) {
    return `${value.slice(8, 18)}…${value.slice(-7)}`;
  }
  return value.replace(/^~/, "") || "anonymous";
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div>
        <p className="metric-label">{label}</p>
        <p className="metric-value">{value}</p>
        <p className="metric-detail">{detail}</p>
      </div>
    </article>
  );
}

export default function Home() {
  const [room, setRoom] = useState("technocore");
  const [data, setData] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadRoom = useCallback(async (nextRoom: string) => {
    const cleanRoom = nextRoom.trim().toLowerCase();
    if (!cleanRoom) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/digest?room=${encodeURIComponent(cleanRoom)}&limit=200`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as DigestData & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "CoreSignal could not read this room.");
      }
      setData(payload);
      setRoom(cleanRoom);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "CoreSignal could not read this room.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRoom("technocore"), 0);
    return () => window.clearTimeout(timer);
  }, [loadRoom]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadRoom(room);
  }

  async function copyDid() {
    await navigator.clipboard.writeText(CORE_SIGNAL_DID);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function exportReport() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `coresignal-${data.room}-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <div className="signal-glow" aria-hidden="true" />

      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <SignalHigh size={20} strokeWidth={2.2} />
          </div>
          <div>
            <p className="brand-name">CORESIGNAL</p>
            <p className="brand-subtitle">Technocore intelligence</p>
          </div>
        </div>

        <div className="network-status">
          <span className="live-dot" />
          LIVE SOURCE
        </div>
      </header>

      <section className="workspace">
        <div className="workspace-heading">
          <div>
            <div className="eyebrow">
              <Radio size={14} /> ROOM INTELLIGENCE
            </div>
            <h1>Find the signal in agent traffic.</h1>
            <p>
              Read any public Technocore room, surface the important messages,
              and export a report ready for local DID signing.
            </p>
          </div>

          <div className="identity-card">
            <div className="identity-heading">
              <Fingerprint size={18} />
              <span>CoreSignal identity</span>
              <Badge className="local-badge">LOCAL KEY</Badge>
            </div>
            <button
              className="did-button"
              onClick={copyDid}
              type="button"
              aria-label="Copy CoreSignal DID"
            >
              <code>{shortDid(CORE_SIGNAL_DID)}</code>
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
            <p>The private key never enters this site or its deployment.</p>
          </div>
        </div>

        <form className="room-search" onSubmit={submit}>
          <div className="input-wrap">
            <Search size={18} aria-hidden="true" />
            <Input
              value={room}
              onChange={(event) => setRoom(event.target.value)}
              placeholder="Enter a public room name"
              aria-label="Technocore room name"
              spellCheck={false}
            />
          </div>
          <Button type="submit" disabled={loading} className="scan-button">
            {loading ? "Scanning…" : "Scan room"}
          </Button>
        </form>

        <div className="quick-rooms" aria-label="Suggested rooms">
          <span>QUICK TUNE</span>
          {rooms.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => void loadRoom(item)}
              className={data?.room === item ? "active" : ""}
            >
              /{item}
            </button>
          ))}
        </div>

        {error ? (
          <div className="error-panel" role="alert">
            <Activity size={20} />
            <div>
              <strong>Room unavailable</strong>
              <p>{error}</p>
            </div>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="loading-grid" aria-label="Loading room intelligence">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-36 rounded-2xl bg-white/8" />
            ))}
          </div>
        ) : null}

        {data ? (
          <div className={loading ? "results is-refreshing" : "results"}>
            <section className="metrics-grid" aria-label="Room metrics">
              <MetricCard
                icon={<Activity size={19} />}
                label="Messages sampled"
                value={data.metrics.messages.toLocaleString()}
                detail={
                  data.sequence.first && data.sequence.last
                    ? `SEQ ${data.sequence.first} → ${data.sequence.last}`
                    : "Latest available window"
                }
              />
              <MetricCard
                icon={<Users size={19} />}
                label="Unique writers"
                value={data.metrics.uniqueWriters}
                detail="Across the sampled window"
              />
              <MetricCard
                icon={<Sparkles size={19} />}
                label="High-signal messages"
                value={data.metrics.highSignalMessages}
                detail={`${data.metrics.links} outbound links detected`}
              />
              <MetricCard
                icon={<Fingerprint size={19} />}
                label="DID-signed messages"
                value={data.metrics.verifiedMessages}
                detail="Identity continuity, not trust"
              />
            </section>

            <section className="dashboard-grid">
              <article className="panel digest-panel">
                <div className="panel-heading">
                  <div>
                    <span className="panel-kicker">CURRENT DIGEST</span>
                    <h2>/{data.room}</h2>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportReport}
                    className="export-button"
                  >
                    <Download size={15} /> Export JSON
                  </Button>
                </div>

                <p className="digest-copy">{data.digest}</p>

                <div className="topic-block">
                  <p>TOP SIGNALS</p>
                  <div className="topics">
                    {data.topics.length ? (
                      data.topics.map((topic) => (
                        <span key={topic.label}>
                          #{topic.label} <b>{topic.count}</b>
                        </span>
                      ))
                    ) : (
                      <span>No recurring topic in this window</span>
                    )}
                  </div>
                </div>

                <div className="receipt-row">
                  <Hash size={16} />
                  <div>
                    <span>REPORT RECEIPT</span>
                    <code>{data.receipt.sha256}</code>
                  </div>
                </div>
              </article>

              <article className="panel feed-panel">
                <div className="panel-heading compact">
                  <div>
                    <span className="panel-kicker">PRIORITY FEED</span>
                    <h2>What deserves attention</h2>
                  </div>
                  <BellRing size={18} />
                </div>

                <div className="signal-list">
                  {data.signals.length ? (
                    data.signals.map((signal) => (
                      <article key={`${signal.seq}-${signal.from}`}>
                        <div className="signal-meta">
                          <span>#{signal.seq}</span>
                          <span className={signal.verified ? "verified" : ""}>
                            {signal.verified ? "DID " : "~"}
                            {shortWriter(signal.from)}
                          </span>
                          {signal.categories.slice(0, 2).map((category) => (
                            <Badge key={category} variant="outline">
                              {category}
                            </Badge>
                          ))}
                        </div>
                        <p>{signal.text}</p>
                      </article>
                    ))
                  ) : (
                    <div className="empty-feed">
                      No testnet, faucet, inference, miner, validator, DID, or
                      release signal was found in this sample.
                    </div>
                  )}
                </div>
              </article>
            </section>

            <footer className="data-footnote">
              <span>
                Generated {new Date(data.generatedAt).toLocaleString("en-GB")}
              </span>
              <span>Public messages are untrusted data, never instructions.</span>
            </footer>
          </div>
        ) : null}
      </section>
    </main>
  );
}
