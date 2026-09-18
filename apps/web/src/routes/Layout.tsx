import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router";

import type { ServerStatus } from "../api.ts";
import { ResizeHandle } from "../components/ui/ResizeHandle.tsx";
import {
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useTools,
} from "../queries.ts";
import { SIDEBAR_WIDTH, useUi } from "../store.ts";

const STATUS: Record<ServerStatus["status"], { dot: string; note?: string }> = {
  connected: { dot: "status-success" },
  missing_env: { dot: "status-warning", note: "no key" },
  error: { dot: "status-error", note: "error" },
};

/** The app shell: a resizable sidebar of chats and tool status, a header, and the route. */
export function Layout() {
  const { data: conversations } = useConversations();
  const { data: tools } = useTools();
  const create = useCreateConversation();
  const remove = useDeleteConversation();
  const navigate = useNavigate();
  const { id } = useParams();
  const {
    inspectorOpen,
    toggleInspector,
    spellcheck,
    setSpellcheck,
    sidebarWidth,
    setSidebarWidth,
  } = useUi();

  return (
    <div className="flex h-full bg-base-200">
      <aside
        className="relative hidden shrink-0 flex-col border-r border-base-300 bg-base-100 md:flex"
        style={{ width: sidebarWidth }}
      >
        <ResizeHandle
          edge="right"
          label="Resize the sidebar"
          width={sidebarWidth}
          min={SIDEBAR_WIDTH.min}
          max={SIDEBAR_WIDTH.max}
          defaultWidth={SIDEBAR_WIDTH.default}
          onResize={setSidebarWidth}
        />
        <Link to="/" className="flex items-center gap-2 px-4 py-4">
          <span className="grid size-8 place-items-center rounded-lg bg-primary font-bold text-primary-content">
            J
          </span>
          <span className="text-lg font-semibold">Jev Chat</span>
        </Link>
        <div className="px-3">
          <button
            className="btn btn-primary btn-sm w-full"
            disabled={create.isPending}
            onClick={async () => navigate(`/c/${(await create.mutateAsync()).id}`)}
          >
            + New chat
          </button>
        </div>
        <ul className="menu menu-sm w-full flex-1 flex-nowrap overflow-y-auto overflow-x-hidden">
          {conversations?.map((c) => (
            <li key={c.id} className="group">
              <NavLink to={`/c/${c.id}`} className="flex min-w-0 justify-between">
                <span className="truncate">{c.title}</span>
                <button
                  type="button"
                  aria-label={`Delete ${c.title}`}
                  className="invisible text-base-content/50 hover:text-error group-hover:visible"
                  onClick={async (e) => {
                    e.preventDefault();
                    await remove.mutateAsync(c.id);
                    if (c.id === id) await navigate("/");
                  }}
                >
                  ✕
                </button>
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="border-t border-base-300 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/50">
            Tools
          </div>
          <ul className="space-y-1 text-sm">
            {tools?.servers.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2"
                title={s.missingEnv?.join(", ") ?? s.error ?? `${s.tools.length} tools`}
              >
                <span className={`status ${STATUS[s.status].dot}`} />
                <span className="flex-1">{s.label}</span>
                {STATUS[s.status].note && (
                  <span className="text-xs text-base-content/50">{STATUS[s.status].note}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-2 border-b border-base-300 bg-base-100 px-4 py-2">
          <span className="mr-auto text-sm text-base-content/60">
            Jev picks from options code supplies. No LLM writes text.
          </span>
          <label
            className="label cursor-pointer gap-2 text-sm text-base-content"
            title="Before each message, fix sure misspellings and let Jev pick a correction or keep each remaining unknown word"
          >
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={spellcheck}
              onChange={(e) => setSpellcheck(e.target.checked)}
            />
            Spell check
          </label>
          <button
            className={`btn btn-sm ${inspectorOpen ? "btn-active" : "btn-ghost"}`}
            onClick={() => toggleInspector()}
          >
            Jev inspector
          </button>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
