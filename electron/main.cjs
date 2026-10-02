// Processo principal do app desktop: sobe o servidor Next (build standalone) num processo filho
// e abre uma janela apontando para ele. Os dados ficam na pasta de dados do usuário do sistema.
const { app, BrowserWindow, dialog, shell, utilityProcess } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { setupUpdater } = require("./updater.cjs");

const APP_NAME = "Poachnomic 3000";
app.setName(APP_NAME);

let server = null;
let win = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(start);
}

function serverDir() {
  // empacotado: o build standalone vai como recurso extra; em dev, usa o build local
  return app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "..", ".next", "standalone");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/keys", timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on("error", retry);
      req.on("timeout", () => req.destroy());
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error("o servidor interno não respondeu a tempo"));
      else setTimeout(attempt, 300);
    };
    attempt();
  });
}

const loadingPage = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${APP_NAME}</title>
<style>
  html,body{height:100%;margin:0;background:#0c0e12;color:#9aa3b2;font:14px system-ui,sans-serif}
  body{display:grid;place-items:center}
  @media (prefers-color-scheme: light){html,body{background:#f5f6f8;color:#586170}}
</style></head><body><p>Iniciando o ${APP_NAME}…</p></body></html>`)}`;

async function start() {
  const dataDir = app.getPath("userData");
  const logDir = path.join(dataDir, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "server.log");
  const log = fs.createWriteStream(logFile, { flags: "w" });

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: "#0c0e12",
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.cjs") },
  });
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => (win = null));

  // links externos (WCL, Raider.io, Twitch…) abrem no navegador padrão, não dentro do app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("http://127.0.0.1:")) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  await win.loadURL(loadingPage);

  try {
    const port = await freePort();
    const dir = serverDir();
    server = utilityProcess.fork(path.join(dir, "server.js"), [], {
      cwd: dir,
      serviceName: `${APP_NAME} server`,
      stdio: "pipe",
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
        POACH_DATA_DIR: dataDir,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    });
    server.stdout?.pipe(log);
    server.stderr?.pipe(log);
    server.on("exit", (code) => {
      server = null;
      if (quitting) return;
      dialog.showErrorBox(APP_NAME, `O servidor interno parou (código ${code}).\n\nDetalhes em:\n${logFile}`);
      app.quit();
    });

    await waitForServer(port, 60_000);
    await win.loadURL(`http://127.0.0.1:${port}/`);
    setupUpdater(() => win);
  } catch (e) {
    dialog.showErrorBox(APP_NAME, `Não foi possível iniciar o app: ${e.message}\n\nDetalhes em:\n${logFile}`);
    app.quit();
  }
}

app.on("before-quit", () => {
  quitting = true;
  server?.kill();
});

app.on("window-all-closed", () => app.quit());
