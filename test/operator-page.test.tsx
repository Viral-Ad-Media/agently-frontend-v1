import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Organization, User } from "../types";

const startCall = vi.fn();

vi.mock("../contexts/WebcallContext", () => ({
  useWebcall: () => ({ startCall, status: "idle" }),
}));

vi.mock("../services/api", () => ({
  api: {
    operatorWorkspace: vi.fn().mockResolvedValue({scope:{},calendars:[],senders:[]}),
    operatorChat: vi.fn(),
    confirmOperatorAction: vi.fn(),
    cancelOperatorAction: vi.fn(),
  },
}));

import Operator from "../pages/Operator";

const mimi = { id: "agent-mimi", name: "Mimi" };
const timi = { id: "agent-timi", name: "Timi" };
const org = {
  id: "org-1",
  profile: { name: "Nutra Wellness" },
  voiceAgents: [timi, mimi],
  agent: timi,
  activeVoiceAgentId: "agent-timi",
} as unknown as Organization;
const user = { id: "user-1", role: "Owner" } as unknown as User;

describe("Owner conversation", () => {
  beforeEach(() => {
    startCall.mockClear();
    window.localStorage.clear();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("starts an owner voice session for the selected business agent", () => {
    const agentChanged = vi.fn();
    window.addEventListener("agently:operator-agent-changed", agentChanged);
    render(
      <MemoryRouter initialEntries={["/operator"]}>
        <Operator org={org} user={user} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Choose business agent" }), {
      target: { value: mimi.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Talk to Mimi by voice" }));

    expect(startCall).toHaveBeenCalledOnce();
    expect(startCall).toHaveBeenCalledWith(mimi, org, "owner");
    expect(window.localStorage.getItem("agently:owner-operator-agent:org-1")).toBe(mimi.id);
    expect(agentChanged).toHaveBeenCalledOnce();
    window.removeEventListener("agently:operator-agent-changed", agentChanged);
  });
});
