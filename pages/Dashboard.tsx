import React, { useState } from "react";
import { DashboardData, Organization, AgentConfig } from "../types";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const PIE_COLORS = ["#10b981", "#6366f1", "#3b82f6", "#f59e0b", "#94a3b8"];

interface AgentStats {
  agentId: string;
  agentName: string;
  totalCalls: number;
  leadsCaptured: number;
  missedCalls: number;
  avgDurationMinutes: number;
  weeklyFlow: { name: string; calls: number; leads: number }[];
  outcomeBreakdown: { label: string; count: number; color: string }[];
}

interface DashboardProps {
  org: Organization;
  dashboard: DashboardData;
  agentStats?: AgentStats[]; // added to WorkspaceBootstrap type
}

const StatCard: React.FC<{
  label: string;
  value: string;
  icon: string;
  accent: string;
  sub?: string;
}> = ({ label, value, icon, accent, sub }) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
    <div
      className={`absolute top-0 right-0 w-20 h-20 rounded-bl-full -mr-6 -mt-6 transition-transform group-hover:scale-125 ${accent}`}
    />
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">
      {label}
    </p>
    <div className="flex items-end justify-between relative z-10">
      <h3 className="text-3xl font-black text-slate-900 tracking-tighter">
        {value}
      </h3>
      <i className={`fa-sharp fa-solid ${icon} text-slate-300 text-xl`} />
    </div>
    {sub && (
      <p className="text-[10px] text-slate-400 mt-1 relative z-10">{sub}</p>
    )}
  </div>
);

const Dashboard: React.FC<DashboardProps> = ({
  org,
  dashboard,
  agentStats = [],
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState(
    org.activeVoiceAgentId || agentStats[0]?.agentId || "",
  );

  const currentStats =
    agentStats.find((s) => s.agentId === selectedAgentId) || agentStats[0];
  const avgLabel = currentStats
    ? `${currentStats.avgDurationMinutes.toFixed(1)}m`
    : "0m";

  return (
    <div className="space-y-7 animate-fade-up">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          label="Total Calls"
          value={String(currentStats?.totalCalls || 0)}
          icon="fa-phone-volume"
          accent="bg-indigo-50"
          sub="This period"
        />
        <StatCard
          label="Leads Captured"
          value={String(currentStats?.leadsCaptured || 0)}
          icon="fa-users"
          accent="bg-emerald-50"
          sub="From calls"
        />
        <StatCard
          label="Missed / Escalated"
          value={String(currentStats?.missedCalls || 0)}
          icon="fa-phone-slash"
          accent="bg-rose-50"
          sub="Voicemail + escalated"
        />
        <StatCard
          label="Avg Duration"
          value={avgLabel}
          icon="fa-stopwatch"
          accent="bg-amber-50"
          sub="Per call"
        />
      </div>

      {/* Usage bar (global) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Plan Usage — {org.subscription.plan}
          </p>
          <span className="text-xs font-black text-slate-600">
            {dashboard.usage.minutes} / {dashboard.usage.minuteLimit} min
          </span>
        </div>
        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-1000"
            style={{
              width: `${Math.min(100, (dashboard.usage.minutes / Math.max(dashboard.usage.minuteLimit, 1)) * 100)}%`,
            }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-slate-400">
          <span>{dashboard.usage.calls} calls used</span>
          <span>
            {dashboard.usage.callLimit - dashboard.usage.calls} calls remaining
          </span>
        </div>
      </div>

      {/* Agent Selector & Performance */}
      {agentStats.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h3 className="text-base font-black text-slate-900">
              Agent Performance
            </h3>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl flex-wrap">
              {agentStats.map((agent) => (
                <button
                  key={agent.agentId}
                  onClick={() => setSelectedAgentId(agent.agentId)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                    selectedAgentId === agent.agentId
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {agent.agentName}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-50 rounded-2xl p-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Agent Name
              </p>
              <p className="text-sm font-black text-slate-900">
                {currentStats?.agentName || "—"}
              </p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Direction
              </p>
              <p className="text-sm font-black text-slate-900 capitalize">
                {org.voiceAgents.find((a) => a.id === selectedAgentId)
                  ?.direction || "—"}
              </p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Phone Number
              </p>
              <p className="text-sm font-black text-slate-900">
                {org.voiceAgents.find((a) => a.id === selectedAgentId)
                  ?.twilioPhoneNumber || "Not assigned"}
              </p>
            </div>
          </div>
          {currentStats && (
            <>
              <div className="h-64 mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={currentStats.weeklyFlow}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#f1f5f9"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "none",
                        boxShadow: "0 10px 40px rgba(0,0,0,.1)",
                        fontSize: "12px",
                      }}
                    />
                    <Bar
                      dataKey="calls"
                      name="Calls"
                      fill="#6366f1"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      dataKey="leads"
                      name="Leads"
                      fill="#10b981"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={currentStats.outcomeBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="count"
                      nameKey="label"
                    >
                      {currentStats.outcomeBreakdown.map((_, i) => (
                        <Cell
                          key={i}
                          fill={PIE_COLORS[i % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: "10px",
                        border: "none",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
