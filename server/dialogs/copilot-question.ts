import { ANSI_RE, SOLID_RULE_RE, finishPrompt, type DialogReader, type ParsedPrompt } from "./shared.ts";

const hint = "↑/↓ select · enter accept · ctrl+d decline · esc cancel";
const other = "Other (type your answer)";
const editing = "Other (type your answer below)";

export const readers: readonly DialogReader[] = [{
  id: "copilot-question", agents: ["copilot"], priority: 20, reread: "each-move", list: "none",
  // Like Pi's questionnaire, only readKnownPrompt can supply a verified pending call.
  parse: () => null,
}];

/** The detection frame has no editor-buffer metadata: placeholder and typed text can be identical. */
export function copilotOtherEditor(screen: string): boolean {
  const lines = screen.replace(ANSI_RE, "").trimEnd().split(/\r?\n/).map(line => line.trimEnd());
  const footer = lines.map(line => line.trim()).lastIndexOf(hint);
  return footer >= 2 && (lines[footer - 2] === ` ❯ ${editing}` || lines[footer - 2] === ` ❯ ${other}`) && lines[footer - 1] === ""
    && SOLID_RULE_RE.test(lines[footer + 1]?.trim() ?? "") && SOLID_RULE_RE.test(lines.at(-1)?.trim() ?? "");
}

/** Match the whole live single-choice panel, not the same question quoted in a turn above the composer. */
export function copilotQuestion(screen: string, call: string): ParsedPrompt | null {
  const lines = screen.replace(ANSI_RE, "").trimEnd().split(/\r?\n/).map(line => line.trimEnd());
  if (!SOLID_RULE_RE.test(lines.pop()?.trim() ?? "") || lines.pop()?.trim() !== hint || lines.pop() !== "") return null;
  const header = lines.lastIndexOf(" Copilot needs information.");
  if (header < 1 || !SOLID_RULE_RE.test(lines[header - 1]!.trim())) return null;
  const panel = lines.slice(header + 1);
  const split = panel.indexOf("");
  if (split !== 1 || !panel[0]!.trim() || !/^ [^ ].*:$/.test(panel[2] ?? "")) return null;
  const rows = panel.slice(3).map(line => /^ (❯ |  )(\S.*)$/u.exec(line));
  if (rows.length === 0 || rows.some(row => !row) || rows.filter(row => row?.[1] === "❯ ").length !== 1) return null;
  const labels = rows.map(row => row![2]!);
  if (new Set(labels).size !== labels.length) return null;
  const choices = labels.at(-1) === other ? labels.slice(0, -1) : labels;
  const selectedIndex = rows.findIndex(row => row?.[1] === "❯ ");
  if (labels.includes(editing) || selectedIndex >= choices.length) return null;
  return finishPrompt("copilot", {
    kind: "question", title: panel[2]!.trim().slice(0, -1), question: panel[0]!.trim(), body: null,
    options: choices.map(label => ({ label, description: null })), multi_select: false, custom_option_index: null,
  }, {
    responder: "copilot-question", menuLabels: choices, selectedIndex,
    checkedOptionIndices: [], customMenuIndex: null, rejectWithEscapeIndex: null,
  }, { call });
}
