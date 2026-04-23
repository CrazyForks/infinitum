import { twMerge } from "tailwind-merge";

type ClassDictionary = Record<string, boolean | null | undefined>;
type ClassArray = ClassValue[];
type ClassValue = ClassArray | ClassDictionary | string | false | null | undefined;

function toClassName(value: ClassValue): string[] {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(toClassName);
  }

  return Object.entries(value)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([className]) => className);
}

export function cx(...values: ClassValue[]) {
  return twMerge(values.flatMap(toClassName).join(" "));
}
