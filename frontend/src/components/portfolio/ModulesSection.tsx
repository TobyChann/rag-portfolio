// frontend/src/components/portfolio/ModulesSection.tsx
"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

import { API_BASE as API } from "@/lib/api";

// ─── Data ────────────────────────────────────────────────────
// The API returns the tree as two flat lists linked by parent_id / folder_id;
// everything below derives structure from them, so depth is unlimited.

interface PortfolioDoc {
  id: string;
  google_doc_id: string;
  title: string;
  display_name: string;
  summary: string;
  skills: string[];
  folder_id: string | null;
  last_synced_at: string | null;
  // Owner-only: the public API omits these.
  tag_status?: string;
  needs_review?: boolean;
  parse_status?: string;
  chunk_count?: number;
}

interface FolderNode {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  is_course: boolean;
  summary: string;
  is_currently_learning: boolean;
  notes: string;
  grade: string;
}

export interface Portfolio {
  folders: FolderNode[];
  docs: PortfolioDoc[];
}

interface Tree {
  folder: (id: string) => FolderNode | undefined;
  childFolders: (id: string | null) => FolderNode[];
  docsIn: (id: string | null) => PortfolioDoc[];
  path: (id: string | null) => FolderNode[];                  // top-level → id
  counts: (id: string) => { courses: number; notes: number }; // recursive
  options: { id: string; label: string }[];                   // every folder as "A / B / C"
}

function buildTree(data: Portfolio): Tree {
  const byId = new Map(data.folders.map(f => [f.id, f]));
  const kids = new Map<string | null, FolderNode[]>();
  for (const f of data.folders) {
    const key = f.parent_id && byId.has(f.parent_id) ? f.parent_id : null;   // orphans → top
    kids.set(key, [...(kids.get(key) ?? []), f]);
  }
  const docs = new Map<string | null, PortfolioDoc[]>();
  for (const d of data.docs) {
    const key = d.folder_id && byId.has(d.folder_id) ? d.folder_id : null;
    docs.set(key, [...(docs.get(key) ?? []), d]);
  }
  const path = (id: string | null) => {
    const out: FolderNode[] = [];
    const seen = new Set<string>();
    for (let n = id ? byId.get(id) : undefined; n && !seen.has(n.id); n = n.parent_id ? byId.get(n.parent_id) : undefined) {
      seen.add(n.id);
      out.unshift(n);
    }
    return out;
  };
  const countCache = new Map<string, { courses: number; notes: number }>();
  const counts = (id: string): { courses: number; notes: number } => {
    const hit = countCache.get(id);
    if (hit) return hit;
    countCache.set(id, { courses: 0, notes: 0 });   // guards against cycles
    let courses = 0, notes = docs.get(id)?.length ?? 0;
    for (const c of kids.get(id) ?? []) {
      const sub = counts(c.id);
      courses += sub.courses + (c.is_course ? 1 : 0);
      notes += sub.notes;
    }
    const result = { courses, notes };
    countCache.set(id, result);
    return result;
  };
  const options: { id: string; label: string }[] = [];
  const walk = (parent: string | null, prefix: string, seen: Set<string>) => {
    for (const f of kids.get(parent) ?? []) {
      if (seen.has(f.id)) continue;
      const label = prefix ? `${prefix} / ${f.name}` : f.name;
      options.push({ id: f.id, label });
      walk(f.id, label, new Set(seen).add(f.id));
    }
  };
  walk(null, "", new Set());
  return {
    folder: id => byId.get(id),
    childFolders: id => kids.get(id) ?? [],
    docsIn: id => docs.get(id) ?? [],
    path, counts, options,
  };
}

// Drag & drop payload (Curate mode): a note or a folder being moved.
type DragItem = { kind: "doc"; id: string } | { kind: "folder"; id: string };
const DRAG_MIME = "application/x-portfolio-item";

async function moveItem(item: DragItem, targetFolder: string | null) {
  const url = item.kind === "doc"
    ? `${API}/admin/documents/${item.id}`          // doc id = google_doc_id
    : `${API}/admin/folders/${item.id}`;
  const body = item.kind === "doc" ? { folder_id: targetFolder ?? "" } : { parent_id: targetFolder ?? "" };
  const res = await fetch(url, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    credentials: "include", body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || "Move failed");
  }
}

/** Props that make an element a drop target for moving items into `folderId`. */
function useDropTarget(editMode: boolean, folderId: string | null, onMoved: () => void, onError: (m: string) => void) {
  const [over, setOver] = useState(false);
  if (!editMode) return { over: false, props: {} };
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault(); e.stopPropagation(); setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: async (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setOver(false);
        const raw = e.dataTransfer.getData(DRAG_MIME);
        if (!raw) return;
        const item = JSON.parse(raw) as DragItem;
        if (item.kind === "folder" && item.id === folderId) return;
        try { await moveItem(item, folderId); onMoved(); }
        catch (err: any) { onError(err.message); }
      },
    },
  };
}

function dragProps(editMode: boolean, item: DragItem) {
  if (!editMode) return {};
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item));
      e.dataTransfer.effectAllowed = "move";
    },
  };
}

// ─── Shared styles ───────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  fontSize: 13, padding: "6px 10px", border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)", background: "var(--bg)", color: "var(--fg)",
  outline: "none", width: "100%",
};

const NOTE_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: 10,
};

// Uses the `border` shorthand like the base styles it overrides; mixing in
// borderColor makes React warn when the highlight is removed.
const dropHighlight = (over: boolean): React.CSSProperties =>
  over ? { border: "1px solid var(--accent)", background: "var(--accent-light)" } : {};

function fmtSynced(iso: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: "Never synced", stale: true };
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return { text: `Synced ${date}, ${time}`, stale: false };
}

function countLabel({ courses, notes }: { courses: number; notes: number }) {
  return [courses && `${courses} course${courses === 1 ? "" : "s"}`,
          `${notes} note${notes === 1 ? "" : "s"}`].filter(Boolean).join(" · ");
}

function CourseBadges({ f }: { f: FolderNode }) {
  return (
    <>
      {f.is_currently_learning && (
        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)", whiteSpace: "nowrap" }}>
          Learning
        </span>
      )}
      {f.grade && (
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "var(--accent-light)", color: "var(--accent-text)", border: "1px solid var(--accent-border)", whiteSpace: "nowrap" }}>
          {f.grade}
        </span>
      )}
    </>
  );
}

// ─── Home page section ───────────────────────────────────────

export default function ModulesSection({ initial, editMode }: { initial: Portfolio; editMode: boolean }) {
  const [data, setData] = useState<Portfolio>(initial);
  const [error, setError] = useState("");
  const [explorerAt, setExplorerAt] = useState<string | null | undefined>(undefined);  // undefined = closed
  const [modalDocId, setModalDocId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [moveErr, setMoveErr] = useState("");

  const load = useCallback(async () => {
    try {
      // With the admin cookie this returns untagged notes and curation state too.
      const res = await fetch(`${API}/portfolio`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError("Couldn't load modules.");
    }
  }, []);

  useEffect(() => { if (editMode) load(); }, [editMode, load]);

  const tree = useMemo(() => buildTree(data), [data]);

  async function createTopFolder() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch(`${API}/admin/folders`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify({ name }),
    });
    if (res.ok) { setNewName(""); load(); }
  }

  if (error) return <p style={{ fontSize: 13, color: "var(--danger)" }}>{error}</p>;

  const tops = tree.childFolders(null);
  const looseDocs = tree.docsIn(null);
  const modalDoc = modalDocId ? data.docs.find(d => d.id === modalDocId) ?? null : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
        {tops.map(f => (
          <TopFolderCard key={f.id} folder={f} tree={tree} editMode={editMode}
                         onOpen={() => setExplorerAt(f.id)} reload={load} onError={setMoveErr} />
        ))}
      </div>

      {looseDocs.length > 0 && (
        <div>
          {tops.length > 0 && <p className="section-label" style={{ margin: "8px 0" }}>Other notes</p>}
          <div style={NOTE_GRID}>
            {looseDocs.map(doc => (
              <DocCard key={doc.id} doc={doc} editMode={editMode} onOpen={() => setModalDocId(doc.id)} />
            ))}
          </div>
        </div>
      )}

      {tops.length === 0 && looseDocs.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--fg-subtle)", fontStyle: "italic" }}>Nothing ingested yet.</p>
      )}

      {editMode && (
        <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createTopFolder()}
            placeholder="New top-level folder…"
            style={{ ...inputStyle, maxWidth: 280 }}
          />
          <button onClick={createTopFolder} className="btn btn-secondary" style={{ fontSize: 12 }}>+ Add folder</button>
          <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>Drag notes and folders onto a folder to move them.</span>
        </div>
      )}
      {moveErr && <p style={{ fontSize: 12, color: "var(--danger)" }}>{moveErr}</p>}

      {explorerAt !== undefined && (
        <FolderExplorer
          tree={tree}
          startAt={explorerAt}
          editMode={editMode}
          docModalOpen={!!modalDoc}
          onOpenDoc={doc => setModalDocId(doc.id)}
          onClose={() => setExplorerAt(undefined)}
          reload={load}
        />
      )}

      {modalDoc && (
        <DocModal doc={modalDoc} tree={tree} editMode={editMode}
                  onClose={() => setModalDocId(null)} reload={load} />
      )}
    </div>
  );
}

function TopFolderCard({ folder, tree, editMode, onOpen, reload, onError }: {
  folder: FolderNode; tree: Tree; editMode: boolean;
  onOpen: () => void; reload: () => void; onError: (m: string) => void;
}) {
  const drop = useDropTarget(editMode, folder.id, reload, onError);
  const counts = tree.counts(folder.id);
  return (
    <button
      onClick={onOpen}
      {...dragProps(editMode, { kind: "folder", id: folder.id })}
      {...drop.props}
      style={{
        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
        padding: "16px 18px", textAlign: "left", cursor: "pointer",
        border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
        background: "var(--bg-secondary)", transition: "border-color .15s, box-shadow .15s",
        ...dropHighlight(drop.over),
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <FolderIcon />
      <span style={{ fontSize: 14, fontWeight: 600 }}>{folder.name}</span>
      <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{countLabel(counts)}</span>
    </button>
  );
}

function FolderIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// ─── Explorer modal ──────────────────────────────────────────

function FolderExplorer({ tree, startAt, editMode, docModalOpen, onOpenDoc, onClose, reload }: {
  tree: Tree; startAt: string | null; editMode: boolean; docModalOpen: boolean;
  onOpenDoc: (doc: PortfolioDoc) => void; onClose: () => void; reload: () => void;
}) {
  const [currentId, setCurrentId] = useState<string | null>(startAt);
  const [err, setErr] = useState("");
  const [newName, setNewName] = useState("");

  // Escape closes the explorer unless a note is open on top of it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !docModalOpen) onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose, docModalOpen]);

  // If the current folder disappears (deleted), fall back to its nearest parent that exists.
  const current = currentId ? tree.folder(currentId) : undefined;
  useEffect(() => { if (currentId && !current) setCurrentId(null); }, [currentId, current]);

  const crumbs = tree.path(currentId);
  const subfolders = tree.childFolders(currentId);
  const notes = tree.docsIn(currentId);

  async function createFolder() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch(`${API}/admin/folders`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify({ name, parent_id: currentId }),
    });
    if (res.ok) { setNewName(""); reload(); }
  }

  return (
    <div onClick={onClose} className="modal-backdrop" style={{ zIndex: 90 }}>
      <div onClick={e => e.stopPropagation()} className="modal explorer fade-in" role="dialog" aria-modal="true" aria-label="Modules explorer">
        {/* Header: breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <nav style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, flex: 1, minWidth: 0, fontSize: 13 }}>
            <Crumb label="Modules" active={currentId === null} folderId={null}
                   onClick={() => setCurrentId(null)} editMode={editMode} reload={reload} onError={setErr} />
            {crumbs.map((f, i) => (
              <span key={f.id} style={{ display: "contents" }}>
                <span style={{ color: "var(--fg-subtle)" }}>/</span>
                <Crumb label={f.name} active={i === crumbs.length - 1} folderId={f.id}
                       onClick={() => setCurrentId(f.id)} editMode={editMode} reload={reload} onError={setErr} />
              </span>
            ))}
          </nav>
          <button onClick={onClose} aria-label="Close explorer" className="icon-btn" style={{ fontSize: 22 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 20px" }}>
          {current && <FolderHeader key={current.id} folder={current} tree={tree} editMode={editMode} reload={reload} />}

          {subfolders.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {subfolders.map(f => (
                <FolderRow key={f.id} folder={f} tree={tree} editMode={editMode}
                           onOpen={() => setCurrentId(f.id)} reload={reload} onError={setErr} />
              ))}
            </div>
          )}

          {notes.length > 0 && (
            <div style={NOTE_GRID}>
              {notes.map(doc => (
                <DocCard key={doc.id} doc={doc} editMode={editMode} onOpen={() => onOpenDoc(doc)} />
              ))}
            </div>
          )}

          {subfolders.length === 0 && notes.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--fg-subtle)", fontStyle: "italic" }}>This folder is empty.</p>
          )}

          {editMode && (
            <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                     onKeyDown={e => e.key === "Enter" && createFolder()}
                     placeholder={current ? `New folder in ${current.name}…` : "New top-level folder…"}
                     style={{ ...inputStyle, maxWidth: 320 }} />
              <button onClick={createFolder} className="btn btn-secondary" style={{ fontSize: 12 }}>+ Add folder</button>
            </div>
          )}
          {err && <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 10 }}>{err}</p>}
        </div>
      </div>
    </div>
  );
}

function Crumb({ label, active, folderId, onClick, editMode, reload, onError }: {
  label: string; active: boolean; folderId: string | null; onClick: () => void;
  editMode: boolean; reload: () => void; onError: (m: string) => void;
}) {
  const drop = useDropTarget(editMode, folderId, reload, onError);
  return (
    <button onClick={onClick} {...drop.props} style={{
      background: "none", border: "1px solid transparent", borderRadius: "var(--radius-sm)",
      padding: "2px 6px", cursor: "pointer", fontSize: 13,
      fontWeight: active ? 600 : 400, color: active ? "var(--fg)" : "var(--fg-muted)",
      ...dropHighlight(drop.over),
    }}>{label}</button>
  );
}

function FolderRow({ folder, tree, editMode, onOpen, reload, onError }: {
  folder: FolderNode; tree: Tree; editMode: boolean;
  onOpen: () => void; reload: () => void; onError: (m: string) => void;
}) {
  const drop = useDropTarget(editMode, folder.id, reload, onError);
  return (
    <button onClick={onOpen} {...dragProps(editMode, { kind: "folder", id: folder.id })} {...drop.props} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
      padding: "11px 14px", cursor: "pointer", background: "var(--bg)",
      border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
      transition: "border-color .15s", ...dropHighlight(drop.over),
    }}
      onMouseEnter={e => { if (!drop.over) e.currentTarget.style.borderColor = "var(--border-strong)"; }}
      onMouseLeave={e => { if (!drop.over) e.currentTarget.style.borderColor = "var(--border)"; }}
    >
      <FolderIcon size={16} />
      <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {folder.name}
      </span>
      <CourseBadges f={folder} />
      <span style={{ fontSize: 11, color: "var(--fg-subtle)", whiteSpace: "nowrap" }}>{countLabel(tree.counts(folder.id))}</span>
      <span style={{ fontSize: 13, color: "var(--fg-subtle)" }}>›</span>
    </button>
  );
}

// Course details for the open folder, plus its editor in Curate mode.
function FolderHeader({ folder, tree, editMode, reload }: {
  folder: FolderNode; tree: Tree; editMode: boolean; reload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const showDetails = folder.is_course || folder.summary || folder.notes;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: showDetails ? 8 : 0 }}>
        <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{folder.name}</h3>
        <CourseBadges f={folder} />
        {editMode && !editing && (
          <button onClick={() => setEditing(true)} className="btn btn-ghost" style={{ fontSize: 12, marginLeft: "auto" }}>Edit folder</button>
        )}
      </div>
      {!editing && folder.summary && (
        <p style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.7, margin: "0 0 8px" }}>{folder.summary}</p>
      )}
      {!editing && folder.notes && (
        <div style={{ padding: "6px 10px", background: "var(--accent-light)", borderRadius: "var(--radius-sm)", border: "1px solid var(--accent-border)", display: "inline-block" }}>
          <p style={{ fontSize: 12, color: "var(--accent-text)", margin: 0 }}>{folder.notes}</p>
        </div>
      )}
      {editing && <FolderEditor folder={folder} tree={tree} onDone={() => setEditing(false)} reload={reload} />}
    </div>
  );
}

function FolderEditor({ folder, tree, onDone, reload }: {
  folder: FolderNode; tree: Tree; onDone: () => void; reload: () => void;
}) {
  const [draft, setDraft] = useState({
    name: folder.name, grade: folder.grade, summary: folder.summary, notes: folder.notes,
    is_course: folder.is_course, is_currently_learning: folder.is_currently_learning,
    parent_id: folder.parent_id ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [err, setErr] = useState("");

  // Can't move a folder under itself or its own descendants.
  const forbidden = new Set(tree.options.filter(o => tree.path(o.id).some(p => p.id === folder.id)).map(o => o.id));

  async function save() {
    setBusy(true); setErr("");
    const res = await fetch(`${API}/admin/folders/${folder.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify(draft),
    });
    setBusy(false);
    if (res.ok) { onDone(); reload(); }
    else setErr((await res.json().catch(() => null))?.detail || "Save failed.");
  }

  async function aiSummary() {
    setGenBusy(true); setErr("");
    const res = await fetch(`${API}/admin/folders/${folder.id}/generate-summary`, { method: "POST", credentials: "include" });
    setGenBusy(false);
    const data = await res.json().catch(() => null);
    if (res.ok && data?.summary) setDraft(d => ({ ...d, summary: data.summary }));   // draft only — edit, then Save
    else if (!res.ok) setErr(data?.detail || "Generation failed.");
  }

  async function remove() {
    if (!confirm(`Delete "${folder.name}"? Its subfolders and notes move up one level; nothing else is deleted.`)) return;
    const res = await fetch(`${API}/admin/folders/${folder.id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { onDone(); reload(); }
  }

  const label: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, border: "1px dashed var(--accent)", borderRadius: "var(--radius-md)", background: "var(--bg-secondary)" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Folder name" style={{ ...inputStyle, flex: 1 }} />
        {draft.is_course && (
          <input value={draft.grade} onChange={e => setDraft(d => ({ ...d, grade: e.target.value }))} placeholder="Grade (e.g. A)" style={{ ...inputStyle, width: 120 }} />
        )}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <label style={label}>
          <input type="checkbox" checked={draft.is_course} onChange={e => setDraft(d => ({ ...d, is_course: e.target.checked }))} />
          This folder is a course
        </label>
        {draft.is_course && (
          <label style={label}>
            <input type="checkbox" checked={draft.is_currently_learning} onChange={e => setDraft(d => ({ ...d, is_currently_learning: e.target.checked }))} />
            Currently learning
          </label>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>Inside</span>
        <select value={draft.parent_id} onChange={e => setDraft(d => ({ ...d, parent_id: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
          <option value="">Top level</option>
          {tree.options.filter(o => !forbidden.has(o.id)).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)" }}>Summary</span>
        <button onClick={aiSummary} disabled={genBusy} style={{ fontSize: 11, padding: "3px 10px", borderRadius: "var(--radius-sm)", background: "var(--accent-light)", color: "var(--accent-text)", border: "1px solid var(--accent-border)", cursor: "pointer", opacity: genBusy ? 0.5 : 1 }}>
          {genBusy ? "Generating…" : "Summarise from notes"}
        </button>
      </div>
      <textarea value={draft.summary} onChange={e => setDraft(d => ({ ...d, summary: e.target.value }))} rows={3} placeholder="Summary…"
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }} />
      <input value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} placeholder="Employer-facing note (optional)…" style={inputStyle} />
      {err && <p style={{ fontSize: 12, color: "var(--danger)" }}>{err}</p>}
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={save} disabled={busy} className="btn btn-primary" style={{ fontSize: 12 }}>{busy ? "Saving…" : "Save"}</button>
        <button onClick={onDone} className="btn btn-ghost" style={{ fontSize: 12 }}>Cancel</button>
        <button onClick={remove} className="btn btn-ghost" style={{ fontSize: 12, color: "var(--danger)", marginLeft: "auto" }}>Delete folder</button>
      </div>
    </div>
  );
}

// ─── Doc card (grid tile) ────────────────────────────────────

function DocCard({ doc, editMode, onOpen }: {
  doc: PortfolioDoc;
  editMode: boolean;
  onOpen: () => void;
}) {
  const synced = fmtSynced(doc.last_synced_at);

  return (
    <button
      onClick={onOpen}
      {...dragProps(editMode, { kind: "doc", id: doc.google_doc_id })}
      style={{
        display: "flex", flexDirection: "column", gap: 8, height: "100%",
        padding: "14px 16px", textAlign: "left", cursor: "pointer",
        border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
        background: "var(--bg-secondary)", transition: "border-color .15s, box-shadow .15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{doc.display_name}</span>
      </div>

      <p style={{
        fontSize: 12, color: "var(--fg-muted)", lineHeight: 1.6, margin: 0, flex: 1,
        display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>
        {doc.summary || <span style={{ fontStyle: "italic", color: "var(--fg-subtle)" }}>No summary yet.</span>}
      </p>

      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: "auto", paddingTop: 4 }}>
        <span style={{ fontSize: 10.5, color: (synced.stale && editMode) ? "var(--danger)" : "var(--fg-subtle)", fontWeight: (synced.stale && editMode) ? 600 : 400 }}>
          {synced.text}
        </span>
        {editMode && doc.needs_review && <span className="tag tag-gray" style={{ fontSize: 9 }}>review</span>}
        {editMode && doc.tag_status === "pending" && <span className="tag tag-gray" style={{ fontSize: 9 }}>untagged</span>}
        {editMode && doc.parse_status === "fallback" && (
          <span className="tag tag-gray" style={{ fontSize: 9 }} title="Multimodal parse failed — text in images is not searchable. Re-ingest to fix.">
            image text missing
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Doc modal (full detail + editor) ────────────────────────

function DocModal({ doc, tree, editMode, onClose, reload }: {
  doc: PortfolioDoc;
  tree: Tree;
  editMode: boolean;
  onClose: () => void;
  reload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(doc.summary);
  const [skills, setSkills] = useState<string[]>(doc.skills);
  const [newSkill, setNewSkill] = useState("");
  const [folderId, setFolderId] = useState<string>(doc.folder_id || "");
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [err, setErr] = useState("");

  const synced = fmtSynced(doc.last_synced_at);
  const location = tree.path(doc.folder_id).map(f => f.name).join(" / ");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [onClose]);

  // Re-sync local draft if the underlying doc changes (e.g. after reload).
  useEffect(() => {
    setSummary(doc.summary);
    setSkills(doc.skills);
    setFolderId(doc.folder_id || "");
  }, [doc]);

  async function generate() {
    setGenBusy(true); setErr("");
    const res = await fetch(`${API}/admin/documents/${doc.google_doc_id}/generate-tags`, {
      method: "POST", credentials: "include",
    });
    setGenBusy(false);
    if (res.ok) {
      const data = await res.json();
      setSummary(data.summary);   // drafts only — edit, then Save
      setSkills(data.skills);
    } else setErr("Generation failed — try again.");
  }

  async function save() {
    setBusy(true); setErr("");
    const res = await fetch(`${API}/admin/documents/${doc.google_doc_id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ summary, skills, folder_id: folderId }),
    });
    setBusy(false);
    if (res.ok) { setEditing(false); reload(); } else setErr("Save failed.");
  }

  const metaChip: React.CSSProperties = {
    fontSize: 11, padding: "3px 8px", borderRadius: 20,
    background: "var(--bg-tertiary)", color: "var(--fg-muted)",
  };

  return (
    <div onClick={onClose} className="modal-backdrop">
      <div onClick={e => e.stopPropagation()} className="modal fade-in" role="dialog" aria-modal="true" aria-labelledby="doc-modal-title">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <h3 id="doc-modal-title" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4, margin: 0 }}>{doc.display_name}</h3>
          <button ref={closeRef} onClick={onClose} aria-label="Close note" className="icon-btn" style={{ flexShrink: 0, fontSize: 20 }}>×</button>
        </div>
        {location && <p style={{ fontSize: 11.5, color: "var(--fg-subtle)", margin: "0 0 12px" }}>{location}</p>}

        {/* Meta row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          <span style={{ ...metaChip, ...((synced.stale && editMode) ? { background: "var(--danger-bg)", color: "var(--danger)" } : {}) }}>
            {synced.text}
          </span>
          {editMode && <span style={metaChip}>{doc.chunk_count ?? 0} chunk{doc.chunk_count === 1 ? "" : "s"}</span>}
          {editMode && doc.parse_status === "fallback" && (
            <span style={{ ...metaChip, background: "var(--danger-bg)", color: "var(--danger)" }} title="Multimodal parse failed — text in images is not searchable. Re-ingest to fix.">
              image text missing
            </span>
          )}
          {editMode && doc.parse_status === "multimodal" && <span style={metaChip}>multimodal parse</span>}
          {editMode && doc.needs_review && <span style={metaChip}>changed — review</span>}
          {editMode && (
            <span style={{ ...metaChip, ...(doc.tag_status === "approved" ? { background: "var(--success-bg)", color: "var(--success)" } : {}) }}>
              {doc.tag_status === "approved" ? "approved" : "untagged"}
            </span>
          )}
        </div>

        {!editing && (
          <>
            <p style={{ fontSize: 14, color: "var(--fg)", lineHeight: 1.75, marginBottom: skills.length ? 14 : 0 }}>
              {doc.summary || <span style={{ fontStyle: "italic", color: "var(--fg-subtle)" }}>No summary yet.</span>}
            </p>
            {doc.skills.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {doc.skills.map(s => <span key={s} className="tag tag-blue" style={{ fontSize: 11 }}>{s}</span>)}
              </div>
            )}
            {editMode && (
              <button onClick={() => setEditing(true)} className="btn btn-secondary" style={{ fontSize: 12, marginTop: 16 }}>
                Edit note
              </button>
            )}
          </>
        )}

        {editing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)" }}>Summary</p>
              <button
                onClick={generate} disabled={genBusy}
                style={{ fontSize: 11, padding: "3px 10px", borderRadius: "var(--radius-sm)", background: "var(--accent-light)", color: "var(--accent-text)", border: "1px solid var(--accent-border)", cursor: "pointer", opacity: genBusy ? 0.5 : 1 }}
              >
                {genBusy ? "Generating…" : "Generate suggestions"}
              </button>
            </div>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
            />
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)" }}>Skills</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {skills.map(s => (
                <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "3px 8px 3px 10px", borderRadius: 20, border: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
                  {s}
                  <button onClick={() => setSkills(list => list.filter(x => x !== s))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
            <input
              value={newSkill}
              onChange={e => setNewSkill(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && newSkill.trim()) {
                  if (!skills.includes(newSkill.trim())) setSkills(list => [...list, newSkill.trim()]);
                  setNewSkill("");
                }
              }}
              placeholder="Add skill…"
              style={inputStyle}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)" }}>Folder</span>
              <select
                value={folderId}
                onChange={e => setFolderId(e.target.value)}
                style={{ ...inputStyle, width: "auto", flex: 1 }}
              >
                <option value="">Top level</option>
                {tree.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            {err && <p style={{ fontSize: 12, color: "var(--danger)" }}>{err}</p>}
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={save} disabled={busy} className="btn btn-primary" style={{ fontSize: 12 }}>
                {busy ? "Saving…" : "Save & approve"}
              </button>
              <button onClick={() => setEditing(false)} className="btn btn-ghost" style={{ fontSize: 12 }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
