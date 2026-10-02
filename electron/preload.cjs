// Ponte segura entre a janela e o processo principal: só expõe as ações de atualização.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("poachDesktop", {
  updates: {
    get: () => ipcRenderer.invoke("updates:get"),
    check: () => ipcRenderer.invoke("updates:check"),
    install: () => ipcRenderer.invoke("updates:install"),
    openRelease: () => ipcRenderer.invoke("updates:open-release"),
    onState: (cb) => {
      const listener = (_event, state) => cb(state);
      ipcRenderer.on("updates:state", listener);
      return () => ipcRenderer.removeListener("updates:state", listener);
    },
  },
});
