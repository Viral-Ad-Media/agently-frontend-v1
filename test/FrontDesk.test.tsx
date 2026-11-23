import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

const m = vi.hoisted(() => ({
  getFrontDeskKpis: vi.fn(),
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  replyToConversation: vi.fn(),
  setConversationStatus: vi.fn(),
  deleteConversation: vi.fn(),
  listQuotes: vi.fn(),
  approveQuote: vi.fn(),
  voidQuote: vi.fn(),
  updateQuoteLines: vi.fn(),
  getFrontDeskSettings: vi.fn(),
  saveFrontDeskSettings: vi.fn(),
}));
vi.mock("../services/api", () => ({ api: m }));

import FrontDesk from "../pages/FrontDesk";
import RegionOverlay from "../components/RegionOverlay";

const conversation = {
  id: "c1",
  chatbotId: "b1",
  leadId: "l1",
  leadName: "Pat Doe",
  leadEmail: "pat@example.com",
  leadPhone: null,
  status: "ai",
  unread: 2,
  lastMessageAt: new Date().toISOString(),
  lastPreview: "My roof is leaking",
  temporary: false,
  expiresAt: null,
  visitorLive: false,
  createdAt: new Date().toISOString(),
};
const quote = {
  id: "q1",
  leadId: "l1",
  leadName: "Pat Doe",
  leadEmail: "pat@example.com",
  mediaId: "m1",
  status: "pending_approval",
  lines: [{ code: "SHINGLE", description: "Replace shingles", qty: 2, unit: "sq", unitPriceCents: 45000, totalCents: 90000 }],
  subtotalCents: 90000,
  lowCents: 81000,
  highCents: 108000,
  currency: "USD",
  summary: "Missing shingles near the ridge",
  sentTo: null,
  sentAt: null,
  acceptedAt: null,
  createdAt: new Date().toISOString(),
};

describe("FrontDesk", () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset());
    m.getFrontDeskKpis.mockResolvedValue({ conversationsUnread: 2, photosReceived: 5, quotesSent: 3, quotesPendingApproval: 1, medianSecondsToQuote: 42, bookedRate: 0.5 });
    m.listConversations.mockResolvedValue({ conversations: [conversation] });
    m.getConversation.mockResolvedValue({
      conversation,
      messages: [
        { id: "1", role: "visitor", body: "My roof is leaking", mediaId: null, createdAt: new Date().toISOString() },
        { id: "2", role: "assistant", body: "Sorry to hear that!", mediaId: null, createdAt: new Date().toISOString() },
      ],
      media: {},
    });
    m.listQuotes.mockResolvedValue({ quotes: [quote] });
  });

  it("shows the inbox and lets the owner reply, explaining how the reply is delivered", async () => {
    m.replyToConversation.mockResolvedValue({ message: {}, status: "human", delivery: "email" });
    render(<FrontDesk />);
    fireEvent.click(await screen.findByText("Pat Doe"));
    expect(await screen.findByText("Sorry to hear that!")).toBeTruthy();
    expect(screen.getByText("Not on the site")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reply to customer"), { target: { value: "We can come tomorrow." } });
    fireEvent.click(screen.getByText("Send"));
    await waitFor(() => expect(m.replyToConversation).toHaveBeenCalledWith("c1", "We can come tomorrow."));
    expect(await screen.findByText(/emailed with a link back to the chat/)).toBeTruthy();
  });

  it("lists a quote waiting for approval and approves it", async () => {
    m.approveQuote.mockResolvedValue({ quote: { ...quote, status: "sent" } });
    render(<FrontDesk />);
    fireEvent.click(await screen.findByRole("tab", { name: /Quotes/ }));
    expect(await screen.findByText("Needs your approval")).toBeTruthy();
    expect(screen.getByText("$810 to $1,080")).toBeTruthy();
    fireEvent.click(screen.getByText("Approve & email"));
    await waitFor(() => expect(m.approveQuote).toHaveBeenCalledWith("q1"));
    expect(m.updateQuoteLines).not.toHaveBeenCalled();
  });

  it("saves the price list in cents with the approval limit", async () => {
    const settings = { quotesEnabled: false, autoSendLimitCents: 0, currency: "USD", rangeLowPct: 90, rangeHighPct: 120, priceSheet: [], conversationsEnabled: true };
    m.getFrontDeskSettings.mockResolvedValue({ settings });
    m.saveFrontDeskSettings.mockImplementation(async (p) => ({ settings: { ...settings, ...p } }));
    render(<FrontDesk />);
    fireEvent.click(await screen.findByRole("tab", { name: "Price list" }));
    fireEvent.click(await screen.findByText("Add item"));
    fireEvent.change(screen.getByLabelText("Item name"), { target: { value: "Replace shingles" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "450.50" } });
    fireEvent.change(screen.getByLabelText("Auto-send limit"), { target: { value: "500" } });
    fireEvent.click(screen.getByText("Save price list"));
    await waitFor(() => expect(m.saveFrontDeskSettings).toHaveBeenCalled());
    const sent = m.saveFrontDeskSettings.mock.calls[0][0];
    expect(sent.priceSheet).toEqual([{ code: "", label: "Replace shingles", unit: "ea", priceCents: 45050 }]);
    expect(sent.autoSendLimitCents).toBe(50000);
  });
});

describe("RegionOverlay", () => {
  it("places each region by its fraction of the image", () => {
    render(<RegionOverlay src="x.jpg" alt="roof" regions={[{ label: "Missing shingles", box: [0.2, 0.3, 0.4, 0.1], severity: 4 }]} />);
    const box = screen.getByTestId("media-region") as HTMLElement;
    expect(box.style.left).toBe("20%");
    expect(box.style.top).toBe("30%");
    expect(box.style.width).toBe("40%");
    expect(screen.getByText("Missing shingles")).toBeTruthy();
  });
});
