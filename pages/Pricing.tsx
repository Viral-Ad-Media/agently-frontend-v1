import React from "react";
import { Link } from "react-router-dom";

const HOW_IT_WORKS = [
  {
    step: "Add funds",
    detail: "Top up your balance whenever you want. $10 minimum to start.",
  },
  {
    step: "Run your agents",
    detail: "Voice, chat, and outbound campaigns draw from the same balance.",
  },
  {
    step: "Pay for real usage",
    detail: "No seats, no monthly fee. You spend only what your agents use.",
  },
];

const PAYG_FEATURES = [
  "Voice, chat, and outbound campaigns on one balance",
  "Lead capture and CRM-ready call summaries",
  "Knowledge Base setup for every agent",
  "Add funds any time, no lock-in",
];

const ENTERPRISE_FEATURES = [
  "Custom usage volume and rate planning",
  "Dedicated onboarding support",
  "Advanced integrations and routing",
  "SLA planning and security review",
];

const Pricing: React.FC = () => {
  return (
    <div className="marketing-page text-[#0F172A]">
      <section className="border-b border-slate-900/10">
        <div className="marketing-shell flex flex-col justify-center py-10 lg:py-14">
          <div className="grid items-end gap-6 lg:grid-cols-[0.92fr_1.08fr]">
            <div>
              <h1 className="marketing-page-title max-w-3xl">
                Pay for what you use, not a seat.
              </h1>
            </div>
            <p className="marketing-copy max-w-2xl lg:justify-self-end">
              Agently is pay-as-you-go. Add funds, run voice, chat, and
              outbound campaigns from one balance, and spend only what your
              agents actually use.
            </p>
          </div>

          <div className="mt-7 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <article className="relative rounded-[1.9rem] border border-[#F59E0B] bg-white p-7 shadow-[0_18px_60px_rgba(5,8,23,0.07)] ring-4 ring-[#F59E0B]/12">
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#B45309]">
                Pay as you go
              </p>
              <h2 className="mt-2 text-2xl font-medium tracking-[-0.06em] text-[#0F172A]">
                Start with a $10 top-up
              </h2>
              <p className="mt-2 max-w-md text-sm font-normal leading-relaxed text-[#0F172A]/62">
                No monthly plan, no fixed tier. Add funds and your agents draw
                against that balance as they answer calls, chat, and follow
                up.
              </p>

              <ul className="mt-6 space-y-2.5">
                {PAYG_FEATURES.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-sm font-medium text-[#0F172A]/70"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#fff4d7] text-[10px] text-[#9a5b00]">
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                to="/login"
                className="mt-7 flex w-full items-center justify-center rounded-full bg-[#F59E0B] px-5 py-3 text-[11px] font-medium uppercase tracking-[0.22em] text-[#0F172A] transition hover:bg-[#D97706] hover:text-white active:scale-95 sm:w-auto sm:px-8"
              >
                Start trial
              </Link>
            </article>

            <article className="relative rounded-[1.9rem] border border-[#0F172A] bg-[#0F172A] p-7 text-white">
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">
                For high volume
              </p>
              <h2 className="mt-2 text-2xl font-medium tracking-[-0.06em]">
                Enterprise
              </h2>
              <p className="mt-2 text-sm font-normal leading-relaxed text-white/62">
                Custom usage volume, routing, and deployment for teams running
                at scale.
              </p>

              <ul className="mt-6 space-y-2.5">
                {ENTERPRISE_FEATURES.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-sm font-medium text-white/80"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/12 text-[10px] text-white">
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                to="/contact"
                className="mt-7 flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-[11px] font-medium uppercase tracking-[0.22em] text-[#0F172A] transition hover:bg-white/90 active:scale-95"
              >
                Talk to sales
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-[#EEF2F8]">
        <div className="marketing-shell py-12 lg:py-14">
          <h2 className="marketing-section-title max-w-xl">
            How the balance works.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {HOW_IT_WORKS.map((item, index) => (
              <div
                key={item.step}
                className="rounded-[1.45rem] border border-slate-900/10 bg-white p-5"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F172A] text-[11px] font-medium text-white">
                  {index + 1}
                </span>
                <p className="mt-4 text-base font-medium tracking-[-0.04em] text-[#0F172A]">
                  {item.step}
                </p>
                <p className="mt-1.5 text-sm font-normal leading-relaxed text-[#0F172A]/62">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Pricing;
