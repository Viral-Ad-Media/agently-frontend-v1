import React from "react";
import { Link } from "react-router-dom";
import { ICONS } from "../constants";

const FEATURES = [
  {
    title: "Inbound voice agents",
    desc: "Answer calls, screen intent, capture messages, route urgent issues, and keep your team focused on qualified work.",
    icon: <ICONS.Phone />,
    tone: "marketing-icon-tile marketing-icon-orange",
  },
  {
    title: "Outbound campaigns",
    desc: "Run follow-ups for trials, renewals, missed calls, no-shows, abandoned carts, and reactivation lists.",
    icon: <ICONS.Dashboard />,
    tone: "marketing-icon-tile marketing-icon-blue",
  },
  {
    title: "Website chatbot",
    desc: "Convert visitors with a chatbot that answers from approved sources and captures structured lead data.",
    icon: <ICONS.MessageSquare />,
    tone: "marketing-icon-tile marketing-icon-cream",
  },
  {
    title: "Knowledge Base grounding",
    desc: "Assign each agent to the right Knowledge Base so answers stay scoped, accurate, and separated by use case.",
    icon: <ICONS.Shield />,
    tone: "marketing-icon-tile marketing-icon-gold",
  },
  {
    title: "Lead capture + CRM handoff",
    desc: "Turn conversations into clean records with summaries, contact details, qualification notes, and next actions.",
    icon: <ICONS.Users />,
    tone: "marketing-icon-tile marketing-icon-mint",
  },
  {
    title: "Call intelligence",
    desc: "Review outcomes, transcripts, recordings, categories, tags, and follow-up opportunities from one workspace.",
    icon: <ICONS.Sparkles />,
    tone: "marketing-icon-tile marketing-icon-violet",
  },
];

const PIPELINE = [
  {
    step: "Answer",
    detail: "Pick up inbound calls and chats before demand leaks away.",
  },
  {
    step: "Qualify",
    detail: "Ask the right questions and capture structured intent.",
  },
  {
    step: "Recover",
    detail: "Bring back missed calls, no-shows, carts, and stale leads.",
  },
  {
    step: "Route",
    detail: "Send urgent or qualified conversations to the right owner.",
  },
  {
    step: "Summarize",
    detail: "Write the call outcome, notes, lead status, and next action.",
  },
  {
    step: "Follow up",
    detail: "Trigger the next call, message, CRM handoff, or campaign step.",
  },
];

const Features: React.FC = () => {
  return (
    <div className="marketing-page text-black">
      <section className="border-b border-black/12">
        <div className="marketing-shell grid min-h-[calc(100svh-74px)] items-center gap-8 py-8 lg:grid-cols-[0.78fr_1.22fr] lg:py-7">
          <div>
            <div className="marketing-eyebrow mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff9900]" />
              Platform features
            </div>
            <h1 className="marketing-page-title">
              One platform for voice, chat, follow-ups, and revenue recovery.
            </h1>
            <p className="marketing-copy mt-5 max-w-xl">
              Agently combines customer-facing AI agents with the operational
              controls your team needs: Knowledge Base assignment, campaign
              workflows, lead handoff, call records, and follow-up automation.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/login" className="marketing-button-primary">
                Start trial
              </Link>
              <Link to="/pricing" className="marketing-button-secondary">
                See pricing
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className="marketing-card p-5 lg:p-6"
              >
                <div className={feature.tone}>{feature.icon}</div>
                <h3 className="text-lg font-medium leading-tight tracking-[-0.055em]">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm font-normal leading-relaxed text-[#0F172A]/72">
                  {feature.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#F8FAFC]">
        <div className="marketing-shell py-12 lg:py-14">
          <div className="grid items-center gap-8 rounded-[2rem] border border-black/12 bg-white p-6 shadow-[0_20px_70px_rgba(5,8,23,0.08)] lg:grid-cols-[0.85fr_1.15fr] lg:p-8">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-black/42">
                Agent workflow
              </p>
              <h2 className="mt-3 text-[clamp(1.85rem,3.2vw,3.2rem)] font-medium leading-[0.98] tracking-[-0.065em]">
                Built around what happens after the conversation starts.
              </h2>
              <p className="mt-4 text-sm font-normal leading-relaxed text-black/62">
                The product is not only a bot. It is a workflow layer that helps
                every call or chat become a record, a decision, or a follow-up.
              </p>
            </div>
            <div className="relative grid gap-3 sm:grid-cols-2">
              <div className="pointer-events-none absolute left-5 top-6 hidden h-[calc(100%-3rem)] w-px bg-gradient-to-b from-[#F59E0B]/40 via-[#f6b94d]/40 to-[#0F172A]/10 sm:block" />
              {PIPELINE.map((item, index) => (
                <div
                  key={item.step}
                  className="group relative overflow-hidden rounded-[1.45rem] border border-[#0F172A]/12 bg-[#F8FAFC] p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)] transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <div className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[#F59E0B]/10 blur-2xl transition-opacity group-hover:opacity-80" />
                  <div className="relative flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#F59E0B] text-[12px] font-medium text-white shadow-[0_12px_24px_rgba(245,158,11,0.22)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="text-base font-medium tracking-[-0.045em] text-[#0F172A]">
                        {item.step}
                      </p>
                      <p className="mt-1 text-sm font-normal leading-snug text-[#0F172A]/68">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Features;
