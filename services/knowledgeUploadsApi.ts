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
  /**
   * Uploads one file, reporting real progress.
   *
   * This used to call supabase.storage.uploadToSignedUrl(), which exposes no
   * progress events — so a large PDF showed a spinner with no indication of
   * whether it was moving. XHR against the same signed URL gives us
   * upload.onprogress, which is the only way to show a genuine percentage
   * rather than a fake animated bar.
   */
  async uploadFile(
    knowledgeBaseId: string,
    file: File,
    onProgress?: (percent: number) => void,
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
    onProgress?.(0);
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", signedUrl, true);
      xhr.setRequestHeader("x-upsert", "true");
      if (file.type) xhr.setRequestHeader("Content-Type", file.type);
      // The signed URL already carries authorisation; the token header keeps
      // parity with what uploadToSignedUrl sends.
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        // Cap at 99: the last percent belongs to the server registering the
        // file, so the bar should not sit at 100 while work remains.
        onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Upload failed (${xhr.status}).`));
      xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
      xhr.onabort = () => reject(new Error("Upload cancelled."));
      xhr.send(file);
    });
    void bucket; // storagePath + token identify the object; bucket is informational.

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
    onProgress?.(100);
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
