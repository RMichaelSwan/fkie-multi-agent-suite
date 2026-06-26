import { quote } from "shell-quote";

export type TEnvEntry = {
  name: string;
  value: string;
};

export function envEntryToStr(entry: TEnvEntry): string {
  if (!entry.name || !entry.value) return "";
  return `${entry.name}=${quote([entry.value])}`;
}

export function envEntryToExportStr(entry: TEnvEntry): string {
  if (!entry.name || !entry.value) return "";
  return `export ${entry.name}=${quote([entry.value])};`;
}

export function toEnvEntry(input: string): TEnvEntry {
  const idx = input.indexOf("=");
  if (idx === -1) {
    // no "=" found
    return { name: input, value: "" };
  }
  const left = input.slice(0, idx);
  const right = input.slice(idx + 1);
  return { name: left, value: right };
}
