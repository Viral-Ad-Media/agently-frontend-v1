/*
 * Auth screens regression test (v1.8, 2026-10-05).
 *
 * Pure-Tailwind React port of the approved "agently-auth-pages" preview.
 * These tests pin what the port must not break:
 *  1. Login renders the sign-in form and switches to the sign-up form,
 *  2. the sign-up form has the preview's fields (no phone field — the
 *     register API accepts only name/company/email/password, so a
 *     decorative phone input was deliberately omitted),
 *  3. a successful submit moves to the verification-code step,
 *  4. the theme toggle flips data-theme and persists the choice,
 *  5. ForgotPassword renders the request form and the reset-token form,
 *  6. Terms renders the ported legal content with the support address,
 *  7. Lawal's product facts hold: support email, no "receptionist" label,
 *     terms link from signup.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "../pages/Login";
import ForgotPassword from "../pages/ForgotPassword";
import Terms from "../pages/Terms";

const loginProps = () => ({
  onLogin: vi.fn(),
  onRegister: vi.fn(),
  onVerifyEmail: vi.fn(),
  onVerifyLoginOtp: vi.fn(),
  onResendCode: vi.fn(),
  resendCooldownSeconds: 60,
});

function renderLogin(props = loginProps()) {
  return render(
    <MemoryRouter>
      <Login {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  // Login keeps its tab in the URL (?mode=signup) and a sign-up draft in
  // sessionStorage; start every test on a clean sign-in screen.
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/login");
  document.documentElement.removeAttribute("data-theme");
});

describe("Login", () => {
  it("renders the sign-in form with the preview's fields and copy", () => {
    renderLogin();
    expect(
      screen.getByRole("heading", { name: "Welcome back." }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Forgot password?")).toBeInTheDocument();
  });

  it("switches to the sign-up form with tabs", () => {
    renderLogin();
    fireEvent.click(screen.getByRole("tab", { name: "Create account" }));
    expect(
      screen.getByRole("heading", { name: "Build your workspace." }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Business name")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("minLength", "8");
    // Password strength meter from the preview.
    expect(
      screen.getByText(/Use 8 or more characters/i),
    ).toBeInTheDocument();
    // Terms link, not a dead button.
    const termsLinks = screen.getAllByRole("link", { name: /Terms & Privacy/ });
    expect(
      termsLinks.some((l) => l.getAttribute("href") === "/terms"),
    ).toBe(true);
  });

  it("shows and hides the password", () => {
    renderLogin();
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password.type).toBe("password");
  });

  it("moves to the verification-code step after a successful sign-in submit", async () => {
    const props = loginProps();
    props.onLogin.mockResolvedValue({
      pendingToken: "tok-1",
      email: "sam@company.com",
      expiresInSeconds: 600,
      otpRequired: true,
    });
    renderLogin(props);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "sam@company.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "s3cret!!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Check your inbox." }),
      ).toBeInTheDocument(),
    );
    expect(props.onLogin).toHaveBeenCalledWith("sam@company.com", "s3cret!!");
    // Six code boxes, masked email, resend with cooldown.
    expect(screen.getAllByLabelText(/Digit \d/)).toHaveLength(6);
    expect(screen.getByText(/Resend code in/)).toBeInTheDocument();
  });

  it("shows a friendly error and signup hint on 401", async () => {
    const { ApiError } = await import("../services/api");
    const props = loginProps();
    props.onLogin.mockRejectedValue(new ApiError("Invalid credentials", 401));
    renderLogin(props);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "nobody@company.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrongpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /couldn't sign you in/i,
      ),
    );
    // The 401 hint points at creating an account without leaking whether
    // the address is registered.
    const hint = within(screen.getByTestId("signup-hint")).getByRole(
      "button",
      { name: "Create an account" },
    );
    fireEvent.click(hint);
    expect(
      screen.getByRole("heading", { name: "Build your workspace." }),
    ).toBeInTheDocument();
  });

  it("toggles the theme and persists the choice", () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Use dark theme" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("agently-auth-theme")).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Use light theme" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("shows the support footer", () => {
    renderLogin();
    const mail = screen.getByRole("link", {
      name: "agentlycallsupport@gmail.com",
    });
    expect(mail).toHaveAttribute(
      "href",
      "mailto:agentlycallsupport@gmail.com",
    );
  });
});

describe("ForgotPassword", () => {
  function renderForgot(initialPath: string) {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <ForgotPassword />
      </MemoryRouter>,
    );
  }

  it("renders the recovery request form", () => {
    renderForgot("/forgot-password");
    expect(
      screen.getByRole("heading", { name: "Reset your password." }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send recovery link" }),
    ).toBeInTheDocument();
  });

  it("renders the new-password form when a reset token is present", () => {
    renderForgot("/reset-password?resetToken=abc123");
    expect(
      screen.getByRole("heading", { name: "Choose a new password." }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Update password" }),
    ).toBeInTheDocument();
  });

  it("rejects mismatched passwords without calling the API", async () => {
    const { api } = await import("../services/api");
    const spy = vi.spyOn(api, "confirmPasswordReset");
    renderForgot("/reset-password?resetToken=abc123");
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newpassword1" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "different2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Passwords do not match/i,
      ),
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("Terms", () => {
  it("renders the ported legal content", () => {
    render(
      <MemoryRouter>
        <Terms />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: /Terms & Privacy\./ }),
    ).toBeInTheDocument();
    for (const heading of [
      "1. Agreement and the service",
      "2. Acceptable use",
      "3. Billing, usage and refunds",
      "4. Your information and privacy",
      "5. Security and account protection",
      "6. Availability and responsibility",
      "7. Changes and termination",
      "8. Questions or concerns",
    ]) {
      expect(
        screen.getByRole("heading", { name: heading }),
      ).toBeInTheDocument();
    }
    // Lawal's must-haves: fraud prohibition, non-refundable usage, no sale
    // of personal information, support address.
    expect(screen.getByText(/No fraud or impersonation\./)).toBeInTheDocument();
    expect(screen.getByText(/generally non-refundable/i)).toBeInTheDocument();
    expect(
      screen.getByText(/do not sell your personal information/i),
    ).toBeInTheDocument();
    const mailLinks = screen.getAllByRole("link", {
      name: "agentlycallsupport@gmail.com",
    });
    expect(
      mailLinks.some(
        (l) => l.getAttribute("href") === "mailto:agentlycallsupport@gmail.com",
      ),
    ).toBe(true);
  });
});

describe("auth product facts", () => {
  it("never labels the product a receptionist", () => {
    const { container } = render(
      <MemoryRouter>
        <>
          <Login {...loginProps()} />
        </>
      </MemoryRouter>,
    );
    render(
      <MemoryRouter>
        <Terms />
      </MemoryRouter>,
    );
    expect(document.body.textContent).not.toMatch(/receptionist/i);
    expect(container.textContent).not.toMatch(/receptionist/i);
  });
});
