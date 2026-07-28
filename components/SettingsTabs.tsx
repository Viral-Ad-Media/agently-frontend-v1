import React from "react";
import { Link } from "react-router-dom";

type SettingsTabKey = "profile" | "knowledge" | "team" | "billing";

interface SettingsTabsProps {
  active: SettingsTabKey;
}

const settingsTabs: Array<{
  key: SettingsTabKey;
  label: string;
  href: string;
  icon: string;
}> = [
  {
    key: "profile",
    label: "Profile",
    href: "/settings",
    icon: "fa-user-gear",
  },
  {
    key: "knowledge",
    label: "Knowledge Base",
    href: "/knowledge-bases",
    icon: "fa-layer-group",
  },
  {
    key: "team",
    label: "Team",
    href: "/team",
    icon: "fa-users",
  },
  {
    key: "billing",
    label: "Billing",
    href: "/billing",
    icon: "fa-credit-card",
  },
];

const SettingsTabs: React.FC<SettingsTabsProps> = ({ active }) => {
  return (
    <nav
      className="flex gap-5 overflow-x-auto border-b border-slate-200 py-4"
      aria-label="Settings sections"
    >
      {settingsTabs.map((tab) => {
        const isActive = tab.key === active;
        const tabClasses = isActive
          ? "border-slate-900 text-slate-900"
          : "border-transparent text-slate-500 hover:border-amber-400 hover:text-amber-700";

        return (
          <Link
            key={tab.key}
            to={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-1 pb-2 text-sm font-black transition ${tabClasses}`}
          >
            <i className={`fa-sharp fa-solid ${tab.icon} text-xs`} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
};

export default SettingsTabs;
