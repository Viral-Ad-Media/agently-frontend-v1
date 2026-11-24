/*
 * Landing page regression test (v1.7, 2026-10-05).
 *
 * The landing page is a pure-Tailwind React port of the approved standalone
 * preview (artifact "agently-landing-page"). These tests pin the copy and
 * behaviors that are easy to break in a port:
 *  1. the hero, demo number, pricing and all sections render,
 *  2. the workflow tabs switch the demo copy,
 *  3. the theme toggle flips data-theme and persists the choice,
 *  4. the hamburger toggles the mobile nav,
 *  5. the integrations section carries the real brand marks as a marquee,
 *  6. the contact modal opens/closes and is addressed to support,
 *  7. the FAQ accordion opens one answer at a time,
 *  8. in-page anchors keep their hrefs but scroll instead of routing
 *     (HashRouter owns the URL hash, so a real navigation would blank the page),
 *  9. Lawal's product facts hold: no "receptionist" label, all-language
 *     agents, $10 pay-as-you-go, Calendly/Google Calendar on the roadmap,
 *     no Inter font.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, beforeEach } from "vitest";
import LandingPage from "../pages/LandingPage";

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.body.style.overflow = "";
});

describe("LandingPage", () => {
  it("renders the hero, demo number, pricing and all sections", () => {
    renderLanding();
    expect(
      screen.getByRole("heading", {
        name: /Every conversation handled\. Every opportunity within reach\./i,
      }),
    ).toBeInTheDocument();
    // Obviously-fake demo number, no placeholder caption anywhere.
    expect(screen.getAllByText("+1 (123) 456-7890").length).toBeGreaterThan(0);
    const demoLink = screen
      .getAllByRole("link", { name: "+1 (123) 456-7890" })
      .at(0);
    expect(demoLink?.getAttribute("href")).toBe("tel:+11234567890");
    expect(document.body.textContent).not.toMatch(/placeholder/i);
    // Pay-as-you-go pricing with the $10 minimum.
    expect(screen.getByText(/minimum of \$10/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^pay as you go$/i }),
    ).toBeInTheDocument();
    for (const id of [
      "platform",
      "proof",
      "recovery",
      "solutions",
      "pricing",
      "faq",
      "footer",
    ]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("renders the desktop nav items and a Log in link to /login", () => {
    renderLanding();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const name of [
      "Platform",
      "Solutions",
      "Integrations",
      "Pricing",
      "Resources",
    ]) {
      expect(within(nav).getByRole("link", { name })).toBeInTheDocument();
    }
    expect(within(nav).getByRole("link", { name: "Platform" }).getAttribute("href")).toBe(
      "#platform",
    );
    const loginLinks = screen.getAllByRole("link", { name: /log in/i });
    expect(loginLinks.length).toBeGreaterThan(0);
    expect(loginLinks[0].getAttribute("href")).toBe("/login");
  });

  it("switches the demo copy when a workflow tab is clicked", () => {
    renderLanding();
    expect(screen.getByText(/A customer calls after hours/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Lead management" }));
    expect(
      screen.getByText(/becomes a lead your team can review/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/A customer calls after hours/i),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Website chat" }));
    expect(screen.getByText(/website visitor starts a chat/i)).toBeInTheDocument();
  });

  it("defaults to dark when the visitor has not picked a theme", () => {
    window.localStorage.clear();
    renderLanding();
    const dark = screen.getAllByRole("button", { name: "Dark" })[0];
    expect(dark.getAttribute("aria-pressed")).toBe("true");
  });

  it("toggles light/dark theme and persists the choice", () => {
    renderLanding();
    const darkButton = screen.getByRole("button", { name: "Dark" });
    const lightButton = screen.getByRole("button", { name: "Light" });
    fireEvent.click(darkButton);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("agently-theme")).toBe("dark");
    expect(darkButton.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(lightButton);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem("agently-theme")).toBe("light");
  });

  it("toggles the mobile navigation with the hamburger button", () => {
    renderLanding();
    const nav = document.getElementById("primary-nav");
    expect(nav).not.toBeNull();
    const toggle = screen.getByRole("button", { name: /navigation/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(nav?.className).toMatch(/flex/);
  });

  it("shows the integrations section with a logo marquee", () => {
    renderLanding();
    expect(
      screen.getByRole("heading", {
        name: /connect agently to the tools your team already uses/i,
      }),
    ).toBeInTheDocument();
    expect(document.getElementById("integrations")).not.toBeNull();
    const marquee = document.querySelector(".lp-marquee");
    expect(marquee).not.toBeNull();
    for (const name of [
      "Gmail",
      "Email",
      "Calendly",
      "Google Calendar",
      "Google Docs",
      "Agentor",
    ]) {
      expect(
        within(marquee as HTMLElement).getAllByText(name).length,
      ).toBeGreaterThan(0);
    }
    expect(within(marquee as HTMLElement).getAllByText("Planned").length).toBeGreaterThan(0);
  });

  it("opens and closes the contact modal addressed to support", () => {
    renderLanding();
    fireEvent.click(
      screen.getAllByRole("button", { name: /talk to sales/i })[0],
    );
    const dialog = screen.getByRole("dialog", { name: /contact sales/i });
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByText("agentlycallsupport@gmail.com"),
    ).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: /close dialog/i }));
    expect(
      screen.queryByRole("dialog", { name: /contact sales/i }),
    ).not.toBeInTheDocument();
  });

  it("closes the contact modal with the Escape key", () => {
    renderLanding();
    fireEvent.click(
      screen.getAllByRole("button", { name: /talk to sales/i })[0],
    );
    expect(
      screen.getByRole("dialog", { name: /contact sales/i }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: /contact sales/i }),
    ).not.toBeInTheDocument();
  });

  it("opens one FAQ answer at a time", () => {
    renderLanding();
    const first = screen.getByRole("button", {
      name: /what is agently/i,
    });
    const second = screen.getByRole("button", {
      name: /how does the \$10 minimum pay as you go work/i,
    });
    expect(first.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(second);
    expect(second.getAttribute("aria-expanded")).toBe("true");
    expect(first.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps in-page anchors as scroll links, not router navigations", () => {
    renderLanding();
    const platformLink = screen.getByRole("link", { name: "Platform" });
    expect(platformLink.getAttribute("href")).toBe("#platform");
    const loginLinks = screen.getAllByRole("link", { name: /log in/i });
    for (const link of loginLinks) {
      expect(link.getAttribute("href")).not.toContain("agentlycall.com");
    }
    expect(document.documentElement.innerHTML).not.toContain(
      "www.agentlycall.com",
    );
  });

  it("shows the footer with the wordmark and contact details", () => {
    renderLanding();
    const footer = document.getElementById("footer");
    expect(footer).not.toBeNull();
    expect(within(footer as HTMLElement).getByText(/© 2026 Agently/i)).toBeInTheDocument();
    expect(
      within(footer as HTMLElement).getByText("agentlycallsupport@gmail.com"),
    ).toBeInTheDocument();
  });

  it("holds Lawal's product facts", () => {
    renderLanding();
    const text = document.body.textContent ?? "";
    // Never an "AI receptionist" — the platform label is customer engagement.
    expect(text).not.toMatch(/receptionist/i);
    expect(text).toMatch(/customer engagement/i);
    // All-language agents, not just English/Spanish.
    expect(text).toMatch(/across all languages/i);
    // Calendly + Google Calendar are roadmap items.
    expect(text).toMatch(/Calendly/);
    expect(text).toMatch(/Google Calendar/);
    // Small, medium and large businesses — never one narrow industry.
    expect(text).toMatch(/small, medium, and large/i);
    // No invented proof.
    expect(text).not.toMatch(/placeholder/i);
  });

  it("uses the brand fonts only — never Inter", () => {
    renderLanding();
    const styles = Array.from(document.querySelectorAll("style"))
      .map((s) => s.textContent ?? "")
      .join("\n");
    expect(styles).not.toMatch(/Inter/);
    const html = document.documentElement.innerHTML;
    expect(html).toMatch(/DM[_ ]Sans/);
    expect(html).toMatch(/Manrope/);
    expect(html).toMatch(/IBM[_ ]Plex[_ ]Mono/);
  });
});
