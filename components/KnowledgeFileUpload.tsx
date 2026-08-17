import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ACCEPTED_KB_FILE_EXTENSIONS,
  KnowledgeSourceFile,
  MAX_KB_UPLOAD_MB,
  knowledgeUploadsApi,
} from "../services/knowledgeUploadsApi";

interface KnowledgeFileUploadProps {
  knowledgeBaseId: string;
  onToast?: (message: string, ok: boolean) => void;
  onIndexed?: () => void;
  /** Bumped by KnowledgeUploadTrigger after a new file is registered, so
   * this list (rendered separately, near where PageSelector sits) refreshes
   * immediately instead of waiting for its own next poll tick. */
  refreshSignal?: number;
}

const FILE_TYPE_ICON: Record<string, string> = {
  pdf: "fa-file-pdf",
  docx: "fa-file-word",
  epub: "fa-book",
  txt: "fa-file-lines",
};

const STATUS_LABEL: Record<KnowledgeSourceFile["status"], string> = {
  uploading: "Uploading",
  processing: "Processing",
  indexed: "Indexed",
  failed: "Failed",
};

const STATUS_CLASSES: Record<KnowledgeSourceFile["status"], string> = {
  uploading: "bg-slate-100 text-slate-500",
  processing: "bg-amber-50 text-amber-700",
  indexed: "bg-emerald-50 text-emerald-700",
  failed: "bg-rose-50 text-rose-700",
};

/**
 * Compact "+ file" trigger (a hidden native input behind a small icon
 * button) instead of a full drop-zone container — the container took up a
 * whole card of its own for something that's really a single action.
 * Documents that have been attached still get their own list underneath,
 * self-contained and self-polling like PageSelector, so removing/checking
 * status here never re-renders the rest of the page.
 */
export const KnowledgeUploadTrigger: React.FC<{
  knowledgeBaseId: string;
  onToast?: (message: string, ok: boolean) => void;
  onQueued?: (file: KnowledgeSourceFile) => void;
  uploading: boolean;
  setUploading: (v: boolean) => void;
}> = ({ knowledgeBaseId, onToast, onQueued, uploading, setUploading }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || !fileList.length) return;
      const files = Array.from(fileList);
      setUploading(true);
      for (const file of files) {
        const ext = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
        if (ext === ".zip") {
          onToast?.(
            "Zip files aren't supported — upload the document directly.",
            false,
          );
          continue;
        }
        if (!ACCEPTED_KB_FILE_EXTENSIONS.includes(ext)) {
          onToast?.(
            `${file.name}: only PDF, DOCX, EPUB, and TXT files are supported.`,
            false,
          );
          continue;
        }
        if (file.size > MAX_KB_UPLOAD_MB * 1024 * 1024) {
          onToast?.(
            `${file.name} is larger than the ${MAX_KB_UPLOAD_MB}MB limit.`,
            false,
          );
          continue;
        }
        try {
          const registered = await knowledgeUploadsApi.uploadFile(
            knowledgeBaseId,
            file,
          );
          onQueued?.(registered);
        } catch (err: any) {
          onToast?.(err?.message || `Could not upload ${file.name}.`, false);
        }
      }
      setUploading(false);
    },
    [knowledgeBaseId, onToast, onQueued, setUploading],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_KB_FILE_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title={`Attach a document (${ACCEPTED_KB_FILE_EXTENSIONS.join(", ")} · up to ${MAX_KB_UPLOAD_MB}MB)`}
        className="inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-slate-200 px-3 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:border-amber-300 hover:text-amber-700 disabled:opacity-50"
      >
        {uploading ? "Uploading…" : "+ Files"}
      </button>
    </>
  );
};

/**
 * The attached-documents list — self-contained polling like PageSelector.
 * Renders nothing when the knowledge base has no files yet, so it never
 * shows an empty container.
 */
const KnowledgeFileUpload: React.FC<KnowledgeFileUploadProps> = ({
  knowledgeBaseId,
  onToast,
  onIndexed,
  refreshSignal,
}) => {
  const [files, setFiles] = useState<KnowledgeSourceFile[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifiedIndexedIds = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const list = await knowledgeUploadsApi.listFiles(knowledgeBaseId);
      setFiles(list);
      for (const f of list) {
        if (f.status === "indexed" && !notifiedIndexedIds.current.has(f.id)) {
          notifiedIndexedIds.current.add(f.id);
          onIndexed?.();
        }
      }
    } catch {
      // Polling failures should not spam the UI; next tick retries.
    }
  }, [knowledgeBaseId, onIndexed]);

  useEffect(() => {
    void refresh();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    if (refreshSignal === undefined) return;
    void refresh();
    // Only re-run when the signal itself changes, not on every refresh identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  useEffect(() => {
    const hasInFlight = files.some(
      (f) => f.status === "uploading" || f.status === "processing",
    );
    if (hasInFlight && !pollRef.current) {
      pollRef.current = setInterval(() => void refresh(), 2500);
    } else if (!hasInFlight && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [files, refresh]);

  const removeFile = async (file: KnowledgeSourceFile) => {
    setRemovingId(file.id);
    try {
      await knowledgeUploadsApi.deleteFile(knowledgeBaseId, file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      onToast?.(`Removed ${file.filename}.`, true);
    } catch (err: any) {
      onToast?.(err?.message || `Could not remove ${file.filename}.`, false);
    } finally {
      setRemovingId(null);
    }
  };

  if (!files.length) return null;

  return (
    <div className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-card sm:p-6">
      <h3 className="text-base font-black text-slate-900">
        Attached documents
      </h3>
      <div className="mt-3 space-y-2">
        {files.map((f) => (
          <div
            key={f.id}
            className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <i
                className={`fa-solid ${FILE_TYPE_ICON[f.fileType] || "fa-file"} shrink-0 text-slate-400`}
              />
              <span className="min-w-0 truncate text-xs font-bold text-slate-700">
                {f.filename}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {f.status === "failed" && f.statusReason && (
                <span
                  className="hidden max-w-[12rem] truncate text-[10px] text-rose-500 sm:inline"
                  title={f.statusReason}
                >
                  {f.statusReason}
                </span>
              )}
              <span
                className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${STATUS_CLASSES[f.status]}`}
              >
                {STATUS_LABEL[f.status]}
              </span>
              <button
                type="button"
                onClick={() => void removeFile(f)}
                disabled={removingId === f.id}
                aria-label={`Remove ${f.filename}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
              >
                <i
                  className={`fa-solid ${removingId === f.id ? "fa-spinner fa-spin" : "fa-xmark"} text-[10px]`}
                />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KnowledgeFileUpload;
