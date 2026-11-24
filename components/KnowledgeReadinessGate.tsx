import React from "react";
import { useNavigate } from "react-router-dom";
import AppModal from "./AppModal";
import type { KnowledgeBase } from "../types";

/*
 * Signup reads only the homepage. An agent launched straight away therefore
 * knows almost nothing about the business, and a tenant who starts calling or
 * pastes the chatbot on their site at that point gets a vague assistant. This
 * gate checks how much the assigned knowledge base actually holds and, when it
 * is thin, asks the tenant to add more first. It never blocks: "Continue
 * anyway" proceeds, and "Don't remind me for this one" stops it reappearing for
 * that agent/chatbot on this browser.
 */

export interface KnowledgeReadiness {
  thin: boolean;
  noKnowledgeBase: boolean;
  websitePages: number;
  otherSources: number;
}

const WEBSITE_TYPES = new Set(["website", "onboarding", "url"]);

export function assessKnowledgeReadiness(
  kb: KnowledgeBase | null | undefined,
  faqCount = 0,
): KnowledgeReadiness {
  if (!kb) {
    return { thin: faqCount < 3, noKnowledgeBase: true, websitePages: 0, otherSources: 0 };
  }
  const sources = Array.isArray(kb.sources) ? kb.sources : [];
  const websitePages = sources
    .filter((s) => WEBSITE_TYPES.has(String(s.sourceType || "website")))
    .reduce((sum, s) => sum + (Number(s.pageCount) || 0), 0);
  const otherSources = sources.filter(
    (s) =>
      !WEBSITE_TYPES.has(String(s.sourceType || "website")) &&
      ((Number(s.chunkCount) || 0) > 0 || (Number(s.pageCount) || 0) > 0 ||
        String(s.scrapeStatus || "").toLowerCase() === "completed"),
  ).length;
  return {
    thin: websitePages <= 1 && otherSources === 0 && faqCount < 3,
    noKnowledgeBase: false,
    websitePages,
    otherSources,
  };
}

const DISMISS_PREFIX = "agently-kb-readiness-dismissed:";

export function isReadinessDismissed(scopeId: string): boolean {
  try {
    return window.localStorage.getItem(DISMISS_PREFIX + scopeId) === "1";
  } catch {
    return false;
  }
}

function dismissReadiness(scopeId: string) {
  try {
    window.localStorage.setItem(DISMISS_PREFIX + scopeId, "1");
  } catch {
    /* the choice applies for this visit only */
  }
}

interface GateProps {
  open: boolean;
  /** agent or chatbot id, used for "don't remind me" */
  scopeId: string;
  /** "calling" for voice agents, "deploying" for the chatbot */
  action: "calling" | "deploying";
  readiness: KnowledgeReadiness;
  onClose: () => void;
  onContinue: () => void;
}

const KnowledgeReadinessGate: React.FC<GateProps> = ({
  open,
  scopeId,
  action,
  readiness,
  onClose,
  onContinue,
}) => {
  const navigate = useNavigate();
  const subject = action === "calling" ? "agent" : "chatbot";
  const verb = action === "calling" ? "start calling" : "go live on your site";

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      size="md"
      title={`Teach your ${subject} about your business first`}
      description={
        readiness.noKnowledgeBase
          ? `This ${subject} has no knowledge base yet, so it can only guess when people ask about your services, prices or hours.`
          : `So far your ${subject} has read ${readiness.websitePages || "no"} page${readiness.websitePages === 1 ? "" : "s"} of your website (sign-up only reads the homepage). Before you ${verb}, give it more to work from so it doesn't answer vaguely.`
      }
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="text-left text-xs font-medium text-[#5a5b61] underline-offset-2 hover:text-[#101216] hover:underline"
            onClick={() => {
              dismissReadiness(scopeId);
              onClose();
              onContinue();
            }}
          >
            Don't remind me for this {subject}
          </button>
          <button
            type="button"
            className="ag-action-btn ag-action-btn--secondary"
            onClick={() => {
              onClose();
              onContinue();
            }}
          >
            Continue anyway
          </button>
        </div>
      }
    >
      <ol className="space-y-3 text-sm text-[#101216]">
        <li className="flex gap-3">
          <span className="ag-section-icon ag-section-icon--orange" aria-hidden="true">
            <i className="fa-solid fa-globe" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">Discover and read more of your website</p>
            <p className="mt-0.5 text-xs leading-5 text-[#5a5b61]">
              Run page discovery, then pick your services, pricing, FAQ and contact pages.
            </p>
            <button
              type="button"
              className="ag-action-btn ag-action-btn--primary mt-2"
              onClick={() => go("/knowledge-bases")}
            >
              Run page discovery
            </button>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="ag-section-icon ag-section-icon--ink" aria-hidden="true">
            <i className="fa-solid fa-file-arrow-up" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">Or add files and FAQs</p>
            <p className="mt-0.5 text-xs leading-5 text-[#5a5b61]">
              Price lists, brochures, policies or a few common questions and answers.
            </p>
            <button
              type="button"
              className="ag-action-btn ag-action-btn--secondary mt-2"
              onClick={() => go("/knowledge-bases")}
            >
              Add to knowledge base
            </button>
          </div>
        </li>
      </ol>
    </AppModal>
  );
};

export default KnowledgeReadinessGate;
