import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  inspectorOpen: boolean;
  selectedMessageId?: string;
  onlyUsedQuestions: boolean;
  spellcheck: boolean;
  /** Panel widths in px */
  sidebarWidth: number;
  inspectorWidth: number;
  toggleInspector: (open?: boolean) => void;
  select: (id: string | undefined) => void;
  setOnlyUsed: (v: boolean) => void;
  setSpellcheck: (v: boolean) => void;
  setSidebarWidth: (w: number) => void;
  setInspectorWidth: (w: number) => void;
}

export const SIDEBAR_WIDTH = { default: 256, min: 180, max: 480 };
export const INSPECTOR_WIDTH = { default: 520, min: 320, max: 1100 };

/**
 * UI state: panel visibility and widths, the selected message, and toggles. Everything but the
 * selection is persisted to localStorage.
 */
export const useUi = create<UiState>()(
  persist(
    (set) => ({
      inspectorOpen: true,
      selectedMessageId: undefined,
      onlyUsedQuestions: false,
      spellcheck: true,
      sidebarWidth: SIDEBAR_WIDTH.default,
      inspectorWidth: INSPECTOR_WIDTH.default,
      toggleInspector: (open) => set((s) => ({ inspectorOpen: open ?? !s.inspectorOpen })),
      select: (id) => set({ selectedMessageId: id, inspectorOpen: true }),
      setOnlyUsed: (v) => set({ onlyUsedQuestions: v }),
      setSpellcheck: (v) => set({ spellcheck: v }),
      setSidebarWidth: (w) => set({ sidebarWidth: w }),
      setInspectorWidth: (w) => set({ inspectorWidth: w }),
    }),
    {
      name: "jev-chat-ui",
      partialize: ({ selectedMessageId, ...settings }) => settings,
    },
  ),
);
