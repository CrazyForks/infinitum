import { FormField } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";

type FilterSelectOption = {
  value: string;
  label: string;
};

type FilterSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  placeholder?: string;
  id?: string;
  showSearch?: boolean;
  ariaLabel?: string;
};

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  id,
  showSearch,
  ariaLabel,
}: FilterSelectProps) {
  const selectId = id || `filter-select-${label}`;

  return (
    <FormField label={label} htmlFor={selectId}>
      <SelectField
        id={selectId}
        aria-label={ariaLabel ?? label}
        value={value}
        onChange={(nextValue) => onChange(String(nextValue ?? ""))}
        options={options}
        placeholder={placeholder}
        showSearch={showSearch}
        className="w-full"
      />
    </FormField>
  );
}
