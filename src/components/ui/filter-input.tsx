import type { ChangeEvent } from "react";

import { FormField } from "@/components/ui/form-field";
import { TextInput } from "@/components/ui/text-input";

type FilterInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number";
  id?: string;
  ariaLabel?: string;
};

export function FilterInput({ label, value, onChange, placeholder, type = "text", id, ariaLabel }: FilterInputProps) {
  const inputId = id || `filter-input-${label}`;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <FormField label={label} htmlFor={inputId}>
      <TextInput id={inputId} aria-label={ariaLabel ?? label} type={type} value={value} onChange={handleChange} placeholder={placeholder} />
    </FormField>
  );
}
