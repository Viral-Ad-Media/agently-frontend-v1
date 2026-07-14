import React, { useState } from "react";
import { Link } from "react-router-dom";

const FAQS = [
  {
    question: "What does Agently actually do?",
    answer:
      "Agently lets you launch AI voice agents, website chatbots, outbound follow-up workflows, lead capture, CRM handoff, and call intelligence from one workspace. It is built for customer conversations before, during, and after the first call.",
  },
  {
    question: "Is Agently only an AI receptionist?",
    answer:
      "No. Reception-style answering is one workflow, but Agently is a broader AI agent platform for inbound calls, outbound campaigns, qualification, no-show recovery, cart recovery, appointment setting, onboarding, and post-call follow-up.",
  },
  {
    question: "How does an agent know what to say?",
    answer:
      "Each agent can be connected to a selected Knowledge Base made from approved website content, FAQs, product details, policies, and custom instructions. The goal is to keep answers grounded in the content you assign to that agent.",
  },
  {
    question: "Can different agents use different Knowledge Bases?",
    answer:
      "Yes. You can separate Knowledge Bases by brand, website, department, industry, or workflow. An agent assigned to one Knowledge Base should not fall back to another Knowledge Base when it does not know an answer.",
  },
  {
    question: "Can Agently make outbound calls?",
    answer:
      "Yes. Agently supports outbound campaigns for lead follow-up, missed-call recovery, no-show reminders, trial activation, cart recovery, renewal nudges, and other structured call workflows.",
  },
  {
    question: "What happens when the AI cannot answer?",
    answer:
      "The agent can be instructed to be honest, capture the question, route the conversation, schedule a callback, or escalate to a human with the relevant call summary and context.",
  },
  {
    question: "Do I need special hardware?",
    answer:
      "No. Agently is cloud-based. You manage agents from the dashboard, connect or assign numbers where supported, and review conversations, outcomes, leads, and follow-up activity from the workspace.",
  },
];

const FAQs: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="marketing-page text-[#0F172A]">
      <section className="border-b border-[#0F172A]/10">
        <div className="marketing-shell grid min-h-[calc(100svh-74px)] items-center gap-8 py-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-7">
          <div>
            <div className="marketing-eyebrow mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
              FAQs
            </div>
            <h1 className="marketing-page-title max-w-xl">
              Questions before your first agent goes live.
            </h1>
            <p className="marketing-copy mt-5 max-w-xl">
              Clear answers on voice agents, chatbots, Knowledge Bases, outbound
              calls, escalation, and how Agently fits into customer conversation
              workflows.
            </p>
            <div className="mt-6 rounded-[1.65rem] border border-[#0F172A]/10 bg-[#F8FAFC]/82 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-[#F59E0B]">
                Need a workflow review?
              </p>
              <h2 className="mt-2 max-w-sm text-[clamp(1.75rem,3vw,2.5rem)] font-medium leading-none tracking-[-0.055em] text-[#0F172A]">
                Talk through your first agent setup.
              </h2>
              <p className="mt-3 text-base font-normal leading-[1.3125] text-[#0F172A]">
                Share the calls, chats, or follow-ups you want to automate and
                we will help you map the right starting point.
              </p>
              <Link
                to="/contact"
                className="mt-4 inline-flex rounded-full bg-[#0F172A] px-5 py-3 text-[11px] font-medium uppercase tracking-[0.2em] text-[#F8FAFC] transition hover:bg-[#1a2633]"
              >
                Contact us
              </Link>
            </div>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, index) => {
              const isOpen = openIndex === index;
              return (
                <article
                  key={faq.question}
                  className="overflow-hidden rounded-[1.35rem] border border-[#0F172A]/10 bg-[#F8FAFC]/88 shadow-[0_14px_42px_rgba(15,23,42,0.055)] backdrop-blur-sm"
                >
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="flex w-full items-center justify-between gap-5 px-5 py-4 text-left outline-none"
                  >
                    <h2 className="text-base font-medium leading-[1.12] tracking-[-0.035em] text-[#0F172A]">
                      {faq.question}
                    </h2>
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-medium transition ${
                        isOpen
                          ? "rotate-45 bg-[#F59E0B] text-white"
                          : "bg-white text-[#0F172A]/58"
                      }`}
                    >
                      +
                    </span>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ${
                      isOpen ? "max-h-60 opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <p className="px-5 pb-5 text-base font-normal leading-[1.3125] text-[#0F172A]">
                      {faq.answer}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};

export default FAQs;
