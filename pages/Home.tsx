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

const WORKSPACE_ITEMS = [
  {
    label: "Inbound line",
    value: "Answering now",
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    label: "Outbound campaign",
    value: "42 queued",
    tone: "bg-amber-50 text-amber-700",
  },
  {
    label: "Follow-up queue",
    value: "No-shows + carts",
    tone: "bg-slate-100 text-slate-900/70",
  },
  {
    label: "Knowledge Base",
    value: "Synced",
    tone: "bg-amber-50 text-amber-800",
  },
];

const FLOW_STEPS = [
  "Understands intent",
  "Qualifies the lead",
  "Books or routes",
  "Writes the CRM summary",
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
        <div className="marketing-shell relative grid min-h-[calc(100svh-74px)] items-center gap-8 py-8 lg:grid-cols-[0.92fr_1.08fr] lg:py-7">
          <div className="max-w-3xl">
            <div className="marketing-eyebrow mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
              Voice · Chat · Campaigns · Leads
            </div>

            <h1 className="marketing-hero-title max-w-4xl">
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

          <div className="relative mx-auto w-full max-w-[640px] lg:justify-self-end">
            <div className="absolute -inset-5 rounded-[2.5rem] bg-[#F59E0B]/12 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-slate-900/10 bg-[#0F172A] p-3 shadow-[0_34px_90px_rgba(5,8,23,0.22)]">
              <div className="mb-3 flex items-center justify-between rounded-[1.35rem] border border-white/10 bg-white/[0.055] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                </div>
                <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/40">
                  Agent workspace
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
                <div className="rounded-[1.45rem] border border-white/10 bg-white/[0.055] p-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-white/40">
                    Live operations
                  </p>
                  <div className="mt-4 space-y-2.5">
                    {WORKSPACE_ITEMS.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-[1.1rem] border border-white/10 bg-white/[0.05] p-3"
                      >
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/35">
                          {item.label}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <p className="text-sm font-medium tracking-[-0.035em] text-white">
                            {item.value}
                          </p>
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-medium ${item.tone}`}
                          >
                            Active
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.45rem] border border-white/10 bg-[#F8FAFC] p-4 text-[#0F172A]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-[#0F172A]/45">
                        Conversation flow
                      </p>
                      <h2 className="mt-2 max-w-sm text-[clamp(1.55rem,3vw,2.55rem)] font-medium leading-[0.96] tracking-[-0.065em]">
                        From missed intent to booked action.
                      </h2>
                    </div>
                    <div className="marketing-icon-tile marketing-icon-orange h-11 w-11 shrink-0 rounded-full">
                      <ICONS.Sparkles />
                    </div>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {FLOW_STEPS.map((step, index) => (
                      <div
                        key={step}
                        className="flex items-center gap-3 rounded-[1rem] border border-slate-900/10 bg-white px-3 py-2.5"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F59E0B]/14 text-[10px] font-medium text-[#B45309] ring-1 ring-[#F59E0B]/25">
                          {index + 1}
                        </span>
                        <span className="text-sm font-medium tracking-[-0.03em] text-[#0F172A]/80">
                          {step}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-[1.15rem] bg-amber-50 p-3">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-800">
                      Next action
                    </p>
                    <p className="mt-1 text-sm font-medium tracking-[-0.03em]">
                      Save summary, assign owner, trigger follow-up.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-900/10 bg-[#F1F5F9]">
        <div className="marketing-shell grid items-center gap-8 py-12 lg:grid-cols-[0.82fr_1.18fr] lg:py-14">
          <div>
            <div className="marketing-eyebrow mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
              About Agently
            </div>
            <h2 className="marketing-section-title max-w-xl">
              Built for the conversations that create revenue.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <p className="marketing-copy">
              Agently connects voice agents, chatbots, outbound campaigns, lead
              capture, CRM handoff, and call intelligence in one operating
              layer.
            </p>
            <p className="marketing-copy">
              Instead of treating every call, chat, and follow-up as separate
              work, Agently keeps the context, outcome, and next action
              together.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-900/10 bg-white">
        <div className="marketing-shell py-12 lg:py-14">
          <div className="grid gap-4 md:grid-cols-3">
            {OUTCOME_CARDS.map((card) => (
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
      </section>

      <section className="border-b border-slate-900/10 bg-[#F1F5F9]">
        <div className="marketing-shell py-12 lg:py-16">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="marketing-eyebrow mb-5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
                From the Agently Journal
              </div>
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
                  <div className="aspect-[16/10] overflow-hidden bg-slate-900/5">
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

      <section className="bg-[#F1F5F9]">
        <div className="marketing-shell py-14">
          <div className="grid items-center gap-8 rounded-[2rem] border border-slate-900/10 bg-[#0F172A] p-6 text-white shadow-[0_28px_90px_rgba(5,8,23,0.18)] md:grid-cols-[1fr_auto] md:p-8">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/42">
                Built for daily revenue operations
              </p>
              <h2 className="mt-3 max-w-2xl text-[clamp(1.9rem,4vw,3.4rem)] font-medium leading-[0.98] tracking-[-0.065em]">
                Launch agents that answer, recover, qualify, and report.
              </h2>
            </div>
            <Link to="/pricing" className="marketing-button-light">
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
