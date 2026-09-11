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
  LayoutDocument,
  LayoutPiece,
  MqttConnectionStatus,
  Placing,
  PointState,
  SignalState,
  ViewState,
} from "../model/types";
import { defaultBrokerConfig, emptyLayout } from "../model/types";
import { loadAutosave, writeAutosave } from "../persist/io";
import { fetchCurrentCircuit, saveCurrentCircuit } from "../persist/remote";
import { loadRuntimeConfig } from "../config";
import { resetPointSerial } from "./pieceFactory";

const MAX_HISTORY = 80;

export interface EditorState {
  layout: LayoutDocument;
  selectedId: string | null;
  placing: Placing | null;
  view: ViewState;
  mqttStatus: MqttConnectionStatus;
  mqttError?: string;
  settingsOpen: boolean;
  circuitName: string | null;
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
  | { type: "previewPiece"; piece: LayoutPiece }
  | { type: "deleteSelected" }
  | { type: "select"; id: string | null }
  | { type: "setPlacing"; placing: Placing | null }
  | { type: "setView"; view: Partial<ViewState> }
  | { type: "setMqttSettings"; mqtt: BrokerConfig }
  | { type: "setMqttStatus"; status: MqttConnectionStatus; message?: string }
  | { type: "setSettingsOpen"; open: boolean }
  | { type: "setCircuitName"; name: string | null }
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
      resetPointSerial([]);
      return {
        ...withHistory(state, layout),
        selectedId: null,
        placing: null,
        circuitName: null,
      };
    }
    case "loadLayout":
      resetPointSerial(action.layout.pieces);
      return {
        ...withHistory(state, action.layout),
        selectedId: null,
        placing: null,
        circuitName: action.name === undefined ? state.circuitName : action.name,
      };
    case "addPiece":
      return {
        ...withHistory(state, {
          ...state.layout,
          pieces: [...state.layout.pieces, action.piece],
        }),
        selectedId: action.piece.id,
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
    case "deleteSelected":
      if (!state.selectedId) return state;
      return {
        ...withHistory(state, {
          ...state.layout,
          pieces: state.layout.pieces.filter((piece) => piece.id !== state.selectedId),
        }),
        selectedId: null,
      };
    case "select":
      return { ...state, selectedId: action.id };
    case "setPlacing":
      return {
        ...state,
        placing: action.placing,
        selectedId: action.placing ? null : state.selectedId,
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
    case "setMqttStatus":
      return { ...state, mqttStatus: action.status, mqttError: action.message };
    case "setSettingsOpen":
      return { ...state, settingsOpen: action.open };
    case "setCircuitName":
      return { ...state, circuitName: action.name };
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        layout: previous,
        past: state.past.slice(0, -1),
        future: [state.layout, ...state.future],
        selectedId: null,
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
        selectedId: null,
      };
    }
    default:
      return state;
  }
}

const initialState: EditorState = {
  layout: emptyLayout(),
  selectedId: null,
  placing: null,
  view: defaultView,
  mqttStatus: "disconnected",
  settingsOpen: false,
  circuitName: null,
  past: [],
  future: [],
};

interface EditorContextValue extends EditorState {
  selected: LayoutPiece | undefined;
  dispatch: Dispatch<EditorAction>;
  addPiece: (piece: LayoutPiece) => void;
  updatePiece: (id: string, patch: Partial<LayoutPiece>) => void;
  replacePiece: (piece: LayoutPiece) => void;
  previewPiece: (piece: LayoutPiece) => void;
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

  const selected = state.layout.pieces.find((piece) => piece.id === state.selectedId);

  const value = useMemo<EditorContextValue>(() => {
    return {
      ...state,
      selected,
      dispatch,
      addPiece: (piece) => dispatch({ type: "addPiece", piece }),
      updatePiece: (id, patch) => dispatch({ type: "updatePiece", id, patch }),
      replacePiece: (piece) => dispatch({ type: "replacePiece", piece }),
      previewPiece: (piece) => dispatch({ type: "previewPiece", piece }),
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
