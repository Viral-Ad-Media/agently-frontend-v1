import React, { useState } from "react";
import { api } from "../services/api";

const CONTACT_POINTS = [
  {
    label: "Sales",
    title: "Plan your rollout",
    copy: "Discuss voice agents, chatbot use cases, campaigns, and the right starting plan.",
  },
  {
    label: "Support",
    title: "Get implementation help",
    copy: "Ask about Knowledge Base setup, agent behavior, call flows, and workspace configuration.",
  },
  {
    label: "Partnerships",
    title: "Build with Agently",
    copy: "Explore agency, implementation, and platform partnership opportunities.",
  },
];

const Contact: React.FC = () => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.submitContact(form);
      setSent(true);
      setForm({ name: "", email: "", subject: "", message: "" });
      window.setTimeout(() => setSent(false), 5000);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send your message.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="marketing-page text-[#0F172A]">
      <section className="border-b border-slate-900/10">
        <div className="marketing-shell grid items-center gap-8 py-10 lg:grid-cols-[0.82fr_1.18fr] lg:py-14">
          <div>
            <h1 className="marketing-page-title max-w-xl">
              Let’s design the agent workflow your team needs next.
            </h1>
            <p className="marketing-copy mt-5 max-w-xl">
              Tell us whether you are launching inbound answering, outbound
              follow-ups, chatbot support, lead recovery, appointment setting,
              or a custom AI agent workflow.
            </p>

            <div className="mt-6 grid gap-3">
              {CONTACT_POINTS.map((point) => (
                <article
                  key={point.label}
                  className="rounded-[1.5rem] border border-slate-900/10 bg-white p-4 shadow-[0_14px_50px_rgba(5,8,23,0.06)]"
                >
                  <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-[#B45309]">
                    {point.label}
                  </p>
                  <h2 className="mt-1 text-lg font-medium tracking-[-0.055em]">
                    {point.title}
                  </h2>
                  <p className="mt-1 text-sm font-normal leading-relaxed text-[#0F172A]/62">
                    {point.copy}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-900/10 bg-white p-5 shadow-[0_24px_80px_rgba(5,8,23,0.1)] sm:p-6">
            {sent ? (
              <div className="flex min-h-[430px] flex-col items-center justify-center text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl font-medium text-emerald-600">
                  ✓
                </div>
                <h2 className="text-2xl font-medium tracking-[-0.06em]">
                  Message sent.
                </h2>
                <p className="mt-2 max-w-sm text-sm font-normal leading-relaxed text-[#0F172A]/62">
                  Thanks for reaching out. The team will review your message and
                  respond as soon as possible.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-[#0F172A]/42">
                    Send a message
                  </p>
                  <h2 className="mt-2 text-2xl font-medium tracking-[-0.06em]">
                    Tell us what you want Agently to handle.
                  </h2>
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-normal text-red-600">
                    {error}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.22em] text-[#0F172A]/42">
                      Full name
                    </span>
                    <input
                      type="text"
                      required
                      className="w-full rounded-2xl border border-slate-900/10 bg-[#F1F5F9] px-4 py-3 text-sm font-normal outline-none transition focus:border-[#F59E0B] focus:bg-white"
                      value={form.name}
                      onChange={(event) =>
                        setForm({ ...form, name: event.target.value })
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.22em] text-[#0F172A]/42">
                      Email address
                    </span>
                    <input
                      type="email"
                      required
                      className="w-full rounded-2xl border border-slate-900/10 bg-[#F1F5F9] px-4 py-3 text-sm font-normal outline-none transition focus:border-[#F59E0B] focus:bg-white"
                      value={form.email}
                      onChange={(event) =>
                        setForm({ ...form, email: event.target.value })
                      }
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.22em] text-[#0F172A]/42">
                    Subject
                  </span>
                  <input
                    type="text"
                    required
                    className="w-full rounded-2xl border border-slate-900/10 bg-[#F1F5F9] px-4 py-3 text-sm font-normal outline-none transition focus:border-[#F59E0B] focus:bg-white"
                    value={form.subject}
                    onChange={(event) =>
                      setForm({ ...form, subject: event.target.value })
                    }
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.22em] text-[#0F172A]/42">
                    Message
                  </span>
                  <textarea
                    rows={5}
                    required
                    className="w-full resize-none rounded-2xl border border-slate-900/10 bg-[#F1F5F9] px-4 py-3 text-sm font-normal outline-none transition focus:border-[#F59E0B] focus:bg-white"
                    value={form.message}
                    onChange={(event) =>
                      setForm({ ...form, message: event.target.value })
                    }
                  />
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center rounded-full bg-[#0F172A] px-6 py-3.5 text-[11px] font-medium uppercase tracking-[0.22em] text-white transition hover:bg-[#1a2633] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Sending..." : "Send message"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Contact;
