import React from "react";
import { Link } from "react-router-dom";

const PLANS = [
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    desc: "For teams launching their first AI voice and chat workflows.",
    features: [
      "100 call minutes",
      "AI web chat",
      "Lead capture workspace",
      "Standard voice profiles",
      "Knowledge Base setup",
    ],
    cta: "Start trial",
    popular: false,
  },
  {
    name: "Professional",
    price: "$149",
    period: "/mo",
    desc: "For teams running inbound support, outbound follow-ups, and recovery campaigns.",
    features: [
      "500 call minutes",
      "Custom agent instructions",
      "Appointment and no-show workflows",
      "Premium voice profiles",
      "CRM-ready summaries",
      "Priority support",
    ],
    cta: "Get started",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "For high-volume teams with advanced routing, security, and deployment needs.",
    features: [
      "Custom usage volume",
      "Dedicated onboarding support",
      "Advanced integrations",
      "Custom voice options",
      "SLA planning",
      "Security review support",
    ],
    cta: "Contact sales",
    popular: false,
  },
];

const Pricing: React.FC = () => {
  return (
    <div className="marketing-page text-black">
      <section className="border-b border-black/12">
        <div className="marketing-shell flex min-h-[calc(100svh-74px)] flex-col justify-center py-8 lg:py-7">
          <div className="grid items-end gap-6 lg:grid-cols-[0.92fr_1.08fr]">
            <div>
              <div className="marketing-eyebrow mb-5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ff9900]" />
                Pricing plans
              </div>
              <h1 className="marketing-page-title max-w-3xl">
                Simple pricing for agents that answer, qualify, and follow up.
              </h1>
            </div>
            <p className="marketing-copy max-w-2xl lg:justify-self-end">
              Start lean, then scale your AI agent operations across inbound
              calls, outbound campaigns, website chat, lead recovery, and call
              intelligence without rebuilding your workflow.
            </p>
          </div>

          <div className="mt-7 grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <article
                key={plan.name}
                className={`relative rounded-[1.9rem] border bg-white p-6 shadow-[0_18px_60px_rgba(5,8,23,0.08)] transition hover:-translate-y-1 hover:shadow-[0_26px_80px_rgba(5,8,23,0.12)] ${
                  plan.popular
                    ? "border-[#ff9900] ring-4 ring-[#ff9900]/12"
                    : "border-black/12"
                }`}
              >
                {plan.popular && (
                  <div className="absolute right-5 top-5 rounded-full bg-black px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-white">
                    Popular
                  </div>
                )}

                <div className="pr-24">
                  <h2 className="text-2xl font-medium tracking-[-0.06em] text-black">
                    {plan.name}
                  </h2>
                  <p className="mt-2 text-sm font-normal leading-relaxed text-black/62">
                    {plan.desc}
                  </p>
                </div>

                <div className="mt-5 flex items-end gap-1">
                  <span className="text-[clamp(2rem,3.4vw,3.2rem)] font-medium leading-none tracking-[-0.07em]">
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className="pb-1 text-xs font-medium uppercase tracking-[0.18em] text-black/42">
                      {plan.period}
                    </span>
                  )}
                </div>

                <ul className="mt-5 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm font-medium text-black/70"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#fff4d7] text-[10px] text-[#9a5b00]">
                        ✓
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  to={plan.name === "Enterprise" ? "/contact" : "/login"}
                  className={`mt-6 flex w-full items-center justify-center rounded-full px-5 py-3 text-[11px] font-medium uppercase tracking-[0.22em] transition active:scale-95 ${
                    plan.popular
                      ? "bg-[#ff9900] text-black hover:bg-[#e68a00]"
                      : "bg-black text-white hover:bg-black"
                  }`}
                >
                  {plan.cta}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#F8FAFC]">
        <div className="marketing-shell py-12 lg:py-14">
          <div className="grid items-center gap-5 rounded-[2rem] border border-black/12 bg-black p-6 text-white md:grid-cols-[1fr_auto] md:p-8">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/42">
                Need a custom rollout?
              </p>
              <h2 className="mt-3 max-w-2xl text-[clamp(1.7rem,3vw,2.8rem)] font-medium leading-[1] tracking-[-0.065em]">
                Plan higher volume, custom routing, and advanced integrations
                with the team.
              </h2>
            </div>
            <Link to="/contact" className="marketing-button-light">
              Talk to sales
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Pricing;
