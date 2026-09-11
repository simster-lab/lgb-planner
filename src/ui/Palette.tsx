import { CURVES, POINTS, SIGNALS } from "../catalog/lgb";
import { useEditor } from "../editor/store";
import type { CatalogSku, Placing } from "../model/types";

const CURVE_ORDER = ["11000", "15000", "16000"] as const;
const POINT_ORDER = ["12100", "12000", "16140", "16040"] as const;

function isActive(placing: Placing | null, type: Placing["type"], sku?: CatalogSku): boolean {
  if (!placing || placing.type !== type) return false;
  if (sku) return placing.sku === sku;
  return true;
}

export function Palette() {
  const { placing, dispatch } = useEditor();
  const length = placing?.type === "straight" ? placing.lengthMm ?? 300 : 300;

  const setPlacing = (next: Placing) => {
    dispatch({
      type: "setPlacing",
      placing: isActive(placing, next.type, next.sku) ? null : next,
    });
  };

  return (
    <aside className="panel palette">
      <h2>Track</h2>
      <button
        type="button"
        className={isActive(placing, "straight") ? "active" : ""}
        onClick={() => setPlacing({ type: "straight", lengthMm: length })}
      >
        Custom straight
      </button>
      <label className="field">
        <span>Length (mm)</span>
        <input
          type="number"
          min={10}
          max={8000}
          step={1}
          value={length}
          onChange={(event) => {
            const lengthMm = Math.max(1, Number(event.target.value) || 300);
            if (placing?.type === "straight") {
              dispatch({ type: "setPlacing", placing: { ...placing, lengthMm } });
            } else {
              dispatch({ type: "setPlacing", placing: { type: "straight", lengthMm } });
            }
          }}
        />
      </label>

      <h3>Curves</h3>
      {CURVE_ORDER.map((sku) => (
        <button
          key={sku}
          type="button"
          className={isActive(placing, "curve", sku) ? "active" : ""}
          onClick={() => setPlacing({ type: "curve", sku, hand: "left" })}
        >
          {CURVES[sku].label}
          <small>LGB {sku}</small>
        </button>
      ))}

      <h3>Points</h3>
      {POINT_ORDER.map((sku) => (
        <button
          key={sku}
          type="button"
          className={isActive(placing, "point", sku) ? "active" : ""}
          onClick={() => setPlacing({ type: "point", sku, hand: POINTS[sku].hand })}
        >
          {POINTS[sku].label}
          <small>LGB {sku}</small>
        </button>
      ))}

      <h3>Signals</h3>
      {(["sema-2", "light-2"] as const).map((sku) => (
        <button
          key={sku}
          type="button"
          className={isActive(placing, "signal", sku) ? "active" : ""}
          onClick={() => setPlacing({ type: "signal", sku, hand: "right" })}
        >
          {SIGNALS[sku].label}
          <small>{sku === "sema-2" ? "Arm danger / clear" : "Red / green"}</small>
        </button>
      ))}

      <p className="hint">
        Pieces snap at joiners. Signals stand upright above the track, or on the right of vertical track. F flips curves and points. Wheel zooms, drag empty canvas to pan.
      </p>
    </aside>
  );
}
