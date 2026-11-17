#!/bin/sh
# Bundle src/obsidian/editor.ts and src/main.ts for node (editor.ts imports type-only names without `import type`,
# which node's type stripping cannot load directly; main.ts needs a stub `obsidian` module).
cd "$(dirname "$0")/../../.." || exit 1
npx esbuild src/obsidian/editor.ts --bundle --format=esm --platform=node '--external:@codemirror/*' --outfile=research/adversarial/integration/.build/editor.mjs --log-level=warning
npx esbuild src/main.ts --bundle --format=esm --platform=node '--external:@codemirror/*' --external:prismjs --alias:obsidian=./research/adversarial/integration/stub/obsidian.mjs --outfile=research/adversarial/integration/.build/main.mjs --log-level=warning
