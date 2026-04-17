import React, { useState } from "react";
import { Organization, User, UserRole } from "../types";

interface TeamProps {
  org: Organization;
  onInvite: (
    email: string,
    role: Extract<UserRole, "Admin" | "Viewer">,
    name: string,
  ) => Promise<void>;
  onRemoveMember: (id: string) => Promise<void>;
}

const ROLE_PERMISSIONS: Record<
  string,
  { label: string; can: string[]; cannot: string[] }
> = {
  Owner: {
    label: "Full Access",
    can: ["Everything"],
    cannot: [],
  },
  Admin: {
    label: "Manager",
    can: [
      "View all data",
      "Manage agents & chatbots",
      "Manage FAQs",
      "Invite members",
    ],
    cannot: ["Delete organization", "Change billing plan", "Remove owner"],
  },
  Viewer: {
    label: "Read-Only",
    can: ["View dashboard", "View call logs", "View leads"],
    cannot: ["Edit anything", "Invite members", "Access settings"],
  },
};

const Team: React.FC<TeamProps> = ({ org, onInvite, onRemoveMember }) => {
  const [showInvite, setShowInvite] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] =
    useState<Extract<UserRole, "Admin" | "Viewer">>("Viewer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteName) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onInvite(inviteEmail, inviteRole, inviteName);
      setSuccess(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteName("");
      setTimeout(() => {
        setSuccess("");
        setShowInvite(false);
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to invite teammate.",
      );
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (id: string) => {
    setSaving(true);
    setError("");
    try {
      await onRemoveMember(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">Team Management</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage who has access to this workspace.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPerms(true)}
            className="rounded-xl border border-slate-200 text-slate-500 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest hover:border-slate-300 transition-all flex items-center gap-1.5"
          >
            <i className="fa-sharp fa-solid fa-shield-halved text-xs" />
            Permissions
          </button>
          <button
            onClick={() => setShowInvite(true)}
            className="rounded-xl bg-slate-900 text-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all flex items-center gap-1.5"
          >
            <i className="fa-sharp fa-solid fa-user-plus text-xs" />
            Invite Member
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-600">
          ✓ {success}
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-widest font-black">
            <tr>
              <th className="px-6 py-4">Member</th>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {org.members.map((user) => (
              <tr
                key={user.id}
                className="hover:bg-slate-50 transition-colors group"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-sm">
                      {user.name[0]?.toUpperCase()}
                    </div>
                    <p className="font-bold text-slate-900 text-sm">
                      {user.name}
                    </p>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">
                  {user.email}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      user.role === "Owner"
                        ? "bg-amber-100 text-amber-700"
                        : user.role === "Admin"
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  {user.role !== "Owner" && (
                    <button
                      onClick={() => void removeMember(user.id)}
                      className="text-slate-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <i className="fa-sharp fa-solid fa-trash text-sm" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Invite Modal (fixed overlay) ── */}
      {showInvite && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowInvite(false);
          }}
        >
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 animate-in zoom-in fade-in">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  Invite Team Member
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Send a magic link to grant workspace access
                </p>
              </div>
              <button
                onClick={() => setShowInvite(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-all"
              >
                <i className="fa-sharp fa-solid fa-xmark text-base" />
              </button>
            </div>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Jane Smith"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-400 outline-none text-sm font-medium"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="jane@company.com"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-400 outline-none text-sm font-medium"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                  Role
                </label>
                <select
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-400 outline-none text-sm font-medium"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                >
                  <option value="Admin">
                    Admin — can manage agents and data
                  </option>
                  <option value="Viewer">Viewer — read-only access</option>
                </select>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 text-xs text-slate-500">
                <p className="font-black text-slate-700 mb-1">
                  What happens next
                </p>
                An email will be sent to{" "}
                <strong>{inviteEmail || "the invitee"}</strong> with a magic
                sign-in link granting <strong>{inviteRole}</strong> access to
                this workspace.
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-black text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-sm font-black hover:bg-amber-600 disabled:opacity-50 transition-all"
                >
                  {saving ? "Sending…" : "Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Permissions Modal (fixed overlay) ── */}
      {showPerms && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPerms(false);
          }}
        >
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 animate-in zoom-in fade-in">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  Role Permissions
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  What each role can and cannot do
                </p>
              </div>
              <button
                onClick={() => setShowPerms(false)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-all"
              >
                <i className="fa-sharp fa-solid fa-xmark text-base" />
              </button>
            </div>
            <div className="space-y-4">
              {Object.entries(ROLE_PERMISSIONS).map(([role, info]) => (
                <div
                  key={role}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        role === "Owner"
                          ? "bg-amber-100 text-amber-700"
                          : role === "Admin"
                            ? "bg-slate-900 text-white"
                            : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {role}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      {info.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      {info.can.map((c) => (
                        <p
                          key={c}
                          className="text-emerald-600 flex items-center gap-1.5 mb-1"
                        >
                          <i className="fa-sharp fa-solid fa-check text-[10px]" />
                          {c}
                        </p>
                      ))}
                    </div>
                    <div>
                      {info.cannot.map((c) => (
                        <p
                          key={c}
                          className="text-slate-400 flex items-center gap-1.5 mb-1"
                        >
                          <i className="fa-sharp fa-solid fa-xmark text-[10px]" />
                          {c}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Team;
