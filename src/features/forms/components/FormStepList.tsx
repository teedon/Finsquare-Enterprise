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
  // Review is the submit step, so it always comes last and is never dragged.
  const review = steps.find((s) => s.kind === "review")
  const movable = steps.filter((s) => s.kind !== "review")
  const commit = (list: FormStep[]) => onChange(renumber(review ? [...list, review] : list))
  const move = (fromId: string, toId: string) => {
    const from = movable.findIndex((s) => s.id === fromId), to = movable.findIndex((s) => s.id === toId)
    if (from < 0 || to < 0) return
    commit(moveItem(movable, from, to))
  }
  const moveBy = (id: string, delta: number) => {
    const from = movable.findIndex((s) => s.id === id), to = from + delta
    if (from < 0 || to < 0 || to >= movable.length) return
    commit(moveItem(movable, from, to))
  }

  return (
    <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
      <b style={{ fontSize: 12, color: "var(--muted)", letterSpacing: ".05em" }}>STEPS</b>
      {steps.map((s, i) => {
        const pinned = s.kind === "review"
        const pos = movable.findIndex((x) => x.id === s.id)
        return (
          <div key={s.id} {...(pinned ? {} : dragProps("step", s.id, move))} onClick={() => onSelect(s.id)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 8, cursor: "pointer", border: `1px solid ${s.id === selectedId ? "var(--blue)" : "var(--line)"}`, background: s.id === selectedId ? "var(--blue-soft)" : "var(--surface)" }}>
            {pinned ? <LockKeyhole size={13} /> : <GripVertical size={14} />}
            <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{i + 1}. {s.title}</span>
            {!pinned && (
              <span style={{ display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
                <button type="button" aria-label="Move up" disabled={pos <= 0} onClick={() => moveBy(s.id, -1)}>↑</button>
                <button type="button" aria-label="Move down" disabled={pos >= movable.length - 1} onClick={() => moveBy(s.id, 1)}>↓</button>
              </span>
            )}
          </div>
        )
      })}
      <Button variant="secondary" icon={Plus} onClick={onAdd}>Add step</Button>
      <small style={{ color: "var(--muted)" }}>Required steps can’t be renamed or deleted. Drag any step except Review to reorder.</small>
    </div>
  )
}
