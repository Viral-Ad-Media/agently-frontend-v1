export type BlogTemplateKey = "product_update" | "editorial" | "guide";
export type BlogStatus = "draft" | "published" | "archived";
export type BlogFontFamily = "default" | "sans" | "serif" | "display" | "mono";
export type BlogTextAlign = "left" | "center" | "right";
export type BlogMediaFit = "cover" | "contain";

export type BlogBlockStyle = {
  fontFamily?: BlogFontFamily;
  fontSize?: number;
  textColor?: string;
  backgroundColor?: string;
  textAlign?: BlogTextAlign;
  widthPercent?: number;
  paddingY?: number;
  borderRadius?: number;
  backgroundImageUrl?: string;
  overlayOpacity?: number;
  mediaFit?: BlogMediaFit;
};

type StyledBlock = {
  id: string;
  style?: BlogBlockStyle;
};

type ReadableBlock = StyledBlock & {
  readAloud?: boolean;
};

export type BlogBlock =
  | (ReadableBlock & { type: "paragraph"; text: string })
  | (ReadableBlock & { type: "heading"; text: string })
  | (ReadableBlock & { type: "quote"; text: string })
  | (ReadableBlock & { type: "bullets"; items: string[] })
  | (StyledBlock & {
      type: "image";
      url: string;
      alt?: string;
      caption?: string;
    })
  | (StyledBlock & {
      type: "video";
      url: string;
      caption?: string;
      posterUrl?: string;
    });

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  status?: BlogStatus;
  templateKey: BlogTemplateKey;
  coverImageUrl: string;
  authorName: string;
  contentBlocks?: BlogBlock[];
  seoTitle?: string;
  seoDescription?: string;
  publishedAt: string | null;
  createdAt?: string;
  updatedAt: string;
  createdBy?: string;
};

const resolveApiBaseUrl = () => {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  const local =
    host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
  if (!import.meta.env.DEV || !local) return "";
  return import.meta.env.VITE_API_PROXY_TARGET || "http://localhost:4000";
};

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || resolveApiBaseUrl()
).replace(/\/$/, "");

async function publicRequest<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message || "Unable to load blog content.");
  }
  return response.json() as Promise<T>;
}

export const blogApi = {
  async list(limit = 12) {
    const response = await publicRequest<{ posts: BlogPost[] }>(
      `/api/blog?limit=${encodeURIComponent(limit)}`,
    );
    return response.posts;
  },

  async get(slug: string) {
    const response = await publicRequest<{ post: BlogPost }>(
      `/api/blog/${encodeURIComponent(slug)}`,
    );
    return response.post;
  },
};
