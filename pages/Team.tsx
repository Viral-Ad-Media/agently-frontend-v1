import React, { useEffect, useMemo, useState } from "react";
import { Organization, User, UserRole } from "../types";
import AppModal from "../components/AppModal";
import { NETWORK_OFFLINE_MESSAGE, api } from "../services/api";

interface TeamProps {
  org: Organization;
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

type TeamResponse = {
  members?: User[];
  metrics?: TeamMetrics;
};

const ROLE_PERMISSIONS: Record<
  string,
  { label: string; can: string[]; cannot: string[] }
> = {
  Owner: { label: "Full Access", can: ["Everything"], cannot: [] },
  Admin: {
    label: "Manager",
    can: [
      "View workspace data",
      "Manage agents and chatbots",
      "Manage FAQs",
      "Invite members",
    ],
    cannot: ["Delete organization", "Remove owner"],
  },
  Viewer: {
    label: "Read Only",
    can: ["View dashboard", "View call logs", "View leads"],
    cannot: ["Edit settings", "Invite members", "Change billing"],
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

const getInitialMetrics = (members: User[]): TeamMetrics => ({
  total: members.length,
  owners: members.filter((m) => m.role === "Owner").length,
  admins: members.filter((m) => m.role === "Admin").length,
  viewers: members.filter((m) => m.role === "Viewer").length,
});

const Team: React.FC<TeamProps> = ({ org, onInvite, onRemoveMember }) => {
  const [members, setMembers] = useState<User[]>(org.members || []);
  const [metrics, setMetrics] = useState<TeamMetrics>(() =>
    getInitialMetrics(org.members || []),
  );
  const [loading, setLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<User | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] =
    useState<Extract<UserRole, "Admin" | "Viewer">>("Viewer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const sortedMembers = useMemo(() => {
    const rank: Record<UserRole, number> = { Owner: 0, Admin: 1, Viewer: 2 };
    return [...members].sort(
      (a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name),
    );
  }, [members]);

  const loadMembers = async () => {
    setLoading(true);
    setError("");
    try {
      const response = (await api.getTeamMembers()) as TeamResponse;
      const nextMembers = response.members || [];
      setMembers(nextMembers);
      setMetrics(response.metrics || getInitialMetrics(nextMembers));
    } catch (err) {
      setError(cleanError(err, "Unable to load team members."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMembers(org.members || []);
    setMetrics(getInitialMetrics(org.members || []));
    void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.id]);

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

  const updateRole = async (
    memberId: string,
    role: Extract<UserRole, "Admin" | "Viewer">,
  ) => {
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
      await loadMembers();
      setSuccess("Team member removed.");
    } catch (err) {
      setError(cleanError(err, "Unable to remove team member."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Team Management</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Manage workspace access and permissions.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-3 sm:w-auto sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={loadMembers}
            disabled={loading}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setShowPerms(true)}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-slate-300"
          >
            Permissions
          </button>
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-600"
          >
            Invite Member
          </button>
        </div>
      </div>

      {(error || success) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${error ? "border-red-100 bg-red-50 text-red-600" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}
        >
          {error || `✓ ${success}`}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {[
          ["Total", metrics.total],
          ["Owners", metrics.owners],
          ["Admins", metrics.admins],
          ["Viewers", metrics.viewers],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {label}
            </p>
            <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3 md:hidden">
        {sortedMembers.map((user) => (
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
                </p>
                <p className="truncate text-xs text-slate-500">{user.email}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {ROLE_PERMISSIONS[user.role]?.label || user.role}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
              {user.role === "Owner" ? (
                <span className="inline-flex w-fit rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">
                  Owner
                </span>
              ) : (
                <select
                  value={user.role}
                  disabled={saving}
                  onChange={(e) =>
                    void updateRole(
                      user.id,
                      e.target.value as Extract<UserRole, "Admin" | "Viewer">,
                    )
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 outline-none focus:border-amber-300 min-[420px]:w-auto"
                >
                  <option value="Admin">Admin</option>
                  <option value="Viewer">Viewer</option>
                </select>
              )}
              {user.role !== "Owner" && (
                <button
                  type="button"
                  onClick={() => setRemoveTarget(user)}
                  disabled={saving}
                  className="w-full rounded-xl border border-red-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 disabled:opacity-50 min-[420px]:w-auto"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
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
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedMembers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-black text-white">
                        {user.name?.[0]?.toUpperCase() || "U"}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {user.name}
                        </p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {ROLE_PERMISSIONS[user.role]?.label || user.role}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {user.email}
                  </td>
                  <td className="px-6 py-4">
                    {user.role === "Owner" ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">
                        Owner
                      </span>
                    ) : (
                      <select
                        value={user.role}
                        disabled={saving}
                        onChange={(e) =>
                          void updateRole(
                            user.id,
                            e.target.value as Extract<
                              UserRole,
                              "Admin" | "Viewer"
                            >,
                          )
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 outline-none focus:border-amber-300"
                      >
                        <option value="Admin">Admin</option>
                        <option value="Viewer">Viewer</option>
                      </select>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {user.role !== "Owner" && (
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(user)}
                        disabled={saving}
                        className="rounded-xl border border-red-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
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

      <AppModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        title="Invite Team Member"
        description="Send workspace access to a teammate."
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
              onChange={(e) =>
                setInviteRole(
                  e.target.value as Extract<UserRole, "Admin" | "Viewer">,
                )
              }
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-300"
            >
              <option value="Viewer">Viewer</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
        </form>
      </AppModal>

      <AppModal
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        title="Remove team member?"
        description="This will remove their workspace access."
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
          {removeTarget?.name} will no longer be able to access this workspace.
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
