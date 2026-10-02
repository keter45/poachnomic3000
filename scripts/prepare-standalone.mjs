// Completa o build standalone do Next para o app desktop: copia os arquivos estáticos e confere que
// nada local (banco de dev, .env) foi junto.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, ".next", "standalone");

if (!fs.existsSync(path.join(out, "server.js"))) {
  console.error("✗ .next/standalone/server.js não existe — rode `next build` antes.");
  process.exit(1);
}

fs.cpSync(path.join(root, ".next", "static"), path.join(out, ".next", "static"), { recursive: true });
if (fs.existsSync(path.join(root, "public"))) fs.cpSync(path.join(root, "public"), path.join(out, "public"), { recursive: true });

// trava de segurança: o instalador não pode levar dados ou chaves de quem gerou o build
const forbidden = ["data", ".env", ".env.local", ".env.production", ".env.development"];
for (const f of forbidden) {
  const p = path.join(out, f);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.warn(`! removido do build: ${f}`);
  }
}

const binary = path.join(out, "node_modules", "better-sqlite3", "prebuilds", `${process.platform}-${process.arch}.node`);
if (!fs.existsSync(binary)) {
  console.error(`✗ binário do SQLite para ${process.platform}-${process.arch} não foi incluído no build`);
  process.exit(1);
}
console.log("✓ standalone pronto em .next/standalone");
