// Copy the built plugin into a vault: npm run install-vault -- "/path/to/vault"
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const vault = process.argv[2];
if (!vault || !existsSync(join(vault, ".obsidian"))) {
	console.error('usage: npm run install-vault -- "/path/to/vault"   (the folder that contains .obsidian/)');
	process.exit(1);
}
const { id } = JSON.parse(readFileSync("manifest.json", "utf8"));
const dest = join(vault, ".obsidian", "plugins", id);
mkdirSync(dest, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) copyFileSync(f, join(dest, f));
console.log(`installed to ${dest}\nReload Obsidian (or toggle the plugin) and enable it under Settings → Community plugins.`);
