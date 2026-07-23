import React, { Suspense, lazy, useEffect, useState } from "react";
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import {
  AgentConfig,
  BusinessProfile,
  ChatMessage,
  ChatbotConfig,
  Lead,
  WorkspaceBootstrap,
} from "./types";
import { api, ApiError } from "./services/api";
import {
  clearSessionToken,
  getSessionToken,
  isSessionTokenExpired,
  setSessionToken,
} from "./services/session";
import { AppLoading, MainLayout, PublicLayout } from "./components/Shell";
// THE TOUR. It was written last round but never imported by anything, which is
// why onboarding a test user produced no walkthrough at all.
import { ProductTour, useProductTour, usePageTour } from "./lib/productTour";
import { subscribeToOrgRealtime } from "./services/realtime";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Leads = lazy(() => import("./pages/Leads"));
const AgentSettings = lazy(() => import("./pages/AgentSettings"));
const PhoneNumbers = lazy(() => import("./pages/PhoneNumbers"));
const OutreachScheduler = lazy(() => import("./pages/OutreachScheduler"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Billing = lazy(() => import("./pages/Billing"));
const Team = lazy(() => import("./pages/Team"));
const Login = lazy(() => import("./pages/Login"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Messenger = lazy(() => import("./pages/Messenger"));
const Features = lazy(() => import("./pages/Features"));
const Home = lazy(() => import("./pages/Home"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const FAQs = lazy(() => import("./pages/FAQs"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Settings = lazy(() => import("./pages/Settings"));
const KnowledgeBases = lazy(() => import("./pages/KnowledgeBases"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));

function hasPasswordResetTokenInUrl() {
  if (typeof window === "undefined") return false;
  const href = window.location.href || "";
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  return (
    /(?:[?&#]|%3F|%26)(resetToken|token)=/i.test(href) ||
    /(?:[?&])(resetToken|token)=/i.test(search) ||
    /(?:[?&])(resetToken|token)=/i.test(hash)
  );
}

const App: React.FC = () => {
  const [workspace, setWorkspace] = useState<WorkspaceBootstrap | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [startupError, setStartupError] = useState("");
  const [creditAlert, setCreditAlert] = useState<{
    message: string;
    balanceUsd?: number;
    minimumRequiredUsd?: number;
    action?: string;
    topUpPath?: string;
  } | null>(null);

  const user = workspace?.user ?? null;
  const org = workspace?.organization ?? null;
  const calls = workspace?.calls ?? [];
  const leads = workspace?.leads ?? [];
  const conversation = workspace?.conversation ?? [];
  const dashboard = workspace?.dashboard ?? null;
  const knowledgeBases = workspace?.knowledgeBases ?? [];

  useEffect(() => {
    if (typeof window === "undefined") return;

    const readTokenFromUrl = () => {
      const candidates: string[] = [];
      candidates.push(window.location.search || "");
      candidates.push(
        window.location.hash.includes("?")
          ? window.location.hash.slice(window.location.hash.indexOf("?"))
          : "",
      );

      for (const candidate of candidates) {
        const params = new URLSearchParams(candidate);
        const token = params.get("resetToken") || params.get("token");
        if (token) return token.trim().replace(/[\s.]+$/g, "");
      }
      return "";
    };

    const resetToken = readTokenFromUrl();
    const isAlreadyResetRoute =
      window.location.hash.startsWith("#/forgot-password") ||
      window.location.hash.startsWith("#/reset-password");
    if (!resetToken || isAlreadyResetRoute) return;

    const nextUrl = `${window.location.origin}${window.location.pathname}#/forgot-password?resetToken=${encodeURIComponent(resetToken)}`;
    // Use replace() instead of history.replaceState so HashRouter reliably re-hydrates
    // into the reset route even when the email client opened /?resetToken=... first.
    window.location.replace(nextUrl);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      setCreditAlert({
        message:
          detail.message || "Usage credit is required before you can continue.",
        balanceUsd: Number(detail.balanceUsd || 0),
        minimumRequiredUsd: Number(detail.minimumRequiredUsd || 0),
        action: detail.action || "usage",
        topUpPath: detail.topUpPath || "#/billing",
      });
    };
    window.addEventListener(
      "agently:billing-credit-required",
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        "agently:billing-credit-required",
        handler as EventListener,
      );
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => {
      clearSessionToken();
      setWorkspace(null);
      setStartupError("");
    };
    window.addEventListener("agently:auth-expired", handleAuthExpired);
    return () =>
      window.removeEventListener("agently:auth-expired", handleAuthExpired);
  }, []);

  const applyWorkspace = (nextWorkspace: WorkspaceBootstrap) => {
    setWorkspace(nextWorkspace);
    setStartupError("");
  };

  const loadWorkspace = async () => {
    const nextWorkspace = await api.bootstrap();
    applyWorkspace(nextWorkspace);
    return nextWorkspace;
  };

  useEffect(() => {
    const token = getSessionToken();
    if (!token) {
      setIsInitializing(false);
      return;
    }

    if (isSessionTokenExpired(token)) {
      clearSessionToken();
      setWorkspace(null);
      setIsInitializing(false);
      return;
    }

    let isMounted = true;

    const bootstrap = async () => {
      try {
        const nextWorkspace = await api.bootstrap();
        if (isMounted) applyWorkspace(nextWorkspace);
      } catch (error) {
        const isInvalidSession =
          error instanceof ApiError && error.status === 401;
        if (isInvalidSession || isSessionTokenExpired(token)) {
          clearSessionToken();
          if (isMounted) {
            setWorkspace(null);
            setStartupError("");
          }
        } else if (isMounted) {
          setStartupError(
            error instanceof Error
              ? error.message
              : "Agently could not load your workspace. Your login is still valid.",
          );
        }
      } finally {
        if (isMounted) setIsInitializing(false);
      }
    };

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  const realtimeDebounceRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  useEffect(() => {
    if (!org?.id) return;
    const unsubscribe = subscribeToOrgRealtime(org.id, {
      onWallet: (balanceUsd) => {
        window.dispatchEvent(
          new CustomEvent("agently:wallet-refresh", {
            detail: Number.isFinite(Number(balanceUsd))
              ? { organizationId: org.id, balanceUsd: Number(balanceUsd) }
              : { organizationId: org.id },
          }),
        );
      },
      onAny: () => {
        if (realtimeDebounceRef.current)
          clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = setTimeout(() => {
          if (typeof document !== "undefined" && document.hidden) return;
          void refreshWorkspace().catch((error) => {
            if (!(error instanceof ApiError) || error.status !== 401) {
              console.warn(
                "[workspace] realtime refresh skipped:",
                error instanceof Error ? error.message : error,
              );
            }
          });
        }, 3000);
      },
    });
    return () => {
      unsubscribe();
      if (realtimeDebounceRef.current)
        clearTimeout(realtimeDebounceRef.current);
    };
  }, [org?.id]);

  const handleLogin = async (email: string, password: string) => {
    const response = await api.login(email, password);
    setSessionToken(response.token);
    await loadWorkspace();
  };

  const handleRegister = async (payload: {
    name: string;
    companyName: string;
    email: string;
    password: string;
  }) => {
    const response = await api.register(payload);
    setSessionToken(response.token);
    await loadWorkspace();
  };

  const handleSendMagicLink = async (email: string) => {
    return api.sendMagicLink(email);
  };

  const handleVerifyMagicLink = async (token: string) => {
    const response = await api.verifyMagicLink(token);
    setSessionToken(response.token);
    await loadWorkspace();
  };

  const handleLogout = async () => {
    try {
      if (getSessionToken()) {
        await api.logout();
      }
    } catch {
      // Best effort logout when remote session invalidation fails.
    } finally {
      clearSessionToken();
      setWorkspace(null);
    }
  };

  const retryWorkspaceInitialization = async () => {
    setIsInitializing(true);
    try {
      await loadWorkspace();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSessionToken();
        setWorkspace(null);
        setStartupError("");
      } else {
        setStartupError(
          error instanceof Error
            ? error.message
            : "Agently could not load your workspace. Your login is still valid.",
        );
      }
    } finally {
      setIsInitializing(false);
    }
  };

  const refreshWorkspace = async () => {
    await loadWorkspace();
  };

  const requireWorkspace = () => {
    if (!workspace || !org) {
      throw new Error("Workspace is not ready yet.");
    }
    return { workspace, org };
  };

  const handleGenerateFaqs = async (website: string) => {
    return api.generateOnboardingFaqs(website);
  };

  const [justOnboarded, setJustOnboarded] = useState(false);
  const tour = useProductTour({
    justOnboarded,
    enabled: !!org?.profile?.onboarded,
  });
  // ISSUE 2 — per-page walkthroughs. Fires the first time each page is opened,
  // after the one-time overview has been seen or skipped.
  const pageTour = usePageTour(
    typeof window !== "undefined"
      ? window.location.hash.replace(/^#/, "").split("?")[0] || "/"
      : "/",
  );

  const handleOnboardingComplete = async (
    profile: BusinessProfile,
    agent: AgentConfig,
  ) => {
    await api.completeOnboarding(profile, agent);

    // Marks the next dashboard render as "first ever". useProductTour reads
    // this to start the walkthrough at the moment you described.
    setJustOnboarded(true);

    // Move the user out of onboarding immediately after the API confirms
    // completion. The follow-up bootstrap refresh will load the full saved
    // agent/chatbot/KB state, but this optimistic update prevents a short-lived
    // cached org row from rendering step 1 again.
    setWorkspace((currentWorkspace) => {
      if (!currentWorkspace) return currentWorkspace;
      return {
        ...currentWorkspace,
        organization: {
          ...currentWorkspace.organization,
          profile: {
            ...currentWorkspace.organization.profile,
            ...profile,
            onboarded: true,
          },
        },
      };
    });

    try {
      await refreshWorkspace();
    } catch (error) {
      console.warn(
        "[onboarding] workspace refresh after completion failed:",
        error instanceof Error ? error.message : error,
      );
    }
  };

  const handleUpdateAgent = async (updates: Partial<AgentConfig>) => {
    await api.updateAgent(updates);
    await refreshWorkspace();
  };

  const handleCreateVoiceAgent = async (payload?: Partial<AgentConfig>) => {
    await api.createVoiceAgent(payload);
    await refreshWorkspace();
  };

  const handleActivateVoiceAgent = async (voiceAgentId: string) => {
    await api.activateVoiceAgent(voiceAgentId);
    await refreshWorkspace();
  };

  const handleDeleteVoiceAgent = async (voiceAgentId: string) => {
    await api.deleteVoiceAgent(voiceAgentId);
    await refreshWorkspace();
  };

  const handleAssignVoiceAgentKnowledgeBase = async (
    knowledgeBaseId: string,
    voiceAgentId: string,
  ) => {
    await api.assignVoiceAgentKnowledgeBase(knowledgeBaseId, voiceAgentId);
    await refreshWorkspace();
  };

  const handleAssignChatbotKnowledgeBase = async (
    knowledgeBaseId: string,
    chatbotId: string,
  ) => {
    await api.assignChatbotKnowledgeBase(knowledgeBaseId, chatbotId);
    await refreshWorkspace();
  };

  const handleUpdateRules = async (
    ruleUpdates: Partial<AgentConfig["rules"]>,
  ) => {
    const { org: currentOrg } = requireWorkspace();
    await api.updateAgent({
      rules: {
        ...currentOrg.agent.rules,
        ...ruleUpdates,
      },
    });
    await refreshWorkspace();
  };

  const handleAddFaq = async () => {
    await api.createFaq(
      "New FAQ question",
      "Add the answer your agent should use.",
    );
    await refreshWorkspace();
  };

  const handleUpdateFaq = async (
    faqId: string,
    updates: { question?: string; answer?: string },
  ) => {
    await api.updateFaq(faqId, updates);
    await refreshWorkspace();
  };

  const handleRemoveFaq = async (faqId: string) => {
    await api.removeFaq(faqId);
    await refreshWorkspace();
  };

  const handleSyncFaqs = async (website?: string) => {
    const { org: currentOrg } = requireWorkspace();
    await api.syncFaqs(website || currentOrg.profile.website);
    await refreshWorkspace();
  };

  const handleImportChatbotFaqs = async (
    chatbotId: string,
    website: string,
  ): Promise<void> => {
    await api.importChatbotWebsite(chatbotId, website);
    await refreshWorkspace();
  };

  const handleRestartAgent = async () => {
    const response = await api.restartAgent();
    window.alert(response.message);
  };

  const handleCreateChatbot = async () => {
    await api.createChatbot();
    await refreshWorkspace();
  };

  const handleUpdateChatbot = async (
    chatbotId: string,
    updates: Partial<ChatbotConfig>,
  ) => {
    await api.updateChatbot(chatbotId, updates);
    await refreshWorkspace();
  };

  const handleActivateChatbot = async (chatbotId: string) => {
    await api.activateChatbot(chatbotId);
    await refreshWorkspace();
  };

  const handleDeleteChatbot = async (chatbotId: string) => {
    await api.deleteChatbot(chatbotId);
    await refreshWorkspace();
  };

  const handleSendMessage = async (
    message: string,
    chatbotId?: string,
  ): Promise<ChatMessage> => {
    const response = await api.sendMessengerMessage(message, chatbotId);
    setWorkspace((currentWorkspace) =>
      currentWorkspace
        ? { ...currentWorkspace, conversation: response.conversation }
        : currentWorkspace,
    );
    return response.assistantMessage;
  };

  const handleResetConversation = async (chatbotId?: string) => {
    const response = await api.resetMessenger(chatbotId);
    setWorkspace((currentWorkspace) =>
      currentWorkspace
        ? { ...currentWorkspace, conversation: response.conversation }
        : currentWorkspace,
    );
  };

  const handleUpdateLead = async (leadId: string, updates: Partial<Lead>) => {
    await api.updateLead(leadId, updates);
  };

  const handleCreateLead = async (
    payload: Pick<Lead, "name" | "email" | "phone" | "reason">,
  ) => {
    await api.createLead(payload);
    await refreshWorkspace();
  };

  const handleExportLeads = async () => {
    await api.exportLeadsCsv();
  };

  const handleDeleteLead = async (leadId: string) => {
    await (api as any).deleteLead(leadId);
    await refreshWorkspace();
  };

  const handleBulkDeleteLeads = async (leadIds: string[]) => {
    await (api as any).bulkDeleteLeads(leadIds);
    await refreshWorkspace();
  };

  const handleInviteMember = async (
    email: string,
    role: "Admin" | "Viewer",
    name: string,
  ) => {
    await api.inviteMember(email, role, name);
    await refreshWorkspace();
  };

  const handleRemoveMember = async (memberId: string) => {
    await api.removeMember(memberId);
    await refreshWorkspace();
  };

  const handleUpdatePlan = async (plan: "Starter" | "Pro") => {
    await api.updatePlan(plan);
    await refreshWorkspace();
  };

  const handleCancelPlan = async () => {
    await api.cancelPlan();
    await refreshWorkspace();
  };

  const handleDownloadInvoice = async (invoiceId: string) => {
    await api.downloadInvoice(invoiceId);
  };

  const handleContactSales = async () => {
    const { workspace: currentWorkspace } = requireWorkspace();
    await api.submitContactSales({
      name: currentWorkspace.user.name,
      email: currentWorkspace.user.email,
      companyName: currentWorkspace.organization.profile.name,
      expectedVolume: `${currentWorkspace.organization.subscription.usage.calls} monthly calls`,
      message: `Interested in a custom SaaS plan for ${currentWorkspace.organization.profile.name}.`,
    });
    window.alert("Sales inquiry sent successfully.");
  };

  const handleDownloadCallReport = async (callId: string) => {
    await api.downloadCallReport(callId);
  };

  const handleSaveSettings = async (settings: {
    timezone: string;
    phoneNumber: string;
  }) => {
    const saved = await api.updateSettings(settings);
    setWorkspace((currentWorkspace) => {
      if (!currentWorkspace) return currentWorkspace;
      return {
        ...currentWorkspace,
        organization: {
          ...currentWorkspace.organization,
          settings: {
            ...currentWorkspace.organization.settings,
            ...saved,
          },
          profile: {
            ...currentWorkspace.organization.profile,
            timezone:
              saved.timezone || currentWorkspace.organization.profile.timezone,
          },
          phoneNumber:
            saved.phoneNumber ?? currentWorkspace.organization.phoneNumber,
        },
      };
    });
    await refreshWorkspace();
  };

  const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
    children,
  }) => {
    if (isInitializing) {
      return <AppLoading />;
    }

    if (!user) {
      return <Navigate to="/login" />;
    }

    if (!org) {
      return <AppLoading />;
    }

    if (!org.profile.onboarded) {
      return (
        <Onboarding
          onGenerateFaqs={handleGenerateFaqs}
          onComplete={handleOnboardingComplete}
        />
      );
    }

    return (
      <MainLayout org={org} user={user} onLogout={() => void handleLogout()}>
        {children}
      </MainLayout>
    );
  };

  if (isInitializing) {
    return <AppLoading />;
  }

  if (getSessionToken() && !workspace && startupError) {
    return (
      <div className="min-h-screen bg-slate-100 px-6 py-12 flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <i className="fa-sharp fa-solid fa-cloud-exclamation" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Workspace temporarily unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {startupError}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Agently has kept your login session. Retrying will not sign you out
            or remove any data.
          </p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => void retryWorkspaceInitialization()}
              className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Suspense fallback={<AppLoading />}>
        <Routes>
          <Route
            path="/"
            element={
              <PublicLayout>
                <Home />
              </PublicLayout>
            }
          />
          <Route path="/admin" element={<SuperAdmin />} />
          <Route
            path="/blog"
            element={
              <PublicLayout>
                <Blog />
              </PublicLayout>
            }
          />
          <Route
            path="/blog/:slug"
            element={
              <PublicLayout>
                <BlogPost />
              </PublicLayout>
            }
          />
          <Route
            path="/about"
            element={
              <PublicLayout>
                <About />
              </PublicLayout>
            }
          />
          <Route
            path="/contact"
            element={
              <PublicLayout>
                <Contact />
              </PublicLayout>
            }
          />
          <Route
            path="/faqs"
            element={
              <PublicLayout>
                <FAQs />
              </PublicLayout>
            }
          />
          <Route
            path="/pricing"
            element={
              <PublicLayout>
                <Pricing />
              </PublicLayout>
            }
          />
          <Route
            path="/terms"
            element={
              <PublicLayout>
                <Terms />
              </PublicLayout>
            }
          />
          <Route
            path="/privacy"
            element={
              <PublicLayout>
                <Privacy />
              </PublicLayout>
            }
          />
          <Route
            path="/login"
            element={
              user ? (
                <Navigate to="/dashboard" />
              ) : (
                <Login
                  onLogin={handleLogin}
                  onRegister={handleRegister}
                  onSendMagicLink={handleSendMagicLink}
                  onVerifyMagicLink={handleVerifyMagicLink}
                />
              )
            }
          />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ForgotPassword />} />
          <Route
            path="/features"
            element={
              <PublicLayout>
                <Features />
              </PublicLayout>
            }
          />
          <Route
            path="/dashboard"
            element={
              org && dashboard ? (
                <ProtectedRoute>
                  <Dashboard org={org} dashboard={dashboard} />
                  <ProductTour open={tour.open} onClose={tour.close} />
                  <ProductTour
                    steps={pageTour.steps}
                    open={pageTour.open}
                    onClose={pageTour.close}
                  />
                </ProtectedRoute>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/agent"
            element={
              org ? (
                <ProtectedRoute>
                  <AgentSettings
                    org={org}
                    onUpdateAgent={handleUpdateAgent}
                    onCreateVoiceAgent={handleCreateVoiceAgent}
                    onActivateVoiceAgent={handleActivateVoiceAgent}
                    onDeleteVoiceAgent={handleDeleteVoiceAgent}
                    knowledgeBases={knowledgeBases}
                    onAssignKnowledgeBase={handleAssignVoiceAgentKnowledgeBase}
                    onUpdateRules={handleUpdateRules}
                    onAddFaq={handleAddFaq}
                    onUpdateFaq={handleUpdateFaq}
                    onRemoveFaq={handleRemoveFaq}
                    onSyncFaqs={handleSyncFaqs}
                    onRestartAgent={handleRestartAgent}
                  />
                </ProtectedRoute>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/messenger"
            element={
              org ? (
                <ProtectedRoute>
                  <Messenger
                    org={org}
                    messages={conversation}
                    onSendMessage={handleSendMessage}
                    onResetConversation={handleResetConversation}
                    onCreateChatbot={handleCreateChatbot}
                    onUpdateChatbot={handleUpdateChatbot}
                    onImportChatbotFaqs={handleImportChatbotFaqs}
                    onActivateChatbot={handleActivateChatbot}
                    onDeleteChatbot={handleDeleteChatbot}
                    knowledgeBases={knowledgeBases}
                    onAssignKnowledgeBase={handleAssignChatbotKnowledgeBase}
                  />
                </ProtectedRoute>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/calls"
            element={
              org ? (
                <ProtectedRoute>
                  <PhoneNumbers
                    org={org}
                    calls={calls}
                    onDownloadReport={handleDownloadCallReport}
                    onAgentUpdated={() => void refreshWorkspace()}
                    initialTab="calls"
                  />
                </ProtectedRoute>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/outreach"
            element={
              org ? (
                <ProtectedRoute>
                  <OutreachScheduler
                    org={org}
                    leads={leads}
                    onChanged={() => void refreshWorkspace()}
                  />
                </ProtectedRoute>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/notifications"
            element={
              org ? (
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/leads"
            element={
              org ? (
                <ProtectedRoute>
                  <Leads
                    leads={leads}
                    org={org}
                    onRefresh={refreshWorkspace}
                    onUpdateLead={handleUpdateLead}
                    onDeleteLead={handleDeleteLead}
                    onBulkDeleteLeads={handleBulkDeleteLeads}
                    onCreateLead={handleCreateLead}
                    onExport={handleExportLeads}
                  />
                </ProtectedRoute>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/team"
            element={
              org ? (
                <ProtectedRoute>
                  <Team
                    org={org}
                    onInvite={handleInviteMember}
                    onRemoveMember={handleRemoveMember}
                  />
                </ProtectedRoute>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/billing"
            element={
              org ? (
                <ProtectedRoute>
                  <Billing
                    org={org}
                    onUpdatePlan={handleUpdatePlan}
                    onCancelPlan={handleCancelPlan}
                    onDownloadInvoice={handleDownloadInvoice}
                    onContactSales={handleContactSales}
                  />
                </ProtectedRoute>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/phone-numbers"
            element={
              org ? (
                <ProtectedRoute>
                  <PhoneNumbers
                    org={org}
                    calls={calls}
                    onDownloadReport={handleDownloadCallReport}
                    onAgentUpdated={() => void refreshWorkspace()}
                  />
                </ProtectedRoute>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          {[
            "/knowledge-bases",
            "/knowledge-base",
            "/knowledgebases",
            "/knowledgebase",
            "/business-knowledge-bases",
            "/business-knowledge-base",
            "/businessknowledgebases",
            "/businessknowledgebase",
          ].map((path) => (
            <Route
              key={path}
              path={path}
              element={
                org ? (
                  <ProtectedRoute>
                    <KnowledgeBases
                      org={org}
                      initialKnowledgeBases={knowledgeBases}
                      onChanged={() => void refreshWorkspace()}
                    />
                  </ProtectedRoute>
                ) : (
                  <Navigate to="/login" />
                )
              }
            />
          ))}
          <Route
            path="/settings"
            element={
              org ? (
                <ProtectedRoute>
                  <Settings org={org} onSave={handleSaveSettings} />
                </ProtectedRoute>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="*"
            element={
              hasPasswordResetTokenInUrl() ? (
                <ForgotPassword />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
        </Routes>
      </Suspense>

      {creditAlert && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#232f3e]/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-[#ff5527]/20 bg-[#fffaf1] shadow-[0_30px_90px_rgba(35,47,62,0.28)]">
            <div className="border-b border-[#232f3e]/10 bg-white/70 px-6 py-5">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#ff5527]">
                Usage credit required
              </p>
              <h3 className="mt-2 text-2xl font-medium tracking-[-0.045em] text-[#232f3e]">
                Top up your wallet to continue
              </h3>
            </div>
            <div className="space-y-4 px-6 py-5 text-[#232f3e]">
              <p className="text-sm leading-6 text-[#232f3e]/70">
                {creditAlert.message}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-[#232f3e]/8">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#232f3e]/40">
                    Balance
                  </p>
                  <p className="mt-1 text-xl font-black">
                    ${Number(creditAlert.balanceUsd || 0).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-[#232f3e]/8">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#232f3e]/40">
                    Required
                  </p>
                  <p className="mt-1 text-xl font-black">
                    ${Number(creditAlert.minimumRequiredUsd || 0).toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <a
                  href={creditAlert.topUpPath || "#/billing"}
                  onClick={() => setCreditAlert(null)}
                  className="flex-1 rounded-2xl bg-[#ff5527] px-4 py-3 text-center text-sm font-black text-white shadow-[0_16px_36px_rgba(255,85,39,0.24)]"
                >
                  Go to billing
                </a>
                <button
                  type="button"
                  onClick={() => setCreditAlert(null)}
                  className="rounded-2xl border border-[#232f3e]/12 bg-white px-4 py-3 text-sm font-black text-[#232f3e]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Router>
  );
};

export default App;
