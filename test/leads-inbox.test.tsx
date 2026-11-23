import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LeadsInbox from "../pages/LeadsInbox";
import type { Lead } from "../types";

const leads: Lead[] = Array.from({ length: 27 }, (_, index) => ({
  id: `lead-${index + 1}`,
  name: `Contact ${String(index + 1).padStart(2, "0")}`,
  email: `contact${index + 1}@example.test`,
  phone: "",
  reason: `Enquiry ${String(index + 1).padStart(2, "0")}`,
  createdAt: "2026-10-12T10:00:00Z",
  status: "new",
  tags: index < 3 ? ["Priority"] : [],
}));

const props = {
  leads,
  onUpdateLead: vi.fn().mockResolvedValue(undefined),
  onCreateLead: vi.fn().mockResolvedValue(undefined),
  onDeleteLead: vi.fn().mockResolvedValue(undefined),
  onBulkDeleteLeads: vi.fn().mockResolvedValue(undefined),
  onImportCsv: vi.fn().mockResolvedValue(undefined),
  onExport: vi.fn().mockResolvedValue(undefined),
  onRefresh: vi.fn().mockResolvedValue(undefined),
};
const view = (rows = leads) => <MemoryRouter><LeadsInbox {...props} leads={rows} /></MemoryRouter>;
const table = () => within(screen.getByRole("table"));
const pagination = () => within(screen.getByRole("navigation", { name: "Lead pagination (top)" }));
const next = () => fireEvent.click(pagination().getByRole("button", { name: "Next page" }));
const selectPage = () => fireEvent.click(table().getByRole("checkbox", { name: "Select all leads on this page" }));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Leads inbox pagination", () => {
  it("pages through results without omissions and applies the page-size choice", () => {
    render(view());
    expect(table().getAllByRole("row")).toHaveLength(11);
    expect(table().getByText("Contact 01")).toBeInTheDocument();
    expect(table().queryByText("Contact 11")).not.toBeInTheDocument();
    expect(pagination().getByRole("button", { name: "Previous page" })).toBeDisabled();

    next();
    expect(table().getByText("Contact 11")).toBeInTheDocument();
    expect(table().getByText("Contact 20")).toBeInTheDocument();
    expect(table().queryByText("Contact 10")).not.toBeInTheDocument();
    next();
    expect(table().getAllByRole("row")).toHaveLength(8);
    expect(table().getByText("Contact 27")).toBeInTheDocument();
    expect(pagination().getByRole("button", { name: "Next page" })).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox", { name: "Leads per page (bottom)" }), { target: { value: "25" } });
    expect(table().getAllByRole("row")).toHaveLength(26);
    expect(table().getByText("Contact 01")).toBeInTheDocument();
    next();
    expect(table().getAllByRole("row")).toHaveLength(3);
    expect(table().getByText("Contact 26")).toBeInTheDocument();
  });

  it("returns to the first page for search, tags, sorting and the archive", () => {
    render(view());
    next();
    next();
    fireEvent.change(screen.getByRole("textbox", { name: "Search leads" }), { target: { value: "Contact 02" } });
    expect(table().getAllByRole("row")).toHaveLength(2);
    expect(table().getByText("Contact 02")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search leads" }), { target: { value: "" } });
    expect(table().getByText("Contact 01")).toBeInTheDocument();
    next();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by tags" }), { target: { value: "Priority" } });
    expect(table().getAllByRole("row")).toHaveLength(4);
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by tags" }), { target: { value: "all" } });
    next();
    fireEvent.click(table().getByRole("button", { name: "Lead" }));
    expect(pagination().getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    next();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByText("No leads here yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← Inbox" }));
    expect(pagination().getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
  });

  it("selects only the current page, preserves other pages, and clears hidden selections when filtering", () => {
    render(view());
    selectPage();
    expect(screen.getByText("10 selected")).toBeInTheDocument();
    next();
    expect(table().getByRole("checkbox", { name: "Select all leads on this page" })).not.toBeChecked();
    selectPage();
    expect(screen.getByText("20 selected")).toBeInTheDocument();
    selectPage();
    expect(screen.getByText("10 selected")).toBeInTheDocument();
    fireEvent.click(pagination().getByRole("button", { name: "Previous page" }));
    expect(table().getByRole("checkbox", { name: "Select all leads on this page" })).toBeChecked();
    fireEvent.change(screen.getByRole("textbox", { name: "Search leads" }), { target: { value: "Contact 27" } });
    expect(screen.queryByText("10 selected")).not.toBeInTheDocument();
    expect(table().getByRole("checkbox", { name: "Select Contact 27" })).not.toBeChecked();
  });

  it("shows the nearest valid page when refresh removes the final page", () => {
    const { rerender } = render(view());
    next();
    next();
    rerender(view(leads.slice(0, 20)));
    expect(table().getAllByRole("row")).toHaveLength(11);
    expect(table().getByText("Contact 11")).toBeInTheDocument();
    expect(table().getByText("Contact 20")).toBeInTheDocument();
    expect(pagination().getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    expect(pagination().getByRole("button", { name: "Next page" })).toBeDisabled();
  });
});
