import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Organization, User, UserRole } from "../types";
import AppModal from "../components/AppModal";
import SettingsTabs from "../components/SettingsTabs";
import { NETWORK_OFFLINE_MESSAGE, api } from "../services/api";

interface TeamProps {
  org: Organization;
  /** The signed-in person. Only the Owner can manage the team. */
  currentUser?: User | null;
  onInvite: (
    email: string,
    role: Extract<UserRole, "Admin" | "Viewer">,
    name: string,
  ) => Promise<void>;
  onRemoveMember: (id: string) => Promise<void>;
}

type TeamMetrics = {
  total: number;
  owners: number;
  admins: number;
  viewers: number;
};

type InvitationInfo = {
  status: "pending" | "expired" | "accepted" | "revoked";
  sentAt?: string;
  expiresAt?: string;
};

type TeamMember = User & { invitation?: InvitationInfo | null };

type TeamResponse = {
  members?: TeamMember[];
  metrics?: TeamMetrics;
};

type TeamSession = Awaited<
  ReturnType<typeof api.listTeamSessions>
>["sessions"][number];

type InviteRole = Extract<UserRole, "Admin" | "Viewer">;

const ROLE_PERMISSIONS: Record<
  string,
  { label: string; can: string[]; cannot: string[] }
> = {
  Owner: {
    label: "Full Access",
    can: [
      "Everything",
      "Invite, remove and sign out members",
      "See and remove every signed-in device",
      "Billing, cards and workspace settings",
      "Delete the account",
    ],
    cannot: [],
  },
  Admin: {
    label: "Manager",
    can: [
      "View workspace data",
      "Manage agents, chatbots and knowledge",
      "Work leads, calls and outreach",
      "Change their own password",
    ],
    cannot: [
      "Invite or remove members",
      "Billing and cards",
      "Workspace settings",
      "Delete the account",
    ],
  },
  Viewer: {
    label: "Read Only",
    can: ["View dashboard, calls and leads", "Change their own password"],
    cannot: [
      "Edit anything in the workspace",
      "Invite or remove members",
      "Billing and settings",
      "Delete the account",
    ],
  },
};

const isNetworkMessage = (message: string) =>
  message.toLowerCase().includes("failed to fetch") ||
  message.toLowerCase().includes("network") ||
  message.toLowerCase().includes("offline");

const cleanError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  return isNetworkMessage(message) ? NETWORK_OFFLINE_MESSAGE : message;
};

const getInitialMetrics = (members: TeamMember[]): TeamMetrics => ({
  total: members.length,
  owners: members.filter((m) => m.role === "Owner").length,
  admins: members.filter((m) => m.role === "Admin").length,
  viewers: members.filter((m) => m.role === "Viewer").length,
});

/** "Chrome on Windows" from a user-agent string. */
const describeDevice = (userAgent: string) => {
  const ua = userAgent || "";
  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  else if (/okhttp|Expo|ReactNative|CFNetwork/i.test(ua)) browser = "Mobile app";

  let os = "";
  if (/iPhone|iPad/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";
  return os ? `${browser} on ${os}` : browser;
};

const invitationBadge = (invitation?: InvitationInfo | null) => {
  if (invitation?.status === "pending")
    return { text: "Invite pending", tone: "bg-amber-50 text-amber-700" };
  if (invitation?.status === "expired")
    return { text: "Invite expired", tone: "bg-red-50 text-red-600" };
  return null;
};

const canResend = (member: TeamMember) =>
  member.invitation?.status === "pending" ||
  member.invitation?.status === "expired";

const Team: React.FC<TeamProps> = ({
  org,
  currentUser,
  onInvite,
  onRemoveMember,
}) => {
  const isOwner = currentUser?.role === "Owner";
  const [members, setMembers] = useState<TeamMember[]>(org.members || []);
  const [metrics, setMetrics] = useState<TeamMetrics>(() =>
    getInitialMetrics(org.members || []),
  );
  const [sessions, setSessions] = useState<TeamSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [signOutTarget, setSignOutTarget] = useState<TeamMember | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("Viewer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const mountedRef = useRef(true);
  const loadRequestRef = useRef(0);

  const sortedMembers = useMemo(() => {
    const rank: Record<UserRole, number> = { Owner: 0, Admin: 1, Viewer: 2 };
    return [...members].sort(
      (a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name),
    );
  }, [members]);

  const loadMembers = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    if (mountedRef.current) {
      setLoading(true);
      setError("");
    }
    try {
      const response = (await api.getTeamMembers()) as TeamResponse;
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      const nextMembers = response.members || [];
      setMembers(nextMembers);
      setMetrics(response.metrics || getInitialMetrics(nextMembers));
    } catch (err) {
      if (!mountedRef.current || requestId !== loadRequestRef.current) return;
      setError(cleanError(err, "Unable to load team members."));
    } finally {
      if (mountedRef.current && requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const loadSessions = useCallback(async () => {
    if (!isOwner) return;
    setSessionsLoading(true);
    try {
      const response = await api.listTeamSessions();
      if (mountedRef.current) setSessions(response.sessions || []);
    } catch (err) {
      if (mountedRef.current)
        setError(cleanError(err, "Unable to load signed-in devices."));
    } finally {
      if (mountedRef.current) setSessionsLoading(false);
    }
  }, [isOwner]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadMembers(), loadSessions()]);
  }, [loadMembers, loadSessions]);

  useEffect(() => {
    mountedRef.current = true;
    setMembers(org.members || []);
    setMetrics(getInitialMetrics(org.members || []));
    void loadMembers();
    return () => {
      mountedRef.current = false;
      loadRequestRef.current += 1;
    };
  }, [loadMembers, org.id]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) {
      setError("Name and email are required.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await onInvite(inviteEmail.trim(), inviteRole, inviteName.trim());
      setSuccess(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
      setInviteName("");
      setShowInvite(false);
      await loadMembers();
    } catch (err) {
      setError(cleanError(err, "Unable to invite teammate."));
    } finally {
      setSaving(false);
    }
  };

  const resendInvite = async (member: TeamMember) => {
    if (member.role === "Owner") return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await onInvite(member.email, member.role as InviteRole, member.name);
      setSuccess(`A fresh invitation was sent to ${member.email}.`);
      await loadMembers();
    } catch (err) {
      setError(cleanError(err, "Unable to resend the invitation."));
    } finally {
      setSaving(false);
    }
  };

  const updateRole = async (memberId: string, role: InviteRole) => {
    setSaving(true);
    setError("");
    try {
      await api.updateTeamMemberRole(memberId, role);
      await loadMembers();
      setSuccess("Role updated.");
    } catch (err) {
      setError(cleanError(err, "Unable to update role."));
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setSaving(true);
    setError("");
    try {
      await onRemoveMember(removeTarget.id);
      setRemoveTarget(null);
      await refreshAll();
      setSuccess("Team member removed and signed out everywhere.");
    } catch (err) {
      setError(cleanError(err, "Unable to remove team member."));
      await refreshAll();
    } finally {
      setSaving(false);
    }
  };

  const confirmSignOutMember = async () => {
    if (!signOutTarget) return;
    setSaving(true);
    setError("");
    try {
      await api.signOutTeamMember(signOutTarget.id);
      setSuccess(`${signOutTarget.name} was signed out of every device.`);
      setSignOutTarget(null);
      await loadSessions();
    } catch (err) {
      setError(cleanError(err, "Unable to sign out this member."));
    } finally {
      setSaving(false);
    }
  };

  const revokeDevice = async (session: TeamSession) => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.revokeTeamSession(session.id);
      setSuccess(
        `Signed out ${describeDevice(session.userAgent)} for ${session.userName || session.userEmail}.`,
      );
      await loadSessions();
    } catch (err) {
      setError(cleanError(err, "Unable to sign out that device."));
    } finally {
      setSaving(false);
    }
  };

  const roleControl = (user: TeamMember, wide = false) => {
    if (user.role === "Owner") {
      return (
        <span className="inline-flex w-fit rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">
          Owner
        </span>
      );
    }
    if (!isOwner) {
      return (
        <span className="inline-flex w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
          {user.role}
        </span>
      );
    }
    return (
      <select
        value={user.role}
        disabled={saving}
        onChange={(e) => void updateRole(user.id, e.target.value as InviteRole)}
        className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 outline-none focus:border-amber-300 ${wide ? "w-full min-[420px]:w-auto" : ""}`}
      >
        <option value="Admin">Admin</option>
        <option value="Viewer">Viewer</option>
      </select>
    );
  };

  const memberActions = (user: TeamMember, wide = false) => {
    if (!isOwner || user.role === "Owner") return null;
    const btn = `rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 ${wide ? "w-full min-[420px]:w-auto" : ""}`;
    return (
      <div
        className={`flex gap-2 ${wide ? "flex-col min-[420px]:flex-row" : "justify-end"}`}
      >
        {canResend(user) && (
          <button
            type="button"
            onClick={() => void resendInvite(user)}
            disabled={saving}
            className={`${btn} border-slate-200 text-slate-600 hover:bg-slate-50`}
          >
            Resend invite
          </button>
        )}
        <button
          type="button"
          onClick={() => setSignOutTarget(user)}
          disabled={saving}
          className={`${btn} border-slate-200 text-slate-600 hover:bg-slate-50`}
          title="End every session this member has, on every device"
        >
          Sign out
        </button>
        <button
          type="button"
          onClick={() => setRemoveTarget(user)}
          disabled={saving}
          className={`${btn} border-red-100 text-red-500 hover:bg-red-50`}
        >
          Remove
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Team
          </h2>
          <p className="mt-2 hidden max-w-3xl text-sm leading-relaxed text-slate-500 sm:block">
            Manage workspace access and permissions.
          </p>
        </div>
        <div className="flex shrink-0 items-start justify-end gap-2">
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={loading}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10 sm:rounded-xl"
            aria-label="Refresh team members"
            title="Refresh"
          >
            <i
              className={`fa-sharp fa-solid ${loading ? "fa-spinner fa-spin" : "fa-rotate-right"} text-sm`}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={() => setShowPerms(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-slate-600 transition hover:border-amber-300 hover:text-amber-700 sm:h-10 sm:w-10 sm:rounded-xl"
            aria-label="View permissions"
            title="Permissions"
          >
            <i
              className="fa-sharp fa-solid fa-shield-halved text-sm"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={() => isOwner && setShowInvite(true)}
            disabled={!isOwner}
            /* Icon-only button: it has no text content, so the tour's
               text: matcher could never find it. */
            data-tour="team-invite"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:bg-slate-300 sm:h-10 sm:w-10 sm:rounded-xl"
            aria-label="Invite member"
            title={
              isOwner
                ? "Invite member"
                : "Only the account owner can invite members"
            }
          >
            <i
              className="fa-sharp fa-solid fa-user-plus text-sm"
              aria-hidden="true"
            />
          </button>
        </div>
      </header>

      <SettingsTabs active="team" />

      {!isOwner && (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <i
            className="fa-sharp fa-solid fa-lock mt-0.5 text-slate-400"
            aria-hidden="true"
          />
          <p>
            Only the account owner can invite, remove or sign out members and
            change their roles.
          </p>
        </div>
      )}

      {(error || success) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${error ? "border-red-100 bg-red-50 text-red-600" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}
        >
          {error || `✓ ${success}`}
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
        {[
          ["Total", metrics.total],
          ["Owners", metrics.owners],
          ["Admins", metrics.admins],
          ["Viewers", metrics.viewers],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="min-w-0 rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:rounded-3xl sm:p-4"
          >
            <p className="truncate text-[8px] font-black uppercase tracking-widest text-slate-400 sm:text-[10px]">
              {label}
            </p>
            <p className="text-base font-black text-slate-900 sm:text-2xl">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-3 md:hidden">
        {sortedMembers.map((user) => {
          const badge = invitationBadge(user.invitation);
          return (
            <div
              key={user.id}
              className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-black text-white">
                  {user.name?.[0]?.toUpperCase() || "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {user.name}
                    {user.id === currentUser?.id && (
                      <span className="ml-1.5 text-xs font-medium text-slate-400">
                        (you)
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {user.email}
                  </p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {ROLE_PERMISSIONS[user.role]?.label || user.role}
                  </p>
                  {badge && (
                    <span
                      className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.tone}`}
                    >
                      {badge.text}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                {roleControl(user, true)}
                {memberActions(user, true)}
              </div>
            </div>
          );
        })}
        {!sortedMembers.length && (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-400 shadow-sm">
            No team members found.
          </div>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-6 py-4">Member</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4 text-right">
                  {isOwner ? "Actions" : ""}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedMembers.map((user) => {
                const badge = invitationBadge(user.invitation);
                return (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-black text-white">
                          {user.name?.[0]?.toUpperCase() || "U"}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {user.name}
                            {user.id === currentUser?.id && (
                              <span className="ml-1.5 text-xs font-medium text-slate-400">
                                (you)
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {ROLE_PERMISSIONS[user.role]?.label || user.role}
                          </p>
                          {badge && (
                            <span
                              className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.tone}`}
                            >
                              {badge.text}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {user.email}
                    </td>
                    <td className="px-6 py-4">{roleControl(user)}</td>
                    <td className="px-6 py-4 text-right">
                      {memberActions(user)}
                    </td>
                  </tr>
                );
              })}
              {!sortedMembers.length && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-12 text-center text-sm text-slate-400"
                  >
                    No team members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isOwner && (
        <section
          className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
          aria-labelledby="team-devices-heading"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3
                id="team-devices-heading"
                className="text-base font-black text-slate-900"
              >
                Signed-in devices
              </h3>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Every device currently signed in to this workspace, for you and
                your team. Sign out any device you don't recognise.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadSessions()}
              disabled={sessionsLoading}
              className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {sessionsLoading ? "Loading…" : "Refresh"}
            </button>
          </div>

          <ul className="mt-4 divide-y divide-slate-100">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">
                    {session.userName || session.userEmail || "Unknown member"}
                    <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {session.userRole}
                    </span>
                    {session.current && (
                      <span className="ml-2 text-xs font-medium text-emerald-600">
                        This device
                      </span>
                    )}
                  </p>
                  <p
                    className="mt-1 truncate text-xs text-slate-500"
                    title={session.userAgent}
                  >
                    {describeDevice(session.userAgent)}
                    {session.client ? ` · ${session.client}` : ""}
                    {session.requestIp ? ` · ${session.requestIp}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Signed in {new Date(session.createdAt).toLocaleString()} ·
                    last active {new Date(session.lastSeenAt).toLocaleString()}
                  </p>
                </div>
                {!session.current && (
                  <button
                    type="button"
                    onClick={() => void revokeDevice(session)}
                    disabled={saving}
                    className="w-full shrink-0 rounded-xl border border-red-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 disabled:opacity-50 sm:w-auto"
                  >
                    Sign out device
                  </button>
                )}
              </li>
            ))}
            {!sessions.length && !sessionsLoading && (
              <li className="py-6 text-center text-sm text-slate-400">
                No active devices.
              </li>
            )}
          </ul>
        </section>
      )}

      <AppModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        title="Invite Team Member"
        description="They'll get an email link, choose their own password, and join with the role you pick."
        size="md"
        footer={
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowInvite(false)}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="invite-member-form"
              disabled={saving}
              className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {saving ? "Sending…" : "Send Invite"}
            </button>
          </div>
        }
      >
        <form
          id="invite-member-form"
          onSubmit={handleInvite}
          className="space-y-4"
        >
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">
              Full name
            </label>
            <input
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">
              Email address
            </label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="jane@company.com"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">
              Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as InviteRole)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300"
            >
              <option value="Viewer">Viewer — read only</option>
              <option value="Admin">Admin — can work in the app</option>
            </select>
            <p className="mt-2 text-xs text-slate-500">
              Neither role can touch billing, workspace settings, the team or
              account deletion. Those stay with you.
            </p>
          </div>
        </form>
      </AppModal>

      <AppModal
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        title="Remove team member?"
        description="Their access is revoked immediately."
        size="sm"
        footer={
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setRemoveTarget(null)}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmRemove()}
              disabled={saving}
              className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-500">
          {removeTarget?.name} will be signed out of every device and will no
          longer be able to access this workspace. Any unused invitation link
          stops working too.
        </p>
      </AppModal>

      <AppModal
        open={Boolean(signOutTarget)}
        onClose={() => setSignOutTarget(null)}
        title="Sign out everywhere?"
        description="Ends every session this member has."
        size="sm"
        footer={
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setSignOutTarget(null)}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-black text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmSignOutMember()}
              disabled={saving}
              className="flex-1 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:opacity-50"
            >
              Sign out
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-500">
          {signOutTarget?.name} will be signed out on every device. They stay a
          member and can sign in again with their password. To take away their
          access for good, use Remove.
        </p>
      </AppModal>

      <AppModal
        open={showPerms}
        onClose={() => setShowPerms(false)}
        title="Role permissions"
        description="How each workspace role behaves."
        size="lg"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(ROLE_PERMISSIONS).map(([role, details]) => (
            <div key={role} className="rounded-2xl border border-slate-200 p-4">
              <p className="font-black text-slate-900">{role}</p>
              <p className="text-xs font-bold text-slate-400">
                {details.label}
              </p>
              <div className="mt-4 space-y-3 text-xs text-slate-500">
                <div>
                  <p className="mb-1 font-black uppercase tracking-widest text-emerald-600">
                    Can
                  </p>
                  {details.can.map((item) => (
                    <p key={item}>• {item}</p>
                  ))}
                </div>
                {!!details.cannot.length && (
                  <div>
                    <p className="mb-1 font-black uppercase tracking-widest text-red-500">
                      Cannot
                    </p>
                    {details.cannot.map((item) => (
                      <p key={item}>• {item}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </AppModal>
    </div>
  );
};

export default Team;
