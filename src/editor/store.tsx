import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import type {
  BrokerConfig,
  DccexConfig,
  EditorMode,
  LayoutDocument,
  LayoutPiece,
  MqttConnectionStatus,
  Placing,
  PointState,
  SignalState,
  ViewState,
} from "../model/types";
import { defaultBrokerConfig, defaultDccexConfig, emptyLayout } from "../model/types";
import { loadAutosave, writeAutosave } from "../persist/io";
import { fetchCurrentCircuit, saveCurrentCircuit } from "../persist/remote";
import { loadRuntimeConfig } from "../config";
import { piecesRelativeToCenter, rotatePieces, snapshotPieces } from "./selection";
import { resetPointSerial } from "./pieceFactory";

const MAX_HISTORY = 80;

export interface EditorState {
  layout: LayoutDocument;
  selectedIds: string[];
  placing: Placing | null;
  view: ViewState;
  mqttStatus: MqttConnectionStatus;
  mqttError?: string;
  dccexStatus: MqttConnectionStatus;
  dccexError?: string;
  settingsOpen: boolean;
  circuitName: string | null;
  editorMode: EditorMode;
  clipboard: LayoutPiece[];
  pasting: LayoutPiece[] | null;
  past: LayoutDocument[];
  future: LayoutDocument[];
}

type EditorAction =
  | { type: "hydrate"; layout: LayoutDocument; name?: string | null }
  | { type: "newLayout" }
  | { type: "loadLayout"; layout: LayoutDocument; name?: string | null }
  | { type: "addPiece"; piece: LayoutPiece }
  | { type: "updatePiece"; id: string; patch: Partial<LayoutPiece> }
  | { type: "replacePiece"; piece: LayoutPiece }
  | { type: "replacePieces"; pieces: LayoutPiece[] }
  | { type: "previewPiece"; piece: LayoutPiece }
  | { type: "previewPieces"; pieces: LayoutPiece[] }
  | { type: "deleteSelected" }
  | { type: "select"; id: string | null; additive?: boolean }
  | { type: "setSelection"; ids: string[] }
  | { type: "setPlacing"; placing: Placing | null }
  | { type: "setView"; view: Partial<ViewState> }
  | { type: "setMqttSettings"; mqtt: BrokerConfig }
  | { type: "setDccexSettings"; dccex: DccexConfig }
  | { type: "setMqttStatus"; status: MqttConnectionStatus; message?: string }
  | { type: "setDccexStatus"; status: MqttConnectionStatus; message?: string }
  | { type: "setSettingsOpen"; open: boolean }
  | { type: "setCircuitName"; name: string | null }
  | { type: "setEditorMode"; mode: EditorMode }
  | { type: "copySelected" }
  | { type: "pasteClipboard" }
  | { type: "setPasting"; pieces: LayoutPiece[] | null }
  | { type: "rotatePasting"; degrees: number }
  | { type: "addPieces"; pieces: LayoutPiece[] }
  | { type: "rotateSelected"; degrees: number }
  | { type: "selectAll" }
  | { type: "undo" }
  | { type: "redo" };

const defaultView: ViewState = { panX: -400, panY: -250, zoom: 0.55 };

function withHistory(state: EditorState, layout: LayoutDocument): EditorState {
  return {
    ...state,
    layout,
    past: [...state.past, state.layout].slice(-MAX_HISTORY),
    future: [],
  };
}

function applyPieceMap(pieces: LayoutPiece[], next: LayoutPiece[]): LayoutPiece[] {
  const map = new Map(next.map((piece) => [piece.id, piece]));
  return pieces.map((piece) => map.get(piece.id) ?? piece);
}

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "hydrate":
      resetPointSerial(action.layout.pieces);
      return {
        ...state,
        layout: action.layout,
        circuitName: action.name ?? null,
        past: [],
        future: [],
      };
    case "newLayout": {
      const layout = emptyLayout();
      layout.settings.mqtt = state.layout.settings.mqtt ?? defaultBrokerConfig();
      layout.settings.dccex = state.layout.settings.dccex ?? defaultDccexConfig();
      resetPointSerial([]);
      return {
        ...withHistory(state, layout),
        selectedIds: [],
        placing: null,
        pasting: null,
        circuitName: null,
      };
    }
    case "loadLayout":
      resetPointSerial(action.layout.pieces);
      return {
        ...withHistory(state, action.layout),
        selectedIds: [],
        placing: null,
        pasting: null,
        circuitName: action.name === undefined ? state.circuitName : action.name,
      };
    case "addPiece":
      return {
        ...withHistory(state, {
          ...state.layout,
          pieces: [...state.layout.pieces, action.piece],
        }),
        selectedIds: [action.piece.id],
        placing: state.placing ? { ...state.placing, snapCycle: 0 } : state.placing,
      };
    case "updatePiece":
      return withHistory(state, {
        ...state.layout,
        pieces: state.layout.pieces.map((piece) =>
          piece.id === action.id ? { ...piece, ...action.patch } : piece,
        ),
      });
    case "replacePiece":
      return withHistory(state, {
        ...state.layout,
        pieces: state.layout.pieces.map((piece) =>
          piece.id === action.piece.id ? action.piece : piece,
        ),
      });
    case "replacePieces":
      return withHistory(state, {
        ...state.layout,
        pieces: applyPieceMap(state.layout.pieces, action.pieces),
      });
    case "previewPiece":
      return {
        ...state,
        layout: {
          ...state.layout,
          pieces: state.layout.pieces.map((piece) =>
            piece.id === action.piece.id ? action.piece : piece,
          ),
        },
      };
    case "previewPieces":
      return {
        ...state,
        layout: {
          ...state.layout,
          pieces: applyPieceMap(state.layout.pieces, action.pieces),
        },
      };
    case "deleteSelected":
      if (state.selectedIds.length === 0) return state;
      return {
        ...withHistory(state, {
          ...state.layout,
          pieces: state.layout.pieces.filter((piece) => !state.selectedIds.includes(piece.id)),
        }),
        selectedIds: [],
      };
    case "select":
      if (action.id == null) return { ...state, selectedIds: [] };
      if (action.additive) {
        const has = state.selectedIds.includes(action.id);
        return {
          ...state,
          selectedIds: has
            ? state.selectedIds.filter((id) => id !== action.id)
            : [...state.selectedIds, action.id],
        };
      }
      return { ...state, selectedIds: [action.id] };
    case "setSelection":
      return { ...state, selectedIds: action.ids };
    case "setPlacing":
      return {
        ...state,
        placing: action.placing,
        pasting: null,
        selectedIds: action.placing ? [] : state.selectedIds,
      };
    case "setView":
      return { ...state, view: { ...state.view, ...action.view } };
    case "setMqttSettings":
      return {
        ...state,
        layout: {
          ...state.layout,
          settings: { ...state.layout.settings, mqtt: action.mqtt },
        },
      };
    case "setDccexSettings":
      return {
        ...state,
        layout: {
          ...state.layout,
          settings: { ...state.layout.settings, dccex: action.dccex },
        },
      };
    case "setMqttStatus":
      return { ...state, mqttStatus: action.status, mqttError: action.message };
    case "setDccexStatus":
      return { ...state, dccexStatus: action.status, dccexError: action.message };
    case "setSettingsOpen":
      return { ...state, settingsOpen: action.open };
    case "setCircuitName":
      return { ...state, circuitName: action.name };
    case "setEditorMode":
      return {
        ...state,
        editorMode: action.mode,
        placing: action.mode === "run" ? null : state.placing,
        pasting: action.mode === "run" ? null : state.pasting,
      };
    case "copySelected": {
      const pieces = state.layout.pieces.filter((piece) => state.selectedIds.includes(piece.id));
      if (pieces.length === 0) return state;
      return { ...state, clipboard: snapshotPieces(pieces) };
    }
    case "pasteClipboard": {
      if (state.clipboard.length === 0) return state;
      return {
        ...state,
        placing: null,
        selectedIds: [],
        pasting: piecesRelativeToCenter(state.clipboard),
      };
    }
    case "setPasting":
      return {
        ...state,
        pasting: action.pieces,
        placing: action.pieces ? null : state.placing,
      };
    case "rotatePasting":
      if (!state.pasting?.length) return state;
      return {
        ...state,
        pasting: rotatePieces(state.pasting, action.degrees, { x: 0, y: 0 }),
      };
    case "addPieces":
      if (action.pieces.length === 0) return state;
      return {
        ...withHistory(state, {
          ...state.layout,
          pieces: [...state.layout.pieces, ...action.pieces],
        }),
        selectedIds: action.pieces.map((piece) => piece.id),
        pasting: null,
        placing: null,
      };
    case "rotateSelected": {
      const selected = state.layout.pieces.filter((piece) => state.selectedIds.includes(piece.id));
      if (selected.length === 0) return state;
      return withHistory(state, {
        ...state.layout,
        pieces: applyPieceMap(state.layout.pieces, rotatePieces(selected, action.degrees)),
      });
    }
    case "selectAll":
      return {
        ...state,
        placing: null,
        pasting: null,
        selectedIds: state.layout.pieces.map((piece) => piece.id),
      };
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        layout: previous,
        past: state.past.slice(0, -1),
        future: [state.layout, ...state.future],
        selectedIds: [],
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        layout: next,
        past: [...state.past, state.layout],
        future: state.future.slice(1),
        selectedIds: [],
      };
    }
    default:
      return state;
  }
}

const initialState: EditorState = {
  layout: emptyLayout(),
  selectedIds: [],
  placing: null,
  view: defaultView,
  mqttStatus: "disconnected",
  dccexStatus: "disconnected",
  settingsOpen: false,
  circuitName: null,
  editorMode: "plan",
  clipboard: [],
  pasting: null,
  past: [],
  future: [],
};

interface EditorContextValue extends EditorState {
  selected: LayoutPiece | undefined;
  dispatch: Dispatch<EditorAction>;
  addPiece: (piece: LayoutPiece) => void;
  updatePiece: (id: string, patch: Partial<LayoutPiece>) => void;
  replacePiece: (piece: LayoutPiece) => void;
  replacePieces: (pieces: LayoutPiece[]) => void;
  previewPiece: (piece: LayoutPiece) => void;
  previewPieces: (pieces: LayoutPiece[]) => void;
  togglePoint: (id: string, next?: PointState) => PointState | undefined;
  toggleSignal: (id: string, next?: SignalState) => SignalState | undefined;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadRuntimeConfig();
      if (cancelled) return;
      const remote = await fetchCurrentCircuit();
      if (cancelled) return;
      if (remote !== "missing" && remote !== "offline") {
        dispatch({ type: "hydrate", layout: remote.layout, name: remote.name });
        setHydrated(true);
        return;
      }
      const saved = loadAutosave();
      dispatch({ type: "hydrate", layout: saved ?? emptyLayout(), name: null });
      setHydrated(true);
      if (remote === "missing" && saved) {
        void saveCurrentCircuit(saved, null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeAutosave(state.layout);
    const timer = window.setTimeout(() => {
      void saveCurrentCircuit(state.layout, state.circuitName);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [hydrated, state.layout, state.circuitName]);

  const selectedId = state.selectedIds.at(-1);
  const selected = state.layout.pieces.find((piece) => piece.id === selectedId);

  const value = useMemo<EditorContextValue>(() => {
    return {
      ...state,
      selected,
      dispatch,
      addPiece: (piece) => dispatch({ type: "addPiece", piece }),
      updatePiece: (id, patch) => dispatch({ type: "updatePiece", id, patch }),
      replacePiece: (piece) => dispatch({ type: "replacePiece", piece }),
      replacePieces: (pieces) => dispatch({ type: "replacePieces", pieces }),
      previewPiece: (piece) => dispatch({ type: "previewPiece", piece }),
      previewPieces: (pieces) => dispatch({ type: "previewPieces", pieces }),
      togglePoint: (id, next) => {
        const piece = state.layout.pieces.find((item) => item.id === id);
        if (!piece || piece.type !== "point") return undefined;
        const resolved: PointState =
          next ?? (piece.pointState === "diverge" ? "through" : "diverge");
        dispatch({ type: "updatePiece", id, patch: { pointState: resolved } });
        return resolved;
      },
      toggleSignal: (id, next) => {
        const piece = state.layout.pieces.find((item) => item.id === id);
        if (!piece || piece.type !== "signal") return undefined;
        const resolved: SignalState =
          next ?? (piece.signalState === "clear" ? "danger" : "clear");
        dispatch({ type: "updatePiece", id, patch: { signalState: resolved } });
        return resolved;
      },
    };
  }, [state, selected]);

  return (
    <EditorContext.Provider value={value}>
      {hydrated ? children : <div className="app loading-layout">Loading layout…</div>}
    </EditorContext.Provider>
  );
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used within EditorProvider");
  return ctx;
}
