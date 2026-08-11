import { resolveApiBaseUrl } from "../utils/runtimeUrls";
import type { BlogPost, BlogStatus, BlogTemplateKey, BlogBlock } from "./blogApi";

export type SuperAdminMetrics = {
  users: number;
  organizations: number;
  publishedPosts: number;
  lowCreditOrganizations: number;
  totalCustomerCreditUsd: number;
};

export type SuperAdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string | null;
  organizationId: string | null;
  organizationName: string;
  plan: string;
  subscriptionStatus: string;
  onboarded: boolean;
  walletBalanceUsd: number;
  walletCreditsAddedUsd: number;
  walletDeductionsUsd: number;
  walletStatus: string;
};


export type PlatformBillingPricing = {
  minimumTopUpUsd: number;
  defaultMarginPercent: number;
  openAiRealtimeMarginPercent: number;
  elevenLabsMarginPercent: number;
  twilioCallMarginPercent: number;
  twilioNumberMarginPercent: number;
  stripeCheckoutEnabled: boolean;
  stripeWebhookConfigured: boolean;
  settingsSource?: string;
  updatedAt?: string | null;
};

export type BlogPostInput = {
  title: string;
  slug?: string;
  excerpt: string;
  status: BlogStatus;
  templateKey: BlogTemplateKey;
  coverImageUrl: string;
  authorName: string;
  contentBlocks: BlogBlock[];
  seoTitle?: string;
  seoDescription?: string;
};


/* ── Platform assistant (Agently's own in-app support agent) ──────────────── */

export type PlatformAssistantFaq = {
  id: string;
  question: string;
  answer: string;
  is_published: boolean;
  display_order: number | null;
  updated_at: string | null;
};

export type PlatformAssistantSource = {
  id: string;
  url: string;
  title: string;
  status: string;
  updated_at: string | null;
};

export type PlatformAssistantViolation = {
  id: string;
  question: string;
  matched_terms: string[];
  created_at: string;
};

export type PlatformSupportRequest = {
  id: string;
  contact_name: string;
  contact_email: string;
  subject: string;
  body: string;
  status: "open" | "acknowledged" | "resolved";
  emailed_at: string | null;
  created_at: string;
};

export type PlatformAssistantSnapshot = {
  chatbot: {
    id: string;
    name: string;
    headerTitle: string;
    welcomeMessage: string;
    placeholder: string;
    accentColor: string;
    position: string;
    customPrompt: string;
    suggestedPrompts: string[];
    supportEmail: string;
    confidentialityMode: string;
    isActive: boolean;
    knowledgeBaseId: string;
  };
  organization: { id: string; name: string; dailySpendCapUsd: number };
  spend: { capUsd: number; spentUsd: number; degraded: boolean };
  faqs: PlatformAssistantFaq[];
  sources: PlatformAssistantSource[];
  violations: PlatformAssistantViolation[];
  supportRequests: PlatformSupportRequest[];
};

export type TourPageRow = {
  pageKey: string;
  label: string;
  version: number;
  isEnabled: boolean;
  updatedAt: string | null;
  completedCount: number;
  skippedCount: number;
};

const TOKEN_KEY = "agently_super_admin_session";

const API_BASE_URL = resolveApiBaseUrl();

export const getAdminToken = () => {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(TOKEN_KEY) || "";
};

export const setAdminToken = (token: string) => {
  if (typeof window === "undefined") return;
  if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
  else window.sessionStorage.removeItem(TOKEN_KEY);
};

async function request<T>(path: string, options: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (options.auth !== false) {
    const token = getAdminToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    const error = new Error(payload?.error?.message || `Request failed with status ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}

export const adminApi = {
  async config() {
    return request<{ enabled: boolean; otpRequired: boolean }>("/api/super-admin/auth/config", { auth: false });
  },

  async login(email: string, password: string, otp: string) {
    const response = await request<{ token: string; email: string; expiresInSeconds: number; otpRequired: boolean }>(
      "/api/super-admin/auth/login",
      { method: "POST", auth: false, body: JSON.stringify({ email, password, otp }) },
    );
    setAdminToken(response.token);
    return response;
  },

  async session() {
    return request<{ authenticated: boolean; email: string }>("/api/super-admin/auth/session");
  },

  logout() {
    setAdminToken("");
  },

  async overview() {
    const response = await request<{ metrics: SuperAdminMetrics }>("/api/super-admin/overview");
    return response.metrics;
  },

  async users(search = "", page = 1, pageSize = 25) {
    const params = new URLSearchParams({ search, page: String(page), pageSize: String(pageSize) });
    return request<{ rows: SuperAdminUser[]; page: number; pageSize: number; total: number }>(`/api/super-admin/users?${params.toString()}`);
  },

  async previewDeleteUser(userId: string, scope: "user" | "organization") {
    return request<{ user: Pick<SuperAdminUser, "id" | "name" | "email" | "role" | "organizationId">; scope: string; rows: unknown[] }>(
      `/api/super-admin/users/${encodeURIComponent(userId)}/delete-preview`,
      { method: "POST", body: JSON.stringify({ scope }) },
    );
  },

  async deleteUser(userId: string, scope: "user" | "organization", confirm: string) {
    return request<{ success: boolean }>(`/api/super-admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      body: JSON.stringify({ scope, confirm }),
    });
  },

  async blogPosts() {
    const response = await request<{ posts: BlogPost[] }>("/api/super-admin/blog");
    return response.posts;
  },

  async createBlogPost(input: BlogPostInput) {
    const response = await request<{ post: BlogPost }>("/api/super-admin/blog", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.post;
  },

  async updateBlogPost(postId: string, input: BlogPostInput) {
    const response = await request<{ post: BlogPost }>(`/api/super-admin/blog/${encodeURIComponent(postId)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return response.post;
  },

  async deleteBlogPost(postId: string) {
    return request<{ success: boolean }>(`/api/super-admin/blog/${encodeURIComponent(postId)}`, {
      method: "DELETE",
      body: JSON.stringify({ confirm: "DELETE_BLOG_POST" }),
    });
  },

  async uploadBlogImage(file: File) {
    const dataUrl = await compressImage(file);
    return request<{ url: string; storagePath: string }>("/api/super-admin/blog/upload", {
      method: "POST",
      body: JSON.stringify({ dataUrl, filename: file.name }),
    });
  },

  async blogAutomationStatus() {
    return request<{
      configured: boolean;
      webhookConfigured: boolean;
      secretConfigured: boolean;
      ingestUrl: string;
    }>("/api/blog-automation/status");
  },

  async triggerBlogAutomation(input: {
    topic: string;
    keywords?: string;
    templateKey: BlogTemplateKey;
    tone?: string;
    notes?: string;
    authorName?: string;
    autoPublish?: boolean;
  }) {
    return request<{ success: boolean; requestId: string; message: string }>(
      "/api/blog-automation/trigger",
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  async topUpWallet(organizationId: string, amountUsd: number, note?: string) {
    return request<{ success: boolean; transaction: unknown }>(
      `/api/super-admin/wallets/${encodeURIComponent(organizationId)}/top-up`,
      { method: "POST", body: JSON.stringify({ amountUsd, note }) },
    );
  },

  async billingPricing() {
    const response = await request<{ pricing: PlatformBillingPricing }>(
      "/api/super-admin/billing/pricing",
    );
    return response.pricing;
  },

  async updateBillingPricing(pricing: PlatformBillingPricing) {
    const response = await request<{
      success: boolean;
      pricing: PlatformBillingPricing;
    }>("/api/super-admin/billing/pricing", {
      method: "PATCH",
      body: JSON.stringify(pricing),
    });
    return response.pricing;
  },

  /* ── Platform assistant ─────────────────────────────────────────────── */

  async platformAssistant() {
    return request<PlatformAssistantSnapshot>("/api/super-admin/platform");
  },

  async updatePlatformAssistant(patch: Record<string, unknown>) {
    return request<{ success: boolean; warning: string | null }>(
      "/api/super-admin/platform/chatbot",
      { method: "PATCH", body: JSON.stringify(patch) },
    );
  },

  async updatePlatformSettings(dailySpendCapUsd: number) {
    return request<{ success: boolean }>("/api/super-admin/platform/settings", {
      method: "PATCH",
      body: JSON.stringify({ dailySpendCapUsd }),
    });
  },

  async createPlatformFaq(payload: { question: string; answer: string }) {
    return request<{ success: boolean }>("/api/super-admin/platform/faqs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async importPlatformFaqs(text: string) {
    return request<{ success: boolean; imported: number }>(
      "/api/super-admin/platform/faqs/import",
      { method: "POST", body: JSON.stringify({ text }) },
    );
  },

  async updatePlatformFaq(id: string, patch: Record<string, unknown>) {
    return request<{ success: boolean }>(
      `/api/super-admin/platform/faqs/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
  },

  async deletePlatformFaq(id: string) {
    return request<{ success: boolean }>(
      `/api/super-admin/platform/faqs/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  async addPlatformSource(url: string, title?: string) {
    return request<{ success: boolean }>("/api/super-admin/platform/sources", {
      method: "POST",
      body: JSON.stringify({ url, title }),
    });
  },

  async deletePlatformSource(id: string) {
    return request<{ success: boolean }>(
      `/api/super-admin/platform/sources/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  async updatePlatformSupportRequest(id: string, status: string) {
    return request<{ success: boolean }>(
      `/api/super-admin/platform/support-requests/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify({ status }) },
    );
  },

  /* ── Product tour ───────────────────────────────────────────────────── */

  async tourPages() {
    return request<{ pages: TourPageRow[] }>("/api/super-admin/tour");
  },

  async retriggerTourPage(pageKey: string) {
    return request<{ success: boolean; version: number }>(
      `/api/super-admin/tour/${encodeURIComponent(pageKey)}/retrigger`,
      { method: "POST" },
    );
  },

  async updateTourPage(pageKey: string, patch: Record<string, unknown>) {
    return request<{ success: boolean }>(
      `/api/super-admin/tour/${encodeURIComponent(pageKey)}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
  },
};



async function compressImage(file: File): Promise<string> {
  if (!file.type.match(/^image\/(jpeg|png|webp)$/)) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an image smaller than 12 MB.");
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read that image."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Unable to open that image."));
    element.src = source;
  });
  const maxWidth = 1800;
  const scale = Math.min(1, maxWidth / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable in this browser.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = 0.84;
  let output = canvas.toDataURL("image/webp", quality);
  while (output.length > 2_600_000 && quality > 0.48) {
    quality -= 0.08;
    output = canvas.toDataURL("image/webp", quality);
  }
  if (output.length > 3_600_000) throw new Error("This image is still too large after compression.");
  return output;
}
