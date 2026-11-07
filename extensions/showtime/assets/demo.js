ObjC.import("AppKit");
ObjC.import("Foundation");

const SCALE = 0.85;
const STATE_DIR = $.NSHomeDirectory().js + "/.local/state/raycast-demo";
const STATE_FILE = STATE_DIR + "/state.json";
// Hiding Raycast would interfere with its own confirmation message
const NEVER_HIDE = ["Raycast"];

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

function writeState(state) {
  shell(`mkdir -p ${JSON.stringify(STATE_DIR)}`);
  $(JSON.stringify(state)).writeToFileAtomicallyEncodingError(STATE_FILE, true, $.NSUTF8StringEncoding, null);
}

function readCreateDesktop() {
  try {
    return shell("defaults read com.apple.finder CreateDesktop");
  } catch (e) {
    return null; // never set, which means macOS shows desktop icons
  }
}

function readHideWidgets() {
  try {
    return shell("defaults read com.apple.WindowManager StandardHideWidgets");
  } catch (e) {
    return null; // never set, which means macOS shows desktop widgets
  }
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

function targetScreen(win) {
  // Accessibility uses a top-left origin measured from the primary screen; NSScreen uses bottom-left
  const screens = $.NSScreen.screens;
  const primaryHeight = screens.objectAtIndex(0).frame.size.height;
  const [x, y] = win.position();
  const [w, h] = win.size();
  const centerX = x + w / 2;
  const centerY = y + h / 2;

  let target = null;
  for (let i = 0; i < screens.count; i++) {
    const f = screens.objectAtIndex(i).frame;
    const top = primaryHeight - f.origin.y - f.size.height;
    const screen = { x: f.origin.x, y: top, width: f.size.width, height: f.size.height };
    if (target === null) target = screen;
    if (centerX >= screen.x && centerX < screen.x + screen.width && centerY >= screen.y && centerY < screen.y + screen.height) {
      return screen;
    }
  }
  return target;
}

function centerWindow(win) {
  const screen = targetScreen(win);
  const width = Math.round(screen.width * SCALE);
  const height = Math.round(screen.height * SCALE);

  // Move before resizing, or macOS clips the new size against the screen edge
  win.position = [Math.round(screen.x + (screen.width - width) / 2), Math.round(screen.y + (screen.height - height) / 2)];
  win.size = [width, height];

  // Center again using the size the app actually accepted, since some windows have size limits
  const [finalWidth, finalHeight] = win.size();
  win.position = [
    Math.round(screen.x + (screen.width - finalWidth) / 2),
    Math.round(screen.y + (screen.height - finalHeight) / 2),
  ];
}

function run() {
  const front = systemEvents.processes.whose({ frontmost: true })[0];
  const frontName = front.name();
  let state = readState();

  if (state === null) {
    const prefs = systemEvents.dockPreferences;
    state = {
      frontApp: frontName,
      dock: prefs.autohide(),
      menuBar: prefs.autohideMenuBar(),
      createDesktop: readCreateDesktop(),
      hideWidgets: readHideWidgets(),
      hiddenApps: [],
      minimized: [],
      windows: [],
    };
    // Save before changing anything, so Exit Demo can recover from a failure partway through
    writeState(state);

    shell("defaults write com.apple.WindowManager StandardHideWidgets -bool true");
    restartFinder("defaults write com.apple.finder CreateDesktop -bool false");
    systemEvents.processes.byName(frontName).frontmost = true;
    delay(0.3);
  }

  for (const process of systemEvents.processes.whose({ visible: true, backgroundOnly: false })()) {
    const name = process.name();
    if (name === frontName || NEVER_HIDE.includes(name)) continue;
    process.visible = false;
    if (!state.hiddenApps.includes(name)) state.hiddenApps.push(name);
  }
  writeState(state);

  systemEvents.dockPreferences.autohide = true;
  systemEvents.dockPreferences.autohideMenuBar = true;

  const windows = systemEvents.processes.byName(frontName).windows();
  if (windows.length === 0) return "It's showtime, but this app has no window to center";

  // Windows list front to back, so the first one is the focused window
  const [focused, ...others] = windows;
  for (const win of others) {
    const minimized = win.attributes.byName("AXMinimized");
    if (minimized.value()) continue;
    state.minimized.push({ app: frontName, title: win.title() });
    minimized.value = true;
  }

  const title = focused.title();
  if (!state.windows.some((w) => w.app === frontName && w.title === title)) {
    state.windows.push({ app: frontName, title, position: focused.position(), size: focused.size() });
  }
  writeState(state);

  centerWindow(focused);

  const entry = state.windows.find((w) => w.app === frontName && w.title === title);
  entry.placedPosition = focused.position();
  entry.placedSize = focused.size();
  writeState(state);

  return "It's showtime!";
}
