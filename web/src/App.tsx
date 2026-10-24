import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type AskResult, type DocumentInfo } from "./api";

const EXAMPLES = [
  "Which job offers visa sponsorship?",
  "Which roles mention Laravel, and what do they require?",
  "Which job is fully remote and what is the salary?",
  "Which role asks for experience with embeddings or vector search?",
];

export function App() {
  const [docs, setDocs] = useState<DocumentInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [error, setError] = useState("");

  const refresh = () =>
    api
      .listDocuments()
      .then(setDocs)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingDocs(false));

  useEffect(() => {
    refresh();
  }, []);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const remove = async (id: string) => {
    await api.deleteDocument(id).catch((e: Error) => setError(e.message));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    refresh();
  };

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <h1>Job Doc Q&amp;A</h1>
          <p className="lede">
            Ask questions about job descriptions and resumes. Answers come only from your documents, with
            citations to the exact passages.
          </p>
        </div>
        <span className="pill">RAG · pgvector · hybrid search</span>
      </header>

      {error && (
        <div className="banner" role="alert">
          {error} <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}

      <main className="layout">
        <aside className="panel">
          <h2>Documents</h2>
          <Uploader onDone={refresh} onError={setError} />
          {loadingDocs ? (
            <p className="muted">Loading… (the free server can take ~40 s to wake up)</p>
          ) : docs.length === 0 ? (
            <p className="muted">No documents yet. Upload a job description PDF or paste one above.</p>
          ) : (
            <>
              <p className="muted small">
                {selected.size ? `Searching ${selected.size} selected` : "Searching all documents"}: tick to narrow down.
              </p>
              <ul className="doclist">
                {docs.map((d) => (
                  <li key={d.id}>
                    <label>
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                      <span className="doctitle">{d.title}</span>
                    </label>
                    <span className="meta">
                      {d.chunks} chunks · {d.sourceType}
                      <button className="link" onClick={() => remove(d.id)} aria-label={`Delete ${d.title}`}>
                        delete
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>

        <section className="panel main">
          <Asker documentIds={[...selected]} onError={setError} />
        </section>
      </main>

      <footer className="foot">
        Embeddings and answers: Google Gemini · Vectors: Postgres + pgvector · Search: vector + full-text merged
        with reciprocal rank fusion
      </footer>
    </div>
  );
}

function Uploader({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (job: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await job();
      setTitle("");
      setText("");
      if (fileRef.current) fileRef.current.value = "";
      onDone();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uploader">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === "file"} onClick={() => setMode("file")}>Upload file</button>
        <button role="tab" aria-selected={mode === "paste"} onClick={() => setMode("paste")}>Paste text</button>
      </div>
      {mode === "file" ? (
        <input
          id="file"
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.md,.csv,.json"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) run(() => api.uploadFile(file));
          }}
        />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api.pasteText(title, text));
          }}
        >
          <input id="paste-title" placeholder="Title, e.g. Acme – Laravel Developer" value={title}
            onChange={(e) => setTitle(e.target.value)} required />
          <textarea id="paste-text" placeholder="Paste the job description or resume…" rows={6} value={text}
            onChange={(e) => setText(e.target.value)} required minLength={30} />
          <button type="submit" disabled={busy}>Add document</button>
        </form>
      )}
      {busy && <p className="muted small">Chunking and embedding…</p>}
    </div>
  );
}

function Asker({ documentIds, onError }: { documentIds: string[]; onError: (m: string) => void }) {
  const [question, setQuestion] = useState(EXAMPLES[0]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [focused, setFocused] = useState<number | null>(null);

  const ask = async (e?: FormEvent, q = question) => {
    e?.preventDefault();
    setBusy(true);
    setFocused(null);
    try {
      setResult(await api.ask(q, documentIds));
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form className="askform" onSubmit={ask}>
        <label htmlFor="question">Ask a question</label>
        <div className="askrow">
          <input id="question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} />
          <button type="submit" disabled={busy || question.trim().length < 3}>{busy ? "Thinking…" : "Ask"}</button>
        </div>
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <button type="button" key={ex} className="chip" onClick={() => { setQuestion(ex); ask(undefined, ex); }}>
              {ex}
            </button>
          ))}
        </div>
      </form>

      {result && (
        <article className="answer" aria-live="polite">
          <div className="answerhead">
            <h2>Answer</h2>
            <span className="meta">
              {result.grounded ? `${result.citedSources.length} source(s) cited` : "not found in documents"} ·{" "}
              {(result.latencyMs / 1000).toFixed(1)} s
            </span>
          </div>
          <p className="answertext">
            {result.answer.split(/(\[\d+\]|\*\*[^*]+\*\*)/g).map((part, i) => {
              if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
              const m = part.match(/^\[(\d+)\]$/);
              if (!m) return <span key={i}>{part}</span>;
              const n = Number(m[1]);
              return (
                <button key={i} className="cite" onClick={() => setFocused(n)} aria-label={`Show source ${n}`}>
                  {n}
                </button>
              );
            })}
          </p>

          <h3>Retrieved passages</h3>
          <ol className="sources">
            {result.sources.map((s, i) => (
              <li key={s.id} className={focused === i + 1 ? "focus" : result.citedSources.includes(i + 1) ? "cited" : ""}>
                <div className="sourcehead">
                  <span className="num">{i + 1}</span>
                  <span className="doctitle">{s.documentTitle}</span>
                  <span className="meta">
                    part {s.chunkIndex + 1}
                    {s.similarity !== null && ` · similarity ${(s.similarity * 100).toFixed(0)}%`}
                  </span>
                </div>
                <p className="excerpt">{s.content}</p>
              </li>
            ))}
          </ol>
        </article>
      )}
    </>
  );
}
