import { GripVertical, LockKeyhole, Plus } from "@/icons"
import { Button } from "@/components/ui"
import { moveItem, renumber } from "../domain/forms"
import { dragProps } from "./dragProps"
import type { FormStep } from "../types/form.types"

interface Props {
  steps: FormStep[]
  selectedId: string
  onSelect: (id: string) => void
  onChange: (steps: FormStep[]) => void
  onAdd: () => void
}

export function FormStepList({ steps, selectedId, onSelect, onChange, onAdd }: Props) {
  const move = (fromId: string, toId: string) => {
    const a = steps.find((s) => s.id === fromId), b = steps.find((s) => s.id === toId)
    if (a?.type !== "custom" || b?.type !== "custom") return
    onChange(renumber(moveItem(steps, steps.indexOf(a), steps.indexOf(b))))
  }
  return (
    <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
      <b style={{ fontSize: 12, color: "var(--muted)", letterSpacing: ".05em" }}>STEPS</b>
      {steps.map((s, i) => {
        const custom = s.type === "custom"
        return (
          <div key={s.id} {...(custom ? dragProps("step", s.id, move) : {})} onClick={() => onSelect(s.id)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 8, cursor: "pointer", border: `1px solid ${s.id === selectedId ? "var(--blue)" : "var(--line)"}`, background: s.id === selectedId ? "var(--blue-soft)" : "var(--surface)" }}>
            {custom ? <GripVertical size={14} /> : <LockKeyhole size={13} />}
            <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{i + 1}. {s.title}</span>
            {custom && (
              <span style={{ display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
                <button type="button" aria-label="Move up" disabled={steps[i - 1]?.type !== "custom"} onClick={() => move(s.id, steps[i - 1].id)}>↑</button>
                <button type="button" aria-label="Move down" disabled={steps[i + 1]?.type !== "custom"} onClick={() => move(s.id, steps[i + 1].id)}>↓</button>
              </span>
            )}
          </div>
        )
      })}
      <Button variant="secondary" icon={Plus} onClick={onAdd}>Add step</Button>
      <small style={{ color: "var(--muted)" }}>Locked steps are required by FinSquare. Drag custom steps to reorder them.</small>
    </div>
  )
}
