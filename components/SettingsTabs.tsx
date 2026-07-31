import React from "react";
import { Link } from "react-router-dom";

type SettingsTabKey = "profile" | "knowledge" | "team" | "billing";

interface SettingsTabsProps {
  active: SettingsTabKey;
}

const settingsTabs: Array<{
  key: SettingsTabKey;
  label: string;
  mobileLabel: string;
  href: string;
  icon: string;
}> = [
  {
    key: "profile",
    label: "Profile",
    mobileLabel: "Profile",
    href: "/settings",
    icon: "fa-user-gear",
  },
  {
    key: "knowledge",
    label: "Knowledge Base",
    mobileLabel: "Knowledge",
    href: "/knowledge-bases",
    icon: "fa-layer-group",
  },
  {
    key: "team",
    label: "Team",
    mobileLabel: "Team",
    href: "/team",
    icon: "fa-users",
  },
  {
    key: "billing",
    label: "Billing",
    mobileLabel: "Billing",
    href: "/billing",
    icon: "fa-credit-card",
  },
];

const SettingsTabs: React.FC<SettingsTabsProps> = ({ active }) => {
  return (
    <nav
      className="grid w-full min-w-0 grid-cols-4 gap-1 border-b border-slate-200 py-3 sm:flex sm:gap-5 sm:py-4"
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
            className={`inline-flex min-w-0 flex-col items-center justify-center gap-1 border-b-2 px-1 pb-2 text-[10px] font-black transition sm:shrink-0 sm:flex-row sm:gap-2 sm:text-sm ${tabClasses}`}
          >
            <i className={`fa-sharp fa-solid ${tab.icon} text-xs`} />
            <span className="truncate sm:hidden">{tab.mobileLabel}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};

export default SettingsTabs;
