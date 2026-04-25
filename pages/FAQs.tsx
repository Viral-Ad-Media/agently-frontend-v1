import React, { useState } from "react";

const FAQs: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      question: "How does Agently learn about my business?",
      answer:
        "Agently uses advanced AI to scan your website and extract key information about your services, pricing, and business hours. You can also manually add FAQ entries and specific instructions in the dashboard.",
    },
    {
      question: "Can Agently handle complex customer questions?",
      answer:
        "Yes. Agently is powered by the latest Large Language Models, allowing it to understand context and provide nuanced answers. If a question is too complex, it can automatically escalate the call to a human team member.",
    },
    {
      question: "What happens if Agently can't answer a question?",
      answer:
        "Agently is programmed to be honest. If it doesn't know an answer, it will offer to take a message or transfer the caller to your escalation number, ensuring the customer is never left frustrated.",
    },
    {
      question: "Is my customer data secure?",
      answer:
        "Absolutely. We use industry-standard encryption for all data at rest and in transit. We are fully compliant with major data protection regulations and never sell your customer information.",
    },
    {
      question: "Do I need any special hardware?",
      answer:
        "No. Agently is a cloud-based platform. You can use your existing phone number or we can provide a new one for you. All you need is an internet connection to manage your settings.",
    },
    {
      question: "Can I customize the voice of my AI agent?",
      answer:
        "Yes. We offer a variety of high-quality, natural-sounding voice profiles. You can choose the one that best fits your brand's personality, from professional and authoritative to friendly and approachable.",
    },
  ];

  return (
    <div className="min-h-screen bg-white font-inter pt-32 pb-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-20">
          <h2 className="text-xs font-black text-indigo-600 uppercase tracking-[0.3em] mb-4">
            Support Center
          </h2>
          <h1 className="text-5xl lg:text-7xl font-black text-slate-900 tracking-tight mb-8 leading-none">
            Got Questions? <br />
            We've Got Answers.
          </h1>
          <p className="text-xl text-slate-500 font-medium leading-relaxed">
            Everything you need to know about Agently and how it can transform
            your business communications.
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="group rounded-[2.5rem] border-2 border-slate-50 bg-slate-50 hover:bg-white hover:border-indigo-100 transition-all duration-300 overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full p-8 flex items-center justify-between text-left outline-none"
              >
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  {faq.question}
                </h3>
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${openIndex === i ? "bg-indigo-600 text-white rotate-45" : "bg-white text-slate-400"}`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
              </button>
              <div
                className={`transition-all duration-500 overflow-hidden ${openIndex === i ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
              >
                <div className="px-8 pb-8 text-lg text-slate-500 font-medium leading-relaxed">
                  {faq.answer}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-24 text-center p-12 rounded-[3rem] bg-slate-900 text-white relative overflow-hidden">
          <div className="absolute top-0 left-0 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl -ml-32 -mt-32"></div>
          <h3 className="text-3xl font-black mb-4 tracking-tight">
            Still have questions?
          </h3>
          <p className="text-indigo-100 font-medium leading-relaxed mb-10">
            Our support team is available 24/7 to help you with any inquiries.
          </p>
          <button className="px-10 py-5 bg-white text-slate-900 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-50 transition-all shadow-2xl active:scale-95">
            Contact Support
          </button>
        </div>
      </div>
    </div>
  );
};

export default FAQs;
