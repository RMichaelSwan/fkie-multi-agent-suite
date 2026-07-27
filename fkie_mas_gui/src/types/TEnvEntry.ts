export type TEnvEntry = {
  name: string;
  value: string;
};

export function envEntryToStr(entry: TEnvEntry): string {
  if (!entry.name || entry.value === undefined || entry.value === null) return "";

  const value = entry.value;

  // Quote the value if it contains shell metacharacters that could break
  // the environment assignment or be interpreted by the shell
  if (/[;\s|&()<>]/.test(value)) {
    return `${entry.name}='${value.replace(/'/g, `'\\''`)}'`;
  }

  return `${entry.name}=${value}`;
}

export function envEntryToExportStr(entry: TEnvEntry): string {
  const envStr = envEntryToStr(entry);
  if (!envStr) return "";
  return `export ${envStr};`;
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
