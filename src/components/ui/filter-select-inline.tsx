import { SelectField } from "@/components/ui/select-field";

type FilterSelectInlineOption = {
  value: string;
  label: string;
};

type FilterSelectInlineProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectInlineOption[];
  placeholder?: string;
  id?: string;
  className?: string;
  showSearch?: boolean;
  ariaLabel?: string;
};

function normalizeLabelText(label: string) {
  return label.replace(/[：:]$/, "");
}

export function FilterSelectInline({
  label,
  value,
  onChange,
  options,
  placeholder,
  id,
  className = "",
  showSearch,
  ariaLabel,
}: FilterSelectInlineProps) {
  const selectId = id || `filter-select-inline-${label}`;

  return (
    <div className={`flex items-center gap-2 ${className}`.trim()}>
      <label htmlFor={selectId} className="whitespace-nowrap text-sm text-[var(--text-2)]">
        {label}
      </label>
      <SelectField
        id={selectId}
        aria-label={ariaLabel ?? normalizeLabelText(label)}
        value={value}
        onChange={(nextValue) => onChange(String(nextValue ?? ""))}
        options={options}
        placeholder={placeholder}
        showSearch={showSearch}
        className="w-28"
      />
    </div>
  );
}
