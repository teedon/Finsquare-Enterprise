import { useAppRoute } from "@/app/routes/useAppRoute"

export interface EntitySelectOption {
  value: string
  label: string
}

export function EntitySelectField({
  entity,
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  entity: "group" | "branch"
  label: string
  value: string
  options: EntitySelectOption[]
  onChange: (value: string) => void
  placeholder?: string
}) {
  const { navigate } = useAppRoute()
  const plural = entity === "group" ? "groups" : "branches"
  return (
    <label className="field">
      <span className="entity-select-label">
        <span>{label}</span>
        <button type="button" className="entity-select-create" onClick={() => navigate(plural)}>
          + Create {entity}
        </button>
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{options.length ? placeholder ?? `Select ${entity}` : `No ${plural} yet`}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}
