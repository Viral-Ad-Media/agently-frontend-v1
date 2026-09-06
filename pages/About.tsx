import React from "react";
import { Link } from "react-router-dom";
import { ICONS } from "../constants";

const PRINCIPLES = [
  {
    title: "Conversation-first",
    copy: "Agently is built around the real moments customers create: calls, missed leads, follow-ups, support questions, and handoffs.",
  },
  {
    title: "Knowledge grounded",
    copy: "Each agent should answer from the right Knowledge Base, not from scattered notes or another team’s context.",
  },
  {
    title: "Outcome aware",
    copy: "Every conversation should leave a useful trail: summary, intent, status, owner, and the next action.",
  },
];

const About: React.FC = () => {
  return (
    <div className="marketing-page text-[#0F172A]">
      <section className="border-b border-slate-900/10">
        <div className="marketing-shell grid items-center gap-8 py-10 lg:grid-cols-[0.92fr_1.08fr] lg:py-14">
          <div>
            <h1 className="marketing-page-title max-w-3xl">
              A control room for customer conversations.
            </h1>
            <p className="marketing-copy mt-5 max-w-2xl">
              Agently exists to help teams deploy AI agents that answer,
              qualify, recover, route, and report across voice, chat, campaigns,
              and CRM workflows without turning operations into a maze.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/features" className="marketing-button-primary">
                Explore platform
              </Link>
              <Link to="/contact" className="marketing-button-secondary">
                Talk to us
              </Link>
            </div>
          </div>

          <div className="marketing-card overflow-hidden bg-[#EEF2F8] p-4 lg:p-5">
            <div className="rounded-[1.35rem] border border-slate-900/10 bg-white p-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#0F172A]/50">
                What we are building
              </p>
              <h2 className="marketing-section-title mt-3 max-w-xl">
                One place where agents know what to say and what to do next.
              </h2>
              <p className="marketing-small-copy mt-4 max-w-2xl">
                The goal is not to replace the human relationship. It is to make
                sure every customer touchpoint is captured, understood, and
                moved forward with speed and consistency.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#EEF2F8]">
        <div className="marketing-shell py-12 lg:py-14">
          <div className="grid gap-6 md:grid-cols-3 md:divide-x md:divide-slate-900/10">
            {PRINCIPLES.map((principle) => (
              <div key={principle.title} className="md:px-6 first:md:pl-0">
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#0F172A] text-white">
                  <ICONS.Sparkles />
                </div>
                <h2 className="text-xl font-medium tracking-[-0.052em]">
                  {principle.title}
                </h2>
                <p className="marketing-small-copy mt-3">{principle.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
