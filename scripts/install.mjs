import { mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const vault = process.argv[2] || process.env.FJG_VAULT;
if (!vault) throw new Error('Supply the vault path as an argument or FJG_VAULT.');
const dest = join(resolve(vault), '.obsidian/plugins/universal-use-dashboard');
await mkdir(dest, {recursive: true});
for (const file of ['main.js', 'manifest.json', 'styles.css']) await copyFile(file, join(dest, file));
console.log('Installed runtime to ' + dest);
