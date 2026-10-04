import { emptyRosterLoco, type RosterLoco } from "../model/types";
import { useEditor } from "../editor/store";
import { DraftNumberInput } from "./DraftNumberInput";

export function Roster({ onClose }: { onClose: () => void }) {
  const { roster, dispatch } = useEditor();

  const setLocos = (next: RosterLoco[]) => {
    dispatch({ type: "setRoster", roster: next });
  };

  const patch = (id: string, partial: Partial<RosterLoco>) => {
    setLocos(roster.map((loco) => (loco.id === id ? { ...loco, ...partial } : loco)));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal roster-modal" onClick={(event) => event.stopPropagation()}>
        <h2>Roster</h2>
        <p className="hint">Shared across layouts. Throttle picks a loco; RFID tags flash the name on the map.</p>
        {roster.length === 0 ? <p className="hint">No locos yet. Add one to name an address and RFID tag.</p> : null}
        {roster.length > 0 ? (
          <table className="roster-table">
            <thead>
              <tr>
                <th>DCC address</th>
                <th>Name</th>
                <th>RFID tag</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roster.map((loco) => (
                <tr key={loco.id}>
                  <td>
                    <DraftNumberInput
                      value={loco.address}
                      min={1}
                      max={10239}
                      restoreOnEmptyBlur={false}
                      onValue={(address) => patch(loco.id, { address })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={loco.name}
                      placeholder="Stainz"
                      onChange={(event) => patch(loco.id, { name: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={loco.tag}
                      placeholder="tag payload"
                      onChange={(event) => patch(loco.id, { tag: event.target.value })}
                    />
                  </td>
                  <td>
                    <button type="button" className="danger" onClick={() => setLocos(roster.filter((item) => item.id !== loco.id))}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <div className="row">
          <button type="button" onClick={() => setLocos([...roster, emptyRosterLoco()])}>
            Add loco
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
