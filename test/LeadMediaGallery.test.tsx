import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

const listLeadMedia = vi.fn();
vi.mock("../services/api", () => ({
  api: {
    listLeadMedia: (...a: unknown[]) => listLeadMedia(...a),
    deleteLeadMedia: vi.fn(),
  },
}));

import LeadMediaGallery from "../components/LeadMediaGallery";

describe("LeadMediaGallery", () => {
  beforeEach(() => listLeadMedia.mockReset());

  it("renders nothing for a lead without media", async () => {
    listLeadMedia.mockResolvedValue({ media: [] });
    const { container } = render(<LeadMediaGallery leadId="lead-1" />);
    await waitFor(() => expect(listLeadMedia).toHaveBeenCalledWith("lead-1"));
    expect(container.innerHTML).toBe("");
  });

  it("stays quiet when the API fails (e.g. before the migration)", async () => {
    listLeadMedia.mockRejectedValue(new Error("nope"));
    const { container } = render(<LeadMediaGallery leadId="lead-1" />);
    await waitFor(() => expect(listLeadMedia).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });

  it("shows the photo with the assistant's notes", async () => {
    listLeadMedia.mockResolvedValue({
      media: [
        {
          id: "m1",
          kind: "photo",
          mime: "image/jpeg",
          url: "https://signed/a.jpg",
          note: "storm last night",
          analysisStatus: "done",
          analysis: { summary: "Lifted flashing by the chimney", observations: ["Two shingles missing"], urgency: "high", confidence: 0.8, needs_human: true },
          createdAt: "2026-11-13T16:00:00Z",
        },
      ],
    });
    render(<LeadMediaGallery leadId="lead-1" />);
    expect(await screen.findByText("Lifted flashing by the chimney")).toBeTruthy();
    expect(screen.getByText("Two shingles missing")).toBeTruthy();
    expect(screen.getByText("high urgency")).toBeTruthy();
    expect(screen.getByText("“storm last night”")).toBeTruthy();
    expect(screen.getByAltText(/Customer photo|.+/).getAttribute("src")).toBe("https://signed/a.jpg");
  });
});
