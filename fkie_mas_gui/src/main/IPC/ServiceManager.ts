import { ServiceCloseCallback, ServiceManagerEvents, TServiceManager } from "@/types";
import { is } from "@electron-toolkit/utils";
import actionIcon from "@public/google_start.png?asset";
import serviceCallIcon from "@public/google_sync_alt.png?asset";
import introspectionIcon from "@public/google_troubleshoot.png?asset";
import { BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import windowStateKeeper from "../windowStateKeeper";

type TPublisher = {
  window: BrowserWindow;
};

/**
 * Class ServiceManager: handle communication with external window
 */
export default class ServiceManager implements TServiceManager {
  instances: { [id: string]: TPublisher } = {};

  onClose: (callback: ServiceCloseCallback) => void = () => {
    // implemented in preload script
  };

  public registerHandlers(): void {
    ipcMain.handle(ServiceManagerEvents.has, (_event: Electron.IpcMainInvokeEvent, id: string) => {
      return this.has(id);
    });
    ipcMain.handle(ServiceManagerEvents.close, (_event: Electron.IpcMainInvokeEvent, id: string) => {
      return this.close(id);
    });
    ipcMain.handle(
      ServiceManagerEvents.start,
      (
        _event: Electron.IpcMainInvokeEvent,
        id: string,
        host: string,
        port: number,
        serviceName: string,
        serviceType: string,
        htmlName: string
      ) => {
        return this.start(id, host, port, serviceName, serviceType, htmlName);
      }
    );
  }

  public has: (id: string) => Promise<boolean> = async (id) => {
    if (this.instances[id]) {
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  };

  public close: (id: string) => Promise<boolean> = async (id) => {
    if (this.instances[id]) {
      this.instances[id].window.destroy();
      delete this.instances[id];
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  };

  public start: (
    id: string,
    host: string,
    port: number,
    serviceName: string,
    serviceType: string,
    htmlName: string
  ) => Promise<string | null> = async (id, host, port, serviceName, serviceType, htmlName) => {
    if (this.instances[id]) {
      this.instances[id].window.restore();
      this.instances[id].window.focus();
      return Promise.resolve(null);
    }
    let serviceIcon = "";
    if (htmlName === "serviceCaller.html") {
      serviceIcon = serviceCallIcon;
    } else if (htmlName === "serviceIntrospection.html" || htmlName === "actionIntrospection.html") {
      serviceIcon = introspectionIcon;
    } else {
      serviceIcon = actionIcon;
    }

    const pubWindowStateKeeper = await windowStateKeeper("publisher");

    const window = new BrowserWindow({
      autoHideMenuBar: true,
      show: false,
      frame: true,
      x: pubWindowStateKeeper.x,
      y: pubWindowStateKeeper.y,
      width: pubWindowStateKeeper.width,
      height: pubWindowStateKeeper.height,
      icon: serviceIcon,
      webPreferences: {
        sandbox: false,
        nodeIntegration: true,
        preload: join(__dirname, "../preload/index.js"),
      },
    });
    this.instances[id] = { window: window };
    // Track window state
    pubWindowStateKeeper.track(window);

    window.on("ready-to-show", () => {
      if (!window) {
        throw new Error('"mainWindow" is not defined');
      }
      if (process.env.START_MINIMIZED) {
        window.minimize();
      } else {
        window.show();
      }
    });

    window.on("close", async (e) => {
      // send close request to the renderer
      if (this.instances[id]) {
        e.preventDefault();
        this.instances[id].window.webContents.send(ServiceManagerEvents.onClose, id);
      }
    });

    window.on("closed", () => {
      delete this.instances[id];
    });

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
      window.loadURL(
        `${process.env.ELECTRON_RENDERER_URL}/${htmlName}?id=${id}&host=${host}&port=${port}&serviceName=${serviceName}&serviceType=${serviceType}`
      );
    } else {
      window.loadFile(join(__dirname, `../renderer/${htmlName}`), {
        query: {
          id: id,
          host: host,
          port: `${port}`,
          serviceName: serviceName,
          serviceType: `${serviceType}`,
        },
      });
    }
    return Promise.resolve(null);
  };
}
