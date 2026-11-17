import type { Grammar } from "prismjs";
import { compose } from "./shared.ts";
import { gdb } from "./gdb.ts";
import { pwndbg } from "./pwndbg.ts";
import { gef } from "./gef.ts";
import { peda } from "./peda.ts";

/**
 * Each tool grammar holds only tool-specific rules; vanilla gdb rules are
 * appended after them, because every plugin session also prints plain gdb
 * output (breakpoint hits, `x/`, `bt`, signals, ...).
 */
export const LANGUAGES: Record<string, Grammar> = {
	gdb: compose(gdb),
	pwndbg: compose(pwndbg, gdb),
	gef: compose(gef, gdb),
	peda: compose(peda, gdb),
};

const ALIASES: Record<string, string> = {
	"gdb-pwndbg": "pwndbg",
	"gdb-gef": "gef",
	"gdb-peda": "peda",
};

export const LANGUAGE_ALIASES = Object.keys(ALIASES);

export function resolveLanguage(lang: string): string | undefined {
	const l = lang.toLowerCase();
	if (l in LANGUAGES) return l;
	return ALIASES[l];
}
