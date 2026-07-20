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

const TOKEN_KEY = "agently_super_admin_session";

const resolveApiBaseUrl = () => {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
  if (!import.meta.env.DEV || !local) return "";
  return import.meta.env.VITE_API_PROXY_TARGET || "http://localhost:4000";
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || resolveApiBaseUrl()).replace(/\/$/, "");

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
