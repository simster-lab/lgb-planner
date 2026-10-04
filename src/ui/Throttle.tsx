import { useEffect, useId, useState } from "react";
import { dccexService } from "../dccex/client";
import { useEditor } from "../editor/store";
import type { RosterLoco } from "../model/types";
import { DraftNumberInput } from "./DraftNumberInput";

const FUNC_COUNT = 10;
const SPEED_UI_MAX = 100;
const SPEED_DCC_MAX = 126;
const SPEED_TICKS = [100, 75, 50, 25, 0] as const;

type CabCard = {
  id: string;
  cab: number | null;
  acquired: boolean;
  speed: number;
  forward: boolean;
  functions: boolean[];
};

let nextCardId = 0;

function newCardId(): string {
  nextCardId += 1;
  return `cab-${nextCardId}`;
}

function newCard(cab: number | null): CabCard {
  return {
    id: newCardId(),
    cab,
    acquired: false,
    speed: 0,
    forward: true,
    functions: Array.from({ length: FUNC_COUNT }, () => false),
  };
}

function toDccSpeed(percent: number): number {
  const clamped = Math.max(0, Math.min(SPEED_UI_MAX, percent));
  return Math.round((clamped * SPEED_DCC_MAX) / SPEED_UI_MAX);
}

function sendCabThrottle(address: number, speedPercent: number, forward: boolean): void {
  const dir = forward ? 1 : 0;
  dccexService.send(`<t ${address} ${toDccSpeed(speedPercent)} ${dir}>`);
}

function locoLabel(loco: RosterLoco): string {
  const name = loco.name.trim() || "Unnamed";
  return loco.address == null ? name : `${name} · ${loco.address}`;
}

function ThrottleCard({
  card,
  connected,
  canRemove,
  roster,
  onChange,
  onRemove,
}: {
  card: CabCard;
  connected: boolean;
  canRemove: boolean;
  roster: RosterLoco[];
  onChange: (next: CabCard) => void;
  onRemove: () => void;
}) {
  const live = connected && card.acquired && card.cab != null;

  const patch = (next: Partial<CabCard>) => onChange({ ...card, ...next });

  const dispense = (address: number | null, keepAddress = card.cab) => {
    if (connected && address != null) {
      dccexService.send(`<t ${address} 0 ${card.forward ? 1 : 0}>`);
      dccexService.send(`<- ${address}>`);
    }
    patch({ cab: keepAddress, acquired: false, speed: 0 });
  };

  const setCabAddress = (next: number | null) => {
    if (next === card.cab) return;
    if (card.acquired) dispense(card.cab, next);
    else patch({ cab: next });
  };

  const selectedLocoId =
    roster.find((loco) => loco.address != null && loco.address === card.cab)?.id ?? "";

  const pickLoco = (locoId: string) => {
    if (!locoId) {
      setCabAddress(null);
      return;
    }
    const loco = roster.find((item) => item.id === locoId);
    if (!loco || loco.address == null) return;
    setCabAddress(loco.address);
  };

  const acquire = () => {
    if (!connected || card.cab == null) return;
    dccexService.send(`<t ${card.cab}>`);
    sendCabThrottle(card.cab, card.speed, card.forward);
    patch({ acquired: true });
  };

  const setSpeed = (next: number) => {
    const speed = Math.max(0, Math.min(SPEED_UI_MAX, next));
    patch({ speed });
    if (live && card.cab != null) sendCabThrottle(card.cab, speed, card.forward);
  };

  const setDirection = (forward: boolean) => {
    patch({ forward });
    if (live && card.cab != null) sendCabThrottle(card.cab, card.speed, forward);
  };

  const toggleFn = (index: number) => {
    const next = !card.functions[index];
    patch({ functions: card.functions.map((on, i) => (i === index ? next : on)) });
    if (live && card.cab != null) dccexService.send(`<F ${card.cab} ${index} ${next ? 1 : 0}>`);
  };

  return (
    <section className="throttle-card" aria-label={card.cab == null ? "Throttle" : `Cab ${card.cab}`}>
      {canRemove ? (
        <button type="button" className="throttle-card-remove" onClick={onRemove} aria-label="Remove throttle">
          Remove
        </button>
      ) : null}

      <div className="throttle-speed-wrap">
        <span className="throttle-speed-caption">Speed</span>
        <div className="throttle-speed-grad">
          <div className="throttle-speed-ticks" aria-hidden="true">
            {SPEED_TICKS.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
          <input
            type="range"
            className="throttle-speed"
            min={0}
            max={SPEED_UI_MAX}
            step={1}
            value={card.speed}
            disabled={!live}
            aria-label="Speed"
            aria-valuemin={0}
            aria-valuemax={SPEED_UI_MAX}
            aria-valuenow={card.speed}
            aria-valuetext={`${card.speed}`}
            onChange={(event) => setSpeed(Number(event.target.value))}
          />
        </div>
        <span className="throttle-speed-value">{card.speed}</span>
      </div>

      <div className="throttle-main">
        <div className="throttle-row">
          {roster.length > 0 ? (
            <label className="field throttle-loco">
              <span>Loco</span>
              <select value={selectedLocoId} onChange={(event) => pickLoco(event.target.value)}>
                <option value="">Address…</option>
                {roster.map((loco) => (
                  <option key={loco.id} value={loco.id} disabled={loco.address == null}>
                    {locoLabel(loco)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="field throttle-cab">
            <span>DCC address</span>
            <DraftNumberInput
              value={card.cab}
              min={1}
              max={10239}
              restoreOnEmptyBlur={false}
              onValue={setCabAddress}
            />
          </label>
          <button
            type="button"
            className={card.acquired ? "throttle-cab-toggle dispense" : "throttle-cab-toggle acquire"}
            disabled={!connected || card.cab == null}
            onClick={() => (card.acquired ? dispense(card.cab) : acquire())}
          >
            {card.acquired ? "Dispense" : "Acquire"}
          </button>
          <button type="button" className={card.forward ? "active" : ""} disabled={!live} onClick={() => setDirection(true)}>
            Forward
          </button>
          <button
            type="button"
            className={!card.forward ? "active" : ""}
            disabled={!live}
            onClick={() => setDirection(false)}
          >
            Reverse
          </button>
          <button type="button" disabled={!live} onClick={() => setSpeed(0)}>
            Stop
          </button>
        </div>

        <div className="throttle-fns" role="group" aria-label="Functions">
          <button
            type="button"
            className={`throttle-fn-light${card.functions[0] ? " active" : ""}`}
            disabled={!live}
            onClick={() => toggleFn(0)}
          >
            Light
          </button>
          {card.functions.slice(1).map((on, offset) => {
            const index = offset + 1;
            return (
              <button key={index} type="button" className={on ? "active" : ""} disabled={!live} onClick={() => toggleFn(index)}>
                F{index}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Throttle() {
  const { dccexStatus, roster } = useEditor();
  const connected = dccexStatus === "connected";
  const powerSwitchId = useId();
  const [powerOn, setPowerOn] = useState(false);
  const [cards, setCards] = useState<CabCard[]>(() => [newCard(3)]);

  useEffect(() => {
    dccexService.onPower((on) => setPowerOn(on));
  }, []);

  useEffect(() => {
    if (!connected) {
      setCards((prev) => prev.map((card) => (card.acquired ? { ...card, acquired: false } : card)));
    }
  }, [connected]);

  const updateCard = (id: string, next: CabCard) => {
    setCards((prev) => prev.map((card) => (card.id === id ? next : card)));
  };

  const addCard = () => {
    setCards((prev) => [...prev, newCard(null)]);
  };

  const removeCard = (id: string) => {
    setCards((prev) => {
      if (prev.length <= 1) return prev;
      const card = prev.find((item) => item.id === id);
      if (card?.acquired && card.cab != null && connected) {
        dccexService.send(`<t ${card.cab} 0 ${card.forward ? 1 : 0}>`);
        dccexService.send(`<- ${card.cab}>`);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const setPower = (on: boolean) => {
    setPowerOn(on);
    if (connected) dccexService.send(on ? "<1>" : "<0>");
  };

  const emergencyStop = () => {
    if (connected) dccexService.send("<!>");
    setCards((prev) => prev.map((card) => (card.speed === 0 ? card : { ...card, speed: 0 })));
  };

  return (
    <aside className="throttle-dock" aria-label="DCC-EX controls">
      <div className="throttle-power-bar">
        <label className="power-switch" htmlFor={powerSwitchId}>
          <input
            id={powerSwitchId}
            type="checkbox"
            checked={powerOn}
            disabled={!connected}
            onChange={(event) => setPower(event.target.checked)}
          />
          <span>Track power {powerOn ? "on" : "off"}</span>
        </label>
        <button type="button" className="danger" disabled={!connected} onClick={emergencyStop}>
          Emergency stop
        </button>
        <span className="hint">{connected ? "DCC-EX connected" : "Connect DCC-EX to drive"}</span>
      </div>

      <div className="throttle-cards">
        {cards.map((card) => (
          <ThrottleCard
            key={card.id}
            card={card}
            connected={connected}
            canRemove={cards.length > 1}
            roster={roster}
            onChange={(next) => updateCard(card.id, next)}
            onRemove={() => removeCard(card.id)}
          />
        ))}
        <button type="button" className="throttle-add" onClick={addCard}>
          Add throttle
        </button>
      </div>
    </aside>
  );
}
