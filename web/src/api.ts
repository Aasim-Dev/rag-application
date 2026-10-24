// VITE_API_URL is the deployed API (e.g. https://your-api.onrender.com). Empty in dev: Vite proxies /api.
const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export interface DocumentInfo {
  id: string;
  title: string;
  sourceType: string;
  chars: number;
  chunks: number;
  createdAt: string;
}

export interface Source {
  id: number;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  similarity: number | null;
}

export interface AskResult {
  answer: string;
  sources: Source[];
  citedSources: number[];
  latencyMs: number;
  grounded: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, init);
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  listDocuments: () => request<DocumentInfo[]>("/documents"),
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, { method: "DELETE" }),
  uploadFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DocumentInfo>("/documents", { method: "POST", body: form });
  },
  pasteText: (title: string, text: string) =>
    request<DocumentInfo>("/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, text }),
    }),
  ask: (question: string, documentIds?: string[]) =>
    request<AskResult>("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, documentIds: documentIds?.length ? documentIds : undefined }),
    }),
};
