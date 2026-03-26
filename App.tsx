import React, { Suspense, lazy, useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AgentConfig, BusinessProfile, ChatMessage, ChatbotConfig, Lead, Organization, User, WorkspaceBootstrap } from './types';
import { ICONS } from './constants';
import { api } from './services/api';
import { clearSessionToken, getSessionToken, setSessionToken } from './services/session';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const CallLogs = lazy(() => import('./pages/CallLogs'));
const Leads = lazy(() => import('./pages/Leads'));
const AgentSettings = lazy(() => import('./pages/AgentSettings'));
const Billing = lazy(() => import('./pages/Billing'));
const Team = lazy(() => import('./pages/Team'));
const Login = lazy(() => import('./pages/Login'));
const Messenger = lazy(() => import('./pages/Messenger'));
const Features = lazy(() => import('./pages/Features'));
const Home = lazy(() => import('./pages/Home'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const FAQs = lazy(() => import('./pages/FAQs'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Settings = lazy(() => import('./pages/Settings'));
const CallSimulator = lazy(() => import('./components/CallSimulator'));

type SidebarIcon = React.ComponentType<Record<string, never>>;

const getUsagePercent = (minutes: number, minuteLimit: number) => {
  if (minuteLimit <= 0) {
    return 0;
  }

  return Math.min(100, (minutes / minuteLimit) * 100);
};

const AppLoading: React.FC = () => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
    <div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-4 border border-slate-200 shadow-sm">
      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      <span className="text-sm font-bold text-slate-600">Loading Agently...</span>
    </div>
  </div>
);

const SidebarLink: React.FC<{ to: string; icon: SidebarIcon; label: string }> = ({ to, icon: Icon, label }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <Icon />
      <span className="font-semibold text-sm">{label}</span>
    </Link>
  );
};

interface MainLayoutProps {
  children: React.ReactNode;
  org: Organization;
  user: User;
  setShowSimulator: (show: boolean) => void;
  onLogout: () => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, org, user, setShowSimulator, onLogout }) => {
  const usagePercent = getUsagePercent(org.subscription.usage.minutes, org.subscription.usage.minuteLimit);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col fixed inset-y-0 left-0 z-30">
        <div className="flex items-center gap-3 mb-10 px-2">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
              <ICONS.Robot />
            </div>
            <h1 className="text-xl font-black bg-gradient-to-br from-indigo-900 to-indigo-600 bg-clip-text text-transparent">
              Agently
            </h1>
          </Link>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarLink to="/dashboard" icon={ICONS.Dashboard} label="Dashboard" />
          <SidebarLink to="/agent" icon={ICONS.Robot} label="Voice Agent" />
          <SidebarLink to="/messenger" icon={ICONS.MessageSquare} label="Chatbot Agent" />
          <SidebarLink to="/calls" icon={ICONS.Phone} label="Call Logs" />
          <SidebarLink to="/leads" icon={ICONS.Users} label="Lead CRM" />
          <SidebarLink to="/team" icon={ICONS.Shield} label="Team" />
          <SidebarLink to="/billing" icon={ICONS.CreditCard} label="Billing" />
          <SidebarLink to="/settings" icon={ICONS.Settings} label="Settings" />
        </nav>

        <div className="pt-6 border-t border-slate-100 space-y-4">
          <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
            <div className="flex justify-between items-center mb-2">
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Plan: {org.subscription.plan}</p>
              <Link to="/billing" className="text-[10px] font-bold text-indigo-600 hover:underline">Upgrade</Link>
            </div>
            <div className="w-full bg-indigo-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${usagePercent}%` }}></div>
            </div>
          </div>

          <button
            onClick={() => setShowSimulator(true)}
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black hover:bg-slate-800 transition-all shadow-xl active:scale-95 text-xs uppercase tracking-widest"
          >
            Test Agent {org.agent.name}
          </button>

          <button
            onClick={onLogout}
            className="w-full text-slate-400 hover:text-red-500 py-2 text-xs font-bold transition-colors flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-64 p-10 max-w-7xl mx-auto w-full">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-xs font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">{org.profile.name}</h2>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Management Suite</h1>
          </div>
          <div className="flex items-center gap-4 bg-white p-2 pr-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black shadow-lg shadow-indigo-100">
              {user.name.charAt(0) || 'A'}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">{user.name}</p>
              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{user.role}</p>
            </div>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
};

const PublicLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-white flex flex-col">
    <header className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md z-50 border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
            <ICONS.Robot />
          </div>
          <span className="text-xl font-black text-slate-900 tracking-tight">Agently</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          <Link to="/features" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Features</Link>
          <Link to="/pricing" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Pricing</Link>
          <Link to="/about" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">About</Link>
          <Link to="/faqs" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">FAQs</Link>
          <Link to="/contact" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Contact</Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-sm font-bold text-slate-900 hover:text-indigo-600 transition-colors">Sign In</Link>
          <Link to="/login" className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
            Get Started
          </Link>
        </div>
      </div>
    </header>
    <main className="flex-1">{children}</main>
    <footer className="bg-slate-900 text-white py-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
          <div className="col-span-1 md:col-span-1">
            <Link to="/" className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
                <ICONS.Robot />
              </div>
              <span className="text-xl font-black text-white tracking-tight">Agently</span>
            </Link>
            <p className="text-slate-400 text-sm font-medium leading-relaxed">
              The AI-powered receptionist for modern service businesses.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest mb-6 text-indigo-400">Product</h4>
            <ul className="space-y-4">
              <li><Link to="/features" className="text-slate-400 hover:text-white transition-colors text-sm font-medium">Features</Link></li>
              <li><Link to="/pricing" className="text-slate-400 hover:text-white transition-colors text-sm font-medium">Pricing</Link></li>
              <li><Link to="/login" className="text-slate-400 hover:text-white transition-colors text-sm font-medium">Messenger</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest mb-6 text-indigo-400">Company</h4>
            <ul className="space-y-4">
              <li><Link to="/about" className="text-slate-400 hover:text-white transition-colors text-sm font-medium">About Us</Link></li>
              <li><Link to="/contact" className="text-slate-400 hover:text-white transition-colors text-sm font-medium">Contact</Link></li>
              <li><Link to="/faqs" className="text-slate-400 hover:text-white transition-colors text-sm font-medium">FAQs</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest mb-6 text-indigo-400">Legal</h4>
            <ul className="space-y-4">
              <li><Link to="/privacy" className="text-slate-400 hover:text-white transition-colors text-sm font-medium">Privacy Policy</Link></li>
              <li><Link to="/terms" className="text-slate-400 hover:text-white transition-colors text-sm font-medium">Terms of Service</Link></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-500 text-xs font-medium">© 2024 Agently AI. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="text-slate-500 hover:text-white transition-colors"><ICONS.Dashboard /></a>
            <a href="#" className="text-slate-500 hover:text-white transition-colors"><ICONS.Users /></a>
          </div>
        </div>
      </div>
    </footer>
  </div>
);

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

  const handleLogin = async (email: string, password: string) => {
    const response = await api.login(email, password);
    setSessionToken(response.token);
    await loadWorkspace();
  };

  const handleRegister = async (payload: { name: string; companyName: string; email: string; password: string }) => {
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
      throw new Error('Workspace is not ready yet.');
    }

    return { workspace, org };
  };

  const handleGenerateFaqs = async (website: string) => {
    return api.generateOnboardingFaqs(website);
  };

  const handleOnboardingComplete = async (profile: BusinessProfile, agent: AgentConfig) => {
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

  const handleUpdateRules = async (ruleUpdates: Partial<AgentConfig['rules']>) => {
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
    await api.createFaq('New FAQ question', 'Add the answer your agent should use.');
    await refreshWorkspace();
  };

  const handleUpdateFaq = async (faqId: string, updates: { question?: string; answer?: string }) => {
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

  const handleImportChatbotFaqs = async (chatbotId: string, website: string) => {
    const faqs = await api.generateOnboardingFaqs(website);
    await api.updateChatbot(chatbotId, { faqs });
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

  const handleUpdateChatbot = async (chatbotId: string, updates: Partial<ChatbotConfig>) => {
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

  const handleSendMessage = async (message: string, chatbotId?: string): Promise<ChatMessage> => {
    const response = await api.sendMessengerMessage(message, chatbotId);
    setWorkspace((currentWorkspace) => currentWorkspace ? { ...currentWorkspace, conversation: response.conversation } : currentWorkspace);
    return response.assistantMessage;
  };

  const handleResetConversation = async (chatbotId?: string) => {
    const response = await api.resetMessenger(chatbotId);
    setWorkspace((currentWorkspace) => currentWorkspace ? { ...currentWorkspace, conversation: response.conversation } : currentWorkspace);
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

  const handleUpdateLead = async (leadId: string, updates: Partial<Lead>) => {
    await api.updateLead(leadId, updates);
    await refreshWorkspace();
  };

  const handleCreateLead = async (payload: Pick<Lead, 'name' | 'email' | 'phone' | 'reason'>) => {
    await api.createLead(payload);
    await refreshWorkspace();
  };

  const handleExportLeads = async () => {
    await api.exportLeadsCsv();
  };

  const handleInviteMember = async (email: string, role: 'Admin' | 'Viewer') => {
    await api.inviteMember(email, role);
    await refreshWorkspace();
  };

  const handleRemoveMember = async (memberId: string) => {
    await api.removeMember(memberId);
    await refreshWorkspace();
  };

  const handleUpdatePlan = async (plan: 'Starter' | 'Pro') => {
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
    window.alert('Sales inquiry sent successfully.');
  };

  const handleDownloadCallReport = async (callId: string) => {
    await api.downloadCallReport(callId);
  };

  const handleSaveSettings = async (settings: {
    timezone: string;
    phoneNumber: string;
    twilio?: {
      accountSid?: string;
      authToken?: string;
      validateRequests?: boolean;
      clearCredentials?: boolean;
    };
  }) => {
    await api.updateSettings(settings);
    await refreshWorkspace();
  };

  const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
      return <Onboarding onGenerateFaqs={handleGenerateFaqs} onComplete={handleOnboardingComplete} />;
    }

    return (
      <MainLayout org={org} user={user} setShowSimulator={setShowSimulator} onLogout={() => void handleLogout()}>
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
          <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
          <Route path="/about" element={<PublicLayout><About /></PublicLayout>} />
          <Route path="/contact" element={<PublicLayout><Contact /></PublicLayout>} />
          <Route path="/faqs" element={<PublicLayout><FAQs /></PublicLayout>} />
          <Route path="/pricing" element={<PublicLayout><Pricing /></PublicLayout>} />
          <Route path="/terms" element={<PublicLayout><Terms /></PublicLayout>} />
          <Route path="/privacy" element={<PublicLayout><Privacy /></PublicLayout>} />
          <Route
            path="/login"
            element={user ? <Navigate to="/dashboard" /> : (
              <Login
                onLogin={handleLogin}
                onRegister={handleRegister}
                onSendMagicLink={handleSendMagicLink}
                onVerifyMagicLink={handleVerifyMagicLink}
              />
            )}
          />

          <Route
            path="/features"
            element={user && org ? <ProtectedRoute><Features /></ProtectedRoute> : <PublicLayout><Features /></PublicLayout>}
          />
          <Route path="/dashboard" element={org && dashboard ? <ProtectedRoute><Dashboard org={org} dashboard={dashboard} /></ProtectedRoute> : <Navigate to="/login" />} />
          <Route
            path="/agent"
            element={org ? (
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
            ) : <Navigate to="/login" />}
          />
          <Route
            path="/messenger"
            element={org ? (
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
            ) : <Navigate to="/login" />}
          />
          <Route
            path="/calls"
            element={(
              <ProtectedRoute>
                <CallLogs calls={calls} onDownloadReport={handleDownloadCallReport} />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/leads"
            element={(
              <ProtectedRoute>
                <Leads
                  leads={leads}
                  onUpdateLead={handleUpdateLead}
                  onCreateLead={handleCreateLead}
                  onExport={handleExportLeads}
                />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/team"
            element={org ? (
              <ProtectedRoute>
                <Team org={org} onInvite={handleInviteMember} onRemoveMember={handleRemoveMember} />
              </ProtectedRoute>
            ) : <Navigate to="/login" />}
          />
          <Route
            path="/billing"
            element={org ? (
              <ProtectedRoute>
                <Billing
                  org={org}
                  onUpdatePlan={handleUpdatePlan}
                  onCancelPlan={handleCancelPlan}
                  onDownloadInvoice={handleDownloadInvoice}
                  onContactSales={handleContactSales}
                />
              </ProtectedRoute>
            ) : <Navigate to="/login" />}
          />
          <Route
            path="/settings"
            element={org ? (
              <ProtectedRoute>
                <Settings org={org} onSave={handleSaveSettings} />
              </ProtectedRoute>
            ) : <Navigate to="/login" />}
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
