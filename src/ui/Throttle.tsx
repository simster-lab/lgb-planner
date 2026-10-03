import { useEffect, useState } from "react";
import { dccexService } from "../dccex/client";
import { useEditor } from "../editor/store";
import { DraftNumberInput } from "./DraftNumberInput";

const FUNC_COUNT = 13;
const MAX_SPEED = 126;

export function Throttle() {
  const { dccexStatus } = useEditor();
  const connected = dccexStatus === "connected";
  const [cab, setCab] = useState<number | null>(3);
  const [acquired, setAcquired] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [forward, setForward] = useState(true);
  const [functions, setFunctions] = useState(() => Array.from({ length: FUNC_COUNT }, () => false));
  const [powerOn, setPowerOn] = useState(false);

  useEffect(() => {
    dccexService.onPower((on) => setPowerOn(on));
  }, []);

  useEffect(() => {
    if (!connected) setAcquired(false);
  }, [connected]);

  const live = connected && acquired && cab != null;

  const sendThrottle = (nextSpeed: number, nextForward: boolean, address = cab) => {
    if (address == null) return;
    const dir = nextForward ? 1 : 0;
    dccexService.send(`<t ${address} ${nextSpeed} ${dir}>`);
  };

  const dispenseCab = (address: number | null) => {
    if (connected && address != null) {
      const dir = forward ? 1 : 0;
      dccexService.send(`<t ${address} 0 ${dir}>`);
      dccexService.send(`<- ${address}>`);
    }
    setSpeed(0);
    setAcquired(false);
  };

  const setCabAddress = (next: number | null) => {
    if (next === cab) return;
    if (acquired) dispenseCab(cab);
    setCab(next);
  };

  const acquireCab = () => {
    if (!connected || cab == null) return;
    dccexService.send(`<t ${cab}>`);
    sendThrottle(speed, forward);
    setAcquired(true);
  };

  const setSpeedAndSend = (next: number) => {
    const speedValue = Math.max(0, Math.min(MAX_SPEED, next));
    setSpeed(speedValue);
    if (live) sendThrottle(speedValue, forward);
  };

  const setDirection = (nextForward: boolean) => {
    setForward(nextForward);
    if (live) sendThrottle(speed, nextForward);
  };

  const toggleFn = (index: number) => {
    const next = !functions[index];
    setFunctions((prev) => prev.map((on, i) => (i === index ? next : on)));
    if (live) dccexService.send(`<F ${cab} ${index} ${next ? 1 : 0}>`);
  };

  const setPower = (on: boolean) => {
    setPowerOn(on);
    if (connected) dccexService.send(on ? "<1>" : "<0>");
  };

  return (
    <aside className="throttle" aria-label="DCC-EX throttle">
      <div className="throttle-speed-wrap">
        <label className="throttle-speed-label">
          Speed
          <input
            type="range"
            className="throttle-speed"
            min={0}
            max={MAX_SPEED}
            value={speed}
            disabled={!live}
            aria-valuetext={`${speed}`}
            onChange={(event) => setSpeedAndSend(Number(event.target.value))}
          />
          <span className="throttle-speed-value">{speed}</span>
        </label>
      </div>

      <div className="throttle-main">
        <div className="throttle-row">
          <label className="field throttle-cab">
            <span>DCC address</span>
            <DraftNumberInput
              value={cab}
              min={1}
              max={10239}
              restoreOnEmptyBlur={false}
              onValue={setCabAddress}
            />
          </label>
          <button
            type="button"
            className={acquired ? "active" : ""}
            disabled={!connected || cab == null || acquired}
            onClick={acquireCab}
          >
            Acquire
          </button>
          <button
            type="button"
            className={!acquired ? "active" : ""}
            disabled={!connected || !acquired}
            onClick={() => dispenseCab(cab)}
          >
            Dispense
          </button>
          <button type="button" className={forward ? "active" : ""} disabled={!live} onClick={() => setDirection(true)}>
            Forward
          </button>
          <button type="button" className={!forward ? "active" : ""} disabled={!live} onClick={() => setDirection(false)}>
            Reverse
          </button>
          <button type="button" disabled={!live} onClick={() => setSpeedAndSend(0)}>
            Stop
          </button>
        </div>

        <div className="throttle-row throttle-fns" role="group" aria-label="Functions">
          {functions.map((on, index) => (
            <button
              key={index}
              type="button"
              className={on ? "active" : ""}
              disabled={!live}
              onClick={() => toggleFn(index)}
            >
              F{index}
            </button>
          ))}
        </div>

        <div className="throttle-row">
          <button type="button" className={powerOn ? "active" : ""} disabled={!connected} onClick={() => setPower(true)}>
            Track power on
          </button>
          <button type="button" className={!powerOn ? "active" : ""} disabled={!connected} onClick={() => setPower(false)}>
            Track power off
          </button>
          <span className="hint">
            {!connected
              ? "Connect DCC-EX to drive"
              : cab == null
                ? "Enter a DCC address"
                : acquired
                  ? `Cab ${cab} acquired`
                  : `Acquire cab ${cab} to drive`}
          </span>
        </div>
      </div>
    </aside>
  );
}
