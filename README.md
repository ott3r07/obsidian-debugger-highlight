# Research data for Debugger Output Highlight

This branch holds the evidence the grammars on `master` were built and tested
against. It is kept apart so a normal checkout of the plugin stays small.

- `research/<tool>/SPEC.md`: format specification for pwndbg (+ vanilla GDB), GEF and PEDA,
  with source citations.
- `research/<tool>/REVIEW.md`: adversarial review of each spec, with corrected regexes.
- `research/<tool>/captures/`: real output, as raw ANSI (`.ansi`) and plain text (`.txt`).
  Covers pwndbg 2026.10, GEF 2021.10–2026, PEDA and GDB 15 on x86_64, i386 and aarch64.
- `research/*/review_samples/`, `research/adversarial/samples/`: real-world pastes.
  Each one starts with a `# SOURCE: <url>` line.
- `research/adversarial/`: the final break-test report (`REPORT.md`) and its harness.

To use this data next to a `master` checkout (the grammar tests then also check
that every quoted sample line really exists in its source file):

```sh
git fetch origin research
git archive origin/research research | tar -x   # creates ./research (ignored on master)
npm test
```
