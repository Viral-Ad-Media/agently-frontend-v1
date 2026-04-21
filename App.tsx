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
  Organization,
  User,
  WorkspaceBootstrap,
} from "./types";
import { api } from "./services/api";
import {
  clearSessionToken,
  getSessionToken,
  setSessionToken,
} from "./services/session";
import { AppLoading, MainLayout, PublicLayout } from "./components/Shell";
import { subscribeToOrgRealtime } from "./services/realtime";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const CallLogs = lazy(() => import("./pages/CallLogs"));
const Leads = lazy(() => import("./pages/Leads"));
const AgentSettings = lazy(() => import("./pages/AgentSettings"));
const PhoneNumbers = lazy(() => import("./pages/PhoneNumbers"));
const Billing = lazy(() => import("./pages/Billing"));
const Team = lazy(() => import("./pages/Team"));
const Login = lazy(() => import("./pages/Login"));
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
const CallSimulator = lazy(() => import("./components/CallSimulator"));

const App: React.FC = () => {
  const [workspace, setWorkspace] = useState<WorkspaceBootstrap | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showSimulator, setShowSimulator] = useState(false);

  const user = workspace?.user ?? null;
  const org = workspace?.organization ?? null;
  const calls = workspace?.calls ?? [];
  const leads = workspace?.leads ?? [];
  const conversation = workspace?.conversation ?? [];
  const dashboard = workspace?.dashboard ?? null;

  const applyWorkspace = (nextWorkspace: WorkspaceBootstrap) => {
    setWorkspace(nextWorkspace);
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

    let isMounted = true;

    const bootstrap = async () => {
      try {
        const nextWorkspace = await api.bootstrap();
        if (isMounted) {
          applyWorkspace(nextWorkspace);
        }
      } catch {
        clearSessionToken();
        if (isMounted) {
          setWorkspace(null);
        }
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    };

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  // FIX: debounce realtime so rapid DB writes don't cascade into reload loop
  const realtimeDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!org?.id) return;
    const unsubscribe = subscribeToOrgRealtime(org.id, {
      onAny: () => {
        if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = setTimeout(() => { void refreshWorkspace(); }, 1200);
      },
    });
    return () => { unsubscribe(); if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current); };
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
      setShowSimulator(false);
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

  const handleOnboardingComplete = async (
    profile: BusinessProfile,
    agent: AgentConfig,
  ) => {
    await api.completeOnboarding(profile, agent);
    await refreshWorkspace();
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

  // ==================== PATCHED FUNCTION ====================
  const handleImportChatbotFaqs = async (
    chatbotId: string,
    website: string,
  ) => {
    // Calls the new /api/chatbots/:id/import-website endpoint
    // which runs the full scrape → chunk → Supabase save → FAQ generation pipeline
    const response = await api.importChatbotWebsite(chatbotId, website);
    // The server returns { faqs, chunksStored, strategy, message }
    // Refresh workspace so the new FAQs appear in the UI
    await refreshWorkspace();
    return response;
  };
  // ==========================================================

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

  const handleSimulatorFinished = async (payload: {
    transcript: string;
    duration: number;
    outcome?: string;
    callerName?: string;
    callerPhone?: string;
    lead?: Partial<Lead>;
  }) => {
    await api.simulateCall(payload);
    await refreshWorkspace();
  };

  // FIX: no refreshWorkspace — Leads.tsx handles optimistically; realtime debounce syncs later
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
  ) => {
    await api.inviteMember(email, role);
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
    await api.updateSettings(settings);
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
      <MainLayout
        org={org}
        user={user}
        setShowSimulator={setShowSimulator}
        onLogout={() => void handleLogout()}
      >
        {children}
      </MainLayout>
    );
  };

  if (isInitializing) {
    return <AppLoading />;
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

          <Route
            path="/features"
            element={
              user && org ? (
                <ProtectedRoute>
                  <Features />
                </ProtectedRoute>
              ) : (
                <PublicLayout>
                  <Features />
                </PublicLayout>
              )
            }
          />
          <Route
            path="/dashboard"
            element={
              org && dashboard ? (
                <ProtectedRoute>
                  <Dashboard org={org} dashboard={dashboard} />
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
              <ProtectedRoute>
                <CallLogs
                  calls={calls}
                  onDownloadReport={handleDownloadCallReport}
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leads"
            element={
              <ProtectedRoute>
                <Leads
                  leads={leads}
                  onUpdateLead={handleUpdateLead}
                  onDeleteLead={handleDeleteLead}
                  onBulkDeleteLeads={handleBulkDeleteLeads}
                  onCreateLead={handleCreateLead}
                  onExport={handleExportLeads}
                />
              </ProtectedRoute>
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
                    onAgentUpdated={async (updates) => {
                      await api.updateVoiceAgent(org.activeVoiceAgentId, updates);
                      await refreshWorkspace();
                    }}
                  />
                </ProtectedRoute>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
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
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>

      {showSimulator && org && (
        <Suspense fallback={null}>
          <CallSimulator
            agent={org.agent}
            onClose={() => setShowSimulator(false)}
            onCallFinished={handleSimulatorFinished}
          />
        </Suspense>
      )}
    </Router>
  );
};

export default App;
