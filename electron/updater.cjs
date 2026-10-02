// Atualização automática pelos releases do GitHub (electron-updater).
// Windows e Linux (AppImage): baixa em segundo plano e instala ao reiniciar.
// macOS: sem assinatura da Apple o macOS não aceita instalar sozinho, então só avisa e abre o release.
const { app, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const RELEASES_URL = "https://github.com/keter45/poachnomic3000/releases/latest";
const CHECK_EVERY_MS = 6 * 3600_000;

/** Atualização instalável sozinha? (AppImage só funciona rodando como AppImage) */
function canAutoInstall() {
  if (process.platform === "win32") return true;
  if (process.platform === "linux") return Boolean(process.env.APPIMAGE);
  return false;
}

function setupUpdater(getWindow) {
  const state = {
    current: app.getVersion(),
    status: app.isPackaged ? "idle" : "unsupported", // idle | checking | available | downloading | downloaded | latest | error | unsupported
    version: null,
    percent: null,
    error: null,
    canAutoInstall: canAutoInstall(),
    releaseUrl: RELEASES_URL,
    checkedAt: null,
  };

  const logFile = path.join(app.getPath("userData"), "logs", "updater.log");
  const log = (msg) => {
    try {
      fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
    } catch {}
  };

  const emit = (patch) => {
    Object.assign(state, patch);
    getWindow()?.webContents.send("updates:state", state);
  };

  ipcMain.handle("updates:get", () => state);
  ipcMain.handle("updates:open-release", () => shell.openExternal(state.version ? `https://github.com/keter45/poachnomic3000/releases/tag/v${state.version}` : RELEASES_URL));

  if (!app.isPackaged) {
    ipcMain.handle("updates:check", () => state);
    ipcMain.handle("updates:install", () => false);
    return;
  }

  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = state.canAutoInstall;
  autoUpdater.autoInstallOnAppQuit = state.canAutoInstall;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} };

  autoUpdater.on("checking-for-update", () => emit({ status: "checking", error: null }));
  autoUpdater.on("update-available", (info) =>
    emit({ status: state.canAutoInstall ? "downloading" : "available", version: info.version, percent: 0 }),
  );
  autoUpdater.on("update-not-available", () => emit({ status: "latest", version: null, percent: null, checkedAt: Date.now() }));
  autoUpdater.on("download-progress", (p) => emit({ status: "downloading", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (info) => emit({ status: "downloaded", version: info.version, percent: 100, checkedAt: Date.now() }));
  autoUpdater.on("error", (err) => {
    log(`erro: ${err?.stack ?? err}`);
    emit({ status: "error", error: friendlyError(err), checkedAt: Date.now() });
  });

  const check = async () => {
    if (state.status === "checking" || state.status === "downloading" || state.status === "downloaded") return state;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      emit({ status: "error", error: friendlyError(err), checkedAt: Date.now() });
    }
    return state;
  };

  ipcMain.handle("updates:check", () => check());
  ipcMain.handle("updates:install", () => {
    if (state.status !== "downloaded") return false;
    // fecha o servidor interno e reinicia já na versão nova
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return true;
  });

  // primeira verificação um pouco depois de abrir, para não competir com a inicialização
  setTimeout(check, 10_000);
  setInterval(check, CHECK_EVERY_MS);
}

function friendlyError(err) {
  const msg = String(err?.message ?? err);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|net::/i.test(msg)) return "Sem conexão com o GitHub agora. Tento de novo mais tarde.";
  if (/404/.test(msg)) return "Nenhum release publicado ainda.";
  return "Não consegui verificar atualizações. Detalhes em logs/updater.log.";
}

module.exports = { setupUpdater };
