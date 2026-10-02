// Prepara o projeto depois de clonar: confere a versão do Node e cria o .env.local a partir do .env.example.
import fs from "node:fs";

const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error(`✗ Node ${process.versions.node} encontrado. Este projeto precisa do Node 22 ou mais novo (https://nodejs.org).`);
  process.exit(1);
}
console.log(`✓ Node ${process.versions.node}`);

if (fs.existsSync(".env.local")) {
  console.log("✓ .env.local já existe (não mexi nele)");
} else {
  fs.copyFileSync(".env.example", ".env.local");
  console.log("✓ .env.local criado a partir do .env.example");
}

const env = fs.readFileSync(".env.local", "utf8");
const filled = (key) => new RegExp(`^${key}=\\S+`, "m").test(env);
if (filled("WCL_CLIENT_ID") && filled("WCL_CLIENT_SECRET")) {
  console.log("✓ Chaves da Warcraft Logs preenchidas no .env.local");
  console.log("\nPronto. Rode: npm run dev");
} else {
  console.log("\nPronto. Rode: npm run dev");
  console.log("Na primeira vez o app abre em Configurações › Chaves de API com o passo a passo da Warcraft Logs.");
  console.log("(Se preferir, preencha WCL_CLIENT_ID e WCL_CLIENT_SECRET no .env.local.)");
}
