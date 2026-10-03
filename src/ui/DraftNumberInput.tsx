import { useEffect, useState } from "react";

type Props = {
  value: number | null;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  restoreOnEmptyBlur?: boolean;
  onValue: (value: number | null) => void;
};

function clamp(value: number, min?: number, max?: number): number {
  let next = value;
  if (min != null) next = Math.max(min, next);
  if (max != null) next = Math.min(max, next);
  return Math.round(next);
}

function inRange(value: number, min?: number, max?: number): boolean {
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

export function DraftNumberInput({
  value,
  min,
  max,
  step,
  disabled,
  restoreOnEmptyBlur = true,
  onValue,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? "" : String(value));

  useEffect(() => {
    setDraft(null);
  }, [value]);

  const commitRaw = (raw: string, clampOutOfRange: boolean): boolean => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      if (!restoreOnEmptyBlur) onValue(null);
      return trimmed === raw;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return false;
    if (!clampOutOfRange && !inRange(parsed, min, max)) return false;
    onValue(clamp(parsed, min, max));
    return true;
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={shown}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        if (raw.trim() === "") {
          if (!restoreOnEmptyBlur) onValue(null);
          return;
        }
        commitRaw(raw, false);
      }}
      onBlur={() => {
        if (draft == null) return;
        if (draft.trim() === "") {
          if (restoreOnEmptyBlur) setDraft(null);
          else onValue(null);
          return;
        }
        commitRaw(draft, true);
        setDraft(null);
      }}
    />
  );
}
