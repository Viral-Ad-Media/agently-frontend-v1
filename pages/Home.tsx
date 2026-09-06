import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ICONS } from "../constants";
import { blogApi, type BlogPost } from "../services/blogApi";

const HERO_CHIPS = [
  "Inbound calls",
  "Outbound campaigns",
  "Lead capture",
  "Follow-up automation",
];

// Mirrors the real "Command Center" dashboard's actual card set and agent
// list (verified against the live product), with illustrative sample
// figures rather than any customer's real usage data.
const COMMAND_CENTER_METRICS = [
  { label: "Total calls", value: "62" },
  { label: "Leads captured", value: "28" },
  { label: "Call usage", value: "41m" },
];

// Real capabilities, matching what the Features page already lists.
const VOICE_CAPABILITIES = [
  "Inbound answering",
  "Outbound campaigns",
  "No-show recovery",
  "Appointment setting",
];

const COMMAND_CENTER_AGENTS = [
  { name: "Mimi", calls: "24 calls", role: "Inbound voice" },
  { name: "Timi", calls: "19 calls", role: "Outbound follow-up" },
  { name: "Fin", calls: "11 calls", role: "Website chatbot" },
];

const OUTCOME_CARDS = [
  {
    title: "Voice agents",
    copy: "Answer, qualify, route, and recover missed opportunities across inbound and outbound calls.",
    icon: <ICONS.Phone />,
    tone: "marketing-icon-tile marketing-icon-orange",
  },
  {
    title: "Chatbot agents",
    copy: "Turn website visitors into structured conversations grounded in the right Knowledge Base.",
    icon: <ICONS.MessageSquare />,
    tone: "marketing-icon-tile marketing-icon-blue",
  },
  {
    title: "Call intelligence",
    copy: "Track outcomes, transcripts, summaries, lead status, and the next best action from one workspace.",
    icon: <ICONS.Dashboard />,
    tone: "marketing-icon-tile marketing-icon-gold",
  },
];

const formatBlogDate = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const Home: React.FC = () => {
  const [latestPosts, setLatestPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    let active = true;
    blogApi
      .list(3)
      .then((posts) => {
        if (active) setLatestPosts(posts);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="marketing-page text-[#0F172A]">
      <section className="relative overflow-hidden border-b border-slate-900/10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.18),transparent_58%)]" />
        <div className="marketing-shell relative grid items-center gap-8 py-10 lg:grid-cols-[0.92fr_1.08fr] lg:py-14">
          <div className="max-w-3xl">
            <div className="marketing-eyebrow mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
              Voice · Chat · Campaigns · Leads
            </div>

            <h1 className="marketing-hero-title max-w-3xl">
              AI agents for every customer conversation.
            </h1>

            <p className="marketing-copy mt-5 max-w-2xl">
              Agently gives teams a control room for inbound calls, outbound
              follow-ups, lead capture, no-show recovery, cart recovery,
              appointment setting, onboarding, chatbot support, CRM handoff, and
              call intelligence.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/login" className="marketing-button-primary">
                Start trial
              </Link>
              <Link to="/features" className="marketing-button-secondary">
                Explore platform
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap gap-2.5">
              {HERO_CHIPS.map((chip) => (
                <span key={chip} className="marketing-chip">
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[560px] lg:justify-self-end">
            <div className="absolute -inset-5 rounded-[2.5rem] bg-[#F59E0B]/10 blur-3xl" />
            {/* The one deliberately dark surface on a light page: it is a
                preview of the real (dark) product UI. */}
            <div className="relative overflow-hidden rounded-[2rem] border border-white/[0.14] bg-[#0F172A] shadow-[0_34px_90px_rgba(0,0,0,0.55)]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <p className="text-sm font-medium tracking-[-0.03em] text-white">
                  Command Center
                </p>
                <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-300">
                  Sample workspace
                </span>
              </div>

              <div className="grid grid-cols-3 gap-px bg-white/10">
                {COMMAND_CENTER_METRICS.map((metric) => (
                  <div key={metric.label} className="bg-[#0F172A] px-4 py-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">
                      {metric.label}
                    </p>
                    <p className="mt-1.5 text-xl font-medium tracking-[-0.04em] text-white">
                      {metric.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="space-y-2 px-5 py-5">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">
                  Agent performance
                </p>
                {COMMAND_CENTER_AGENTS.map((agent) => (
                  <div
                    key={agent.name}
                    className="flex items-center justify-between gap-3 rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium tracking-[-0.03em] text-white">
                        {agent.name}
                      </p>
                      <p className="mt-0.5 text-xs font-normal text-white/45">
                        {agent.role}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-white/70">
                      {agent.calls}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-center text-xs font-normal text-[#0F172A]/45">
              A preview of the real Agently workspace, with sample data.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-900/10 bg-[#F5F8FC]">
        <div className="marketing-shell py-11 lg:py-14">
          <div className="grid items-end gap-6 lg:grid-cols-[0.82fr_1.18fr]">
            <h2 className="marketing-section-title max-w-xl">
              Built for the conversations that create revenue.
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <p className="marketing-copy">
                Agently connects voice agents, chatbots, outbound campaigns,
                lead capture, CRM handoff, and call intelligence in one
                operating layer.
              </p>
              <p className="marketing-copy">
                Instead of treating every call, chat, and follow-up as separate
                work, Agently keeps the context, outcome, and next action
                together.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
            <div className="marketing-card p-7 md:self-start">
              <div className={OUTCOME_CARDS[0].tone}>{OUTCOME_CARDS[0].icon}</div>
              <h3 className="text-2xl font-medium tracking-[-0.055em] text-[#0F172A]">
                {OUTCOME_CARDS[0].title}
              </h3>
              <p className="mt-3 max-w-md text-sm font-normal leading-relaxed text-slate-600">
                {OUTCOME_CARDS[0].copy}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {VOICE_CAPABILITIES.map((item) => (
                  <span key={item} className="marketing-chip">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid gap-4">
              {OUTCOME_CARDS.slice(1).map((card) => (
                <div key={card.title} className="marketing-card p-6">
                  <div className={card.tone}>{card.icon}</div>
                  <h3 className="text-xl font-medium tracking-[-0.055em] text-[#0F172A]">
                    {card.title}
                  </h3>
                  <p className="mt-3 text-sm font-normal leading-relaxed text-slate-600">
                    {card.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-900/10 bg-[#E8EDF4]">
        <div className="marketing-shell py-11 lg:py-12">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-[#B45309]">
                From the Agently Journal
              </p>
              <h2 className="marketing-section-title max-w-2xl">
                Product updates and practical ideas for better customer
                conversations.
              </h2>
            </div>
            <Link to="/blog" className="marketing-button-secondary shrink-0">
              View all articles
            </Link>
          </div>

          {latestPosts.length ? (
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {latestPosts.map((post) => (
                <Link
                  key={post.id}
                  to={`/blog/${post.slug}`}
                  className="group overflow-hidden rounded-[1.75rem] border border-slate-900/10 bg-white transition hover:-translate-y-1 hover:shadow-[0_20px_55px_rgba(5,8,23,0.10)]"
                >
                  <div className="aspect-[16/10] overflow-hidden bg-white/5">
                    {post.coverImageUrl ? (
                      <img
                        src={post.coverImageUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="h-full w-full bg-[linear-gradient(135deg,#0F172A,#F59E0B)]" />
                    )}
                  </div>
                  <div className="p-5">
                    <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#0F172A]/40">
                      {formatBlogDate(post.publishedAt)}
                    </p>
                    <h3 className="mt-3 text-xl font-medium leading-tight tracking-[-0.05em] text-[#0F172A]">
                      {post.title}
                    </h3>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                      {post.excerpt}
                    </p>
                    <p className="mt-5 text-sm font-medium text-[#B45309]">
                      Read article →
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-[1.75rem] border border-slate-900/10 bg-white px-6 py-8 text-sm text-slate-500">
              The first Agently article will appear here after it is published
              from the owner dashboard.
            </div>
          )}
        </div>
      </section>

      <section className="bg-[#0F172A] text-white">
        <div className="marketing-shell grid items-center gap-8 py-12 md:grid-cols-[1fr_auto] lg:py-14">
          <h2 className="max-w-2xl text-[clamp(1.9rem,4vw,3.2rem)] font-medium leading-[1] tracking-[-0.065em]">
            Launch agents that answer, recover, qualify, and report.
          </h2>
          <Link to="/pricing" className="marketing-button-light shrink-0">
            View pricing
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Home;
