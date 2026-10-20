// Desktop sidebar expanded/collapsed preference (UI only; nothing sensitive).
//
// The state lives on <html data-sidebar="collapsed">. A tiny inline script in
// the root layout sets it from localStorage before first paint, and the
// collapsed styling is pure CSS keyed on that attribute (the `rail-collapsed:`
// variant in globals.css), so server and client render the same markup:
// no hydration mismatch and no flash of the wrong width. React reads the
// attribute through useSyncExternalStore; the server snapshot is "expanded".

export const SIDEBAR_STORAGE_KEY = "wupcare.sidebar";
export const SIDEBAR_ATTRIBUTE = "data-sidebar";

// Runs before React. Storage may be unavailable (private mode, blocked
// cookies): the default stays expanded.
export const SIDEBAR_BOOT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(SIDEBAR_STORAGE_KEY)})==="collapsed")document.documentElement.setAttribute(${JSON.stringify(SIDEBAR_ATTRIBUTE)},"collapsed")}catch(e){}`;

export function isSidebarCollapsed(root: { getAttribute(name: string): string | null } = document.documentElement) {
  return root.getAttribute(SIDEBAR_ATTRIBUTE) === "collapsed";
}

export function setSidebarCollapsed(collapsed: boolean, root: Element = document.documentElement, storage: Pick<Storage, "setItem"> | null = safeStorage()) {
  if (collapsed) root.setAttribute(SIDEBAR_ATTRIBUTE, "collapsed");
  else root.removeAttribute(SIDEBAR_ATTRIBUTE);
  try {
    storage?.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // Not persisted; the choice still applies until the page is reloaded.
  }
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// useSyncExternalStore subscription: re-render when the attribute changes.
export function subscribeSidebar(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [SIDEBAR_ATTRIBUTE] });
  return () => observer.disconnect();
}
export const sidebarSnapshot = () => isSidebarCollapsed();
export const sidebarServerSnapshot = () => false;
