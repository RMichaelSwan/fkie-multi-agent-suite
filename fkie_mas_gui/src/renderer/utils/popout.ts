import { CmdType, PopoutParams } from "@/types";

export function isElectron(): boolean {
  return !!window.commandExecutor;
}

/**
 * Opens a popout-site in in a new Browser-Tab.
 * site e.g. "publisher", "subscriber", "serviceCaller", ...
 */
export function openBrowserSite(site: string, id: string, params: PopoutParams, openAsPopout: boolean): Window | null {
  console.log(`openAsPopout: ${openAsPopout}`);
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;

    if (Array.isArray(v) || (typeof v === "object" && v !== null && !(v instanceof CmdType))) {
      search.set(k, JSON.stringify(v));
    } else {
      search.set(k, String(v));
    }
  }
  const url = `${window.location.origin}/${site}.html?${search.toString()}`;
  // id als window-name -> use already available tab
  return window.open(url, id, openAsPopout ? "popup,width=900,height=700" : undefined);
}
