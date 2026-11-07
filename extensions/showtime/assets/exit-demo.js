ObjC.import("Foundation");

const STATE_FILE = $.NSHomeDirectory().js + "/.local/state/raycast-demo/state.json";

const app = Application.currentApplication();
app.includeStandardAdditions = true;
const systemEvents = Application("System Events");

function shell(command) {
  return app.doShellScript(command);
}

function readState() {
  const text = $.NSString.stringWithContentsOfFileEncodingError(STATE_FILE, $.NSUTF8StringEncoding, null);
  return text.isNil() ? null : JSON.parse(text.js);
}

// Hiding or showing desktop icons needs a Finder restart, which closes Finder's windows,
// so remember what was open and reopen it afterward
function restartFinder(command) {
  const finder = Application("Finder");
  const open = [];
  for (const win of finder.finderWindows()) {
    try {
      open.push({ path: $.NSURL.URLWithString(win.target().url()).path.js, bounds: win.bounds(), collapsed: win.collapsed() });
    } catch (e) {
      // Windows like Recents have no folder to reopen
    }
  }

  shell(`${command}; killall Finder`);
  delay(1);
  for (let i = 0; i < 20; i++) {
    try {
      finder.finderWindows.length;
      break;
    } catch (e) {
      delay(0.25);
    }
  }

  // Windows list front to back, so reopen in reverse to keep their order
  for (const saved of [...open].reverse()) {
    try {
      finder.open(Path(saved.path));
      delay(0.3);
    } catch (e) {
      // The folder may no longer exist
    }
  }
  delay(0.5);

  // Position them once they've all opened, since a window still opening can ignore its bounds
  for (const win of finder.finderWindows()) {
    try {
      const path = $.NSURL.URLWithString(win.target().url()).path.js;
      const index = open.findIndex((saved) => saved.path === path);
      if (index === -1) continue;
      const [saved] = open.splice(index, 1);
      win.bounds = saved.bounds;
      if (saved.collapsed) win.collapsed = true;
    } catch (e) {
      // Windows like Recents have no folder to match
    }
  }
}

function sameFrame(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

// Titles can change while demoing, such as a browser switching tabs, so also accept
// the window still sitting where Demo placed it
function findWindow(saved) {
  const windows = systemEvents.processes.byName(saved.app).windows();
  return (
    windows.find((w) => w.title() === saved.title) ||
    windows.find((w) => sameFrame(w.position(), saved.placedPosition) && sameFrame(w.size(), saved.placedSize))
  );
}

function restoreFrame(win, saved) {
  // Move first so the original size isn't clipped against the screen edge
  win.position = saved.position;
  win.size = saved.size;
  win.position = saved.position;
  // Un-minimizing other windows can cover this one
  win.actions.byName("AXRaise").perform();
}

function run() {
  const state = readState();
  if (state === null) return "No show running";

  let missed = 0;
  // A window or app can close during a demo, which shouldn't stop the rest of the restore
  const attempt = (action) => {
    try {
      action();
    } catch (e) {
      missed++;
    }
  };

  systemEvents.dockPreferences.autohide = state.dock;
  systemEvents.dockPreferences.autohideMenuBar = state.menuBar;

  shell(
    state.hideWidgets === null
      ? "defaults delete com.apple.WindowManager StandardHideWidgets"
      : `defaults write com.apple.WindowManager StandardHideWidgets -bool ${state.hideWidgets === "1"}`,
  );

  restartFinder(
    state.createDesktop === null
      ? "defaults delete com.apple.finder CreateDesktop"
      : `defaults write com.apple.finder CreateDesktop ${JSON.stringify(state.createDesktop)}`,
  );

  for (const name of state.hiddenApps) {
    attempt(() => {
      systemEvents.processes.byName(name).visible = true;
    });
  }

  for (const saved of state.minimized) {
    attempt(() => {
      const win = systemEvents.processes.byName(saved.app).windows().find((w) => w.title() === saved.title);
      if (!win) throw new Error("window closed");
      win.attributes.byName("AXMinimized").value = false;
    });
  }

  delay(0.3);

  for (const saved of state.windows) {
    attempt(() => {
      const win = findWindow(saved);
      if (!win) throw new Error("window closed");
      restoreFrame(win, saved);
    });
  }

  attempt(() => {
    systemEvents.processes.byName(state.frontApp).frontmost = true;
  });

  shell(`rm -f ${JSON.stringify(STATE_FILE)}`);
  return missed === 0 ? "Curtains closed" : `Curtains closed, but ${missed} item${missed === 1 ? "" : "s"} couldn't be restored`;
}
