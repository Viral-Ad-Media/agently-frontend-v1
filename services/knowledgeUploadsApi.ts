// services/knowledgeUploadsApi.ts
//
// Drag-and-drop Knowledge Base file upload (PDF/DOCX/EPUB/TXT).
// Mirrors voiceCallsApi.ts's fetch/auth conventions. Additive-only: talks to
// the new /api/knowledge-uploads/* routes and does not touch any existing
// knowledge-base API surface.

import { createClient } from "@supabase/supabase-js";
import { resolveApiBaseUrl } from "../utils/runtimeUrls";
import { getSessionToken } from "./session";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export type SourceFileStatus = "uploading" | "processing" | "indexed" | "failed";

export interface KnowledgeSourceFile {
  id: string;
  knowledgeBaseId: string;
  filename: string;
  fileType: string;
  fileSizeBytes: number;
  status: SourceFileStatus;
  statusReason: string;
  createdAt: string;
  indexedAt: string | null;
}

const authHeaders = () => {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = getSessionToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    ...init,
    headers: authHeaders(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || "Request failed.");
  }
  return data as T;
}

export const ACCEPTED_KB_FILE_EXTENSIONS = [".pdf", ".docx", ".epub", ".txt"];

export const knowledgeUploadsApi = {
  async uploadFile(
    knowledgeBaseId: string,
    file: File,
  ): Promise<KnowledgeSourceFile> {
    if (!supabase) {
      throw new Error("Storage is not configured for this environment.");
    }

    const { signedUrl, token, storagePath, bucket } = await requestJson<{
      signedUrl: string;
      token: string;
      storagePath: string;
      bucket: string;
    }>(`/api/knowledge-uploads/${encodeURIComponent(knowledgeBaseId)}/upload-url`, {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        fileSizeBytes: file.size,
      }),
    });
    void signedUrl; // returned for parity with the API shape; the SDK call below needs only the token.

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .uploadToSignedUrl(storagePath, token, file);
    if (uploadError) {
      throw new Error(uploadError.message || "Upload failed.");
    }

    const { file: registered } = await requestJson<{ file: KnowledgeSourceFile }>(
      `/api/knowledge-uploads/${encodeURIComponent(knowledgeBaseId)}/files`,
      {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          storagePath,
          fileSizeBytes: file.size,
        }),
      },
    );
    return registered;
  },

  async listFiles(knowledgeBaseId: string): Promise<KnowledgeSourceFile[]> {
    const { files } = await requestJson<{ files: KnowledgeSourceFile[] }>(
      `/api/knowledge-uploads/${encodeURIComponent(knowledgeBaseId)}/files`,
    );
    return files;
  },

  async deleteFile(knowledgeBaseId: string, fileId: string): Promise<void> {
    await requestJson(
      `/api/knowledge-uploads/${encodeURIComponent(knowledgeBaseId)}/files/${encodeURIComponent(fileId)}`,
      { method: "DELETE" },
    );
  },
};

export const MAX_KB_UPLOAD_MB = 25;
