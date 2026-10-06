import React from "react";
import { useNavigate } from "react-router-dom";
import { AuthShell, BackButton } from "../components/AuthShell";

/**
 * Terms & Privacy (v1.8, 2026-10-05).
 *
 * Content ported faithfully from the approved "agently-auth-pages" preview:
 * fraud and unlawful-use prohibitions, generally non-refundable usage/credits,
 * data safeguards, third-party processors, and the commitment not to sell
 * personal information. This is product copy, not legal advice — Lawal was
 * advised to have a lawyer review it before it goes live.
 */

const SECTIONS: Array<{ id: string; label: string }> = [
  { id: "service", label: "The service" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "billing", label: "Billing & refunds" },
  { id: "privacy", label: "Data & privacy" },
  { id: "security", label: "Security" },
  { id: "liability", label: "Liability" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
];

const Terms: React.FC = () => {
  const navigate = useNavigate();
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/login");
  };

  return (
    <AuthShell wide>
      <BackButton onClick={goBack}>Back</BackButton>

      <header className="mb-[34px] border-b border-[var(--line)] pb-7">
        <h1
          style={{ fontFamily: '"Archivo", sans-serif' }}
          className="m-0 mb-[14px] text-[clamp(38px,6vw,62px)] font-semibold leading-[0.98] tracking-[-0.05em] text-[var(--text)]"
        >
          Terms &amp; Privacy.
        </h1>
        <p className="m-0 text-[var(--muted)]">
          Effective 5 October 2026 · Please read these terms before using
          Agently.
        </p>
      </header>

      <div className="grid gap-[54px] md:grid-cols-[190px_minmax(0,1fr)] max-md:gap-[26px]">
        <nav
          aria-label="Terms sections"
          className="grid content-start gap-2 self-start md:sticky md:top-[30px] max-md:grid-cols-2 max-md:border-b max-md:border-[var(--line)] max-md:pb-[22px]"
        >
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-[13px] text-[var(--muted)] no-underline transition hover:text-[var(--accent)]"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="grid gap-[30px]">
          <section id="service" className="scroll-mt-6">
            <h2
              style={{ fontFamily: '"Archivo", sans-serif' }}
              className="m-0 mb-[9px] text-[21px] font-semibold tracking-[-0.025em] text-[var(--text)]"
            >
              1. Agreement and the service
            </h2>
            <p className="m-0 text-[14px] leading-[1.7] text-[var(--muted)]">
              These Terms govern access to Agently&apos;s calling, lead
              management, website chat and related customer-engagement services.
              By creating an account or using the service, you confirm that you
              can enter a binding agreement for yourself or the business you
              represent. You are responsible for the accuracy of your account
              information and for activity under your account.
            </p>
          </section>

          <section id="acceptable-use" className="scroll-mt-6">
            <h2
              style={{ fontFamily: '"Archivo", sans-serif' }}
              className="m-0 mb-[9px] text-[21px] font-semibold tracking-[-0.025em] text-[var(--text)]"
            >
              2. Acceptable use
            </h2>
            <p className="m-0 text-[14px] leading-[1.7] text-[var(--muted)]">
              You may use Agently only for lawful business purposes and with all
              notices, permissions and consents required in the countries where
              you operate.
            </p>
            <ul className="mb-0 ml-5 mt-[10px] space-y-[10px] pl-0 text-[14px] leading-[1.7] text-[var(--muted)]">
              <li>
                <strong className="font-semibold text-[var(--text)]">
                  No fraud or impersonation.
                </strong>{" "}
                Do not deceive people, misrepresent identity, falsify caller
                information, or use the service to obtain money, credentials or
                confidential information dishonestly.
              </li>
              <li>
                <strong className="font-semibold text-[var(--text)]">
                  No unlawful outreach.
                </strong>{" "}
                Do not send spam, harass people, evade consent requirements, or
                violate telemarketing, privacy, recording or do-not-call laws.
              </li>
              <li>
                <strong className="font-semibold text-[var(--text)]">
                  No harmful content.
                </strong>{" "}
                Do not distribute malware, facilitate abuse, exploit minors,
                infringe intellectual property or interfere with the service.
              </li>
            </ul>
            <p className="m-0 mt-[10px] text-[14px] leading-[1.7] text-[var(--muted)]">
              We may restrict or suspend access where we reasonably believe an
              account threatens people, the platform or compliance with law.
              Serious or repeated violations may result in termination.
            </p>
          </section>

          <section id="billing" className="scroll-mt-6">
            <h2
              style={{ fontFamily: '"Archivo", sans-serif' }}
              className="m-0 mb-[9px] text-[21px] font-semibold tracking-[-0.025em] text-[var(--text)]"
            >
              3. Billing, usage and refunds
            </h2>
            <p className="m-0 text-[14px] leading-[1.7] text-[var(--muted)]">
              Agently currently offers pay-as-you-go services with the minimum
              funding amount shown at purchase. Charges may depend on usage,
              providers, destinations or enabled services. You authorize the
              charges you approve in the product and are responsible for
              applicable taxes.
            </p>
            <p className="m-0 mt-[10px] text-[14px] leading-[1.7] text-[var(--muted)]">
              <strong className="font-semibold text-[var(--text)]">
                Purchased credits and completed usage are generally
                non-refundable.
              </strong>{" "}
              This includes unused balances after a change of mind, except where
              a refund is required by law. If you believe there is a duplicate
              charge, a technical billing error or unauthorized activity, contact
              support promptly so we can investigate. Custom or monthly plans may
              carry additional written terms shown before purchase.
            </p>
          </section>

          <section id="privacy" className="scroll-mt-6">
            <h2
              style={{ fontFamily: '"Archivo", sans-serif' }}
              className="m-0 mb-[9px] text-[21px] font-semibold tracking-[-0.025em] text-[var(--text)]"
            >
              4. Your information and privacy
            </h2>
            <p className="m-0 text-[14px] leading-[1.7] text-[var(--muted)]">
              We use account, contact, conversation, lead, chat, usage and
              technical information to provide, secure, support and improve the
              services you choose to use. We do not sell your personal
              information to third parties. We do not permit third-party
              advertising networks to use your private workspace data for their
              own advertising.
            </p>
            <p className="m-0 mt-[10px] text-[14px] leading-[1.7] text-[var(--muted)]">
              We may share the minimum information necessary with
              infrastructure, communications, payment, analytics and support
              providers that process data for us under appropriate contractual
              safeguards. We may also disclose information when required by law,
              to protect rights and safety, or as part of a business transaction
              subject to confidentiality and applicable law.
            </p>
            <p className="m-0 mt-[10px] text-[14px] leading-[1.7] text-[var(--muted)]">
              You remain responsible for the data you upload and for giving any
              notices or obtaining any consent required from your customers and
              contacts. Requests about access, correction or deletion can be
              sent to the contact below. Some records may be retained where
              required for security, billing, dispute resolution or legal
              compliance.
            </p>
          </section>

          <section id="security" className="scroll-mt-6">
            <h2
              style={{ fontFamily: '"Archivo", sans-serif' }}
              className="m-0 mb-[9px] text-[21px] font-semibold tracking-[-0.025em] text-[var(--text)]"
            >
              5. Security and account protection
            </h2>
            <p className="m-0 text-[14px] leading-[1.7] text-[var(--muted)]">
              We use reasonable administrative, technical and organizational
              safeguards designed to protect information. No online service can
              guarantee absolute security. Keep your credentials confidential,
              use strong passwords and notify us promptly if you suspect
              unauthorized access. We will never ask you to disclose your
              password by email.
            </p>
          </section>

          <section id="liability" className="scroll-mt-6">
            <h2
              style={{ fontFamily: '"Archivo", sans-serif' }}
              className="m-0 mb-[9px] text-[21px] font-semibold tracking-[-0.025em] text-[var(--text)]"
            >
              6. Availability and responsibility
            </h2>
            <p className="m-0 text-[14px] leading-[1.7] text-[var(--muted)]">
              The service may depend on telecommunications networks and
              third-party providers, and interruptions can occur. Agently is
              provided on an “as available” basis to the extent permitted by law.
              You should not rely on the service as the sole means of reaching
              emergency services or handling safety-critical communications.
            </p>
            <p className="m-0 mt-[10px] text-[14px] leading-[1.7] text-[var(--muted)]">
              To the extent permitted by law, Agently is not liable for indirect,
              incidental, special or consequential losses, lost profits, or
              losses caused by misuse, third-party systems or events outside our
              reasonable control. Nothing in these Terms excludes rights or
              liability that cannot legally be excluded.
            </p>
          </section>

          <section id="changes" className="scroll-mt-6">
            <h2
              style={{ fontFamily: '"Archivo", sans-serif' }}
              className="m-0 mb-[9px] text-[21px] font-semibold tracking-[-0.025em] text-[var(--text)]"
            >
              7. Changes and termination
            </h2>
            <p className="m-0 text-[14px] leading-[1.7] text-[var(--muted)]">
              We may update the service and these Terms as Agently evolves.
              Material changes will be communicated through the service or
              appropriate contact channel before they take effect where required.
              Continued use after the effective date means you accept the revised
              Terms. You may stop using the service at any time; amounts already
              charged remain subject to the billing terms above.
            </p>
          </section>

          <section id="contact" className="scroll-mt-6">
            <h2
              style={{ fontFamily: '"Archivo", sans-serif' }}
              className="m-0 mb-[9px] text-[21px] font-semibold tracking-[-0.025em] text-[var(--text)]"
            >
              8. Questions or concerns
            </h2>
            <p className="m-0 text-[14px] leading-[1.7] text-[var(--muted)]">
              For billing, privacy, legal or account questions, email{" "}
              <a
                href="mailto:agentlycallsupport@gmail.com"
                className="font-medium text-[var(--accent)] no-underline hover:underline hover:underline-offset-[3px]"
              >
                agentlycallsupport@gmail.com
              </a>
              . These Terms are governed by applicable law and do not limit
              mandatory consumer or data-protection rights that apply to you.
            </p>
          </section>
        </div>
      </div>
    </AuthShell>
  );
};

export default Terms;
