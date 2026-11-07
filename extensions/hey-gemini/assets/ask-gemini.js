ObjC.import("AppKit");

const BUNDLE_ID = "com.google.GeminiMacOS";
// "Ask Gemini" in a normal chat, "Ask questions in a temporary chat" in a temporary one
const INPUT_DESCRIPTION_PREFIX = "Ask ";
const LAUNCH_TIMEOUT_SECONDS = 20;
const KNOWN_INPUT_PATH = [0, 0, 2, 1, 0];
const MAX_SEARCH_DEPTH = 14;
const TEMPORARY_MODE = "temporary";
const RETURN_KEY = 36;

const app = Application.currentApplication();
app.includeStandardAdditions = true;
const systemEvents = Application("System Events");

function geminiProcess() {
  const matches = systemEvents.processes.whose({ bundleIdentifier: BUNDLE_ID })();
  return matches.length > 0 ? matches[0] : null;
}

function isInput(element) {
  return element.role() === "AXTextArea" && element.description().startsWith(INPUT_DESCRIPTION_PREFIX);
}

// Where the input sits in the current app version, which is much quicker than searching
function inputAtKnownPath(win) {
  try {
    let element = win;
    for (const index of KNOWN_INPUT_PATH) element = element.uiElements()[index];
    return isInput(element) ? element : null;
  } catch (e) {
    return null;
  }
}

// The sidebar comes first and can hold hundreds of chats, so search the main pane first by going last to first
function findInput(element, depth = 0) {
  try {
    if (isInput(element)) return element;
    if (depth >= MAX_SEARCH_DEPTH) return null;
    for (const child of element.uiElements().reverse()) {
      const input = findInput(child, depth + 1);
      if (input !== null) return input;
    }
  } catch (e) {
    // Elements can disappear while the app redraws
  }
  return null;
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
  const [width, height] = win.size();
  win.position = [Math.round(screen.x + (screen.width - width) / 2), Math.round(screen.y + (screen.height - height) / 2)];
}

function focusedInput(process) {
  try {
    const element = process.attributes.byName("AXFocusedUIElement").value();
    if (isInput(element)) return element;
  } catch (e) {
    // Nothing is focused yet
  }
  return null;
}

function waitForWindow() {
  const deadline = Date.now() + LAUNCH_TIMEOUT_SECONDS * 1000;
  while (Date.now() < deadline) {
    const process = geminiProcess();
    if (process !== null) {
      // Hidden apps report no windows
      process.visible = true;
      const windows = process.windows();
      if (windows.length > 0) {
        const win = windows.find((w) => w.subrole() === "AXStandardWindow") || windows[0];
        const minimized = win.attributes.byName("AXMinimized");
        if (minimized.value()) minimized.value = false;
        return { process, win };
      }
    }
    delay(0.25);
  }
  throw new Error("its window didn't appear");
}

// Gemini only focuses its message box in some chats, so fall back to finding and focusing it.
// A freshly launched app can still be building its window, so keep trying until the deadline.
function waitForInput(process, win) {
  const deadline = Date.now() + LAUNCH_TIMEOUT_SECONDS * 1000;
  while (Date.now() < deadline) {
    process.frontmost = true;
    const focused = focusedInput(process);
    if (focused !== null) return focused;

    const input = inputAtKnownPath(win) || findInput(win);
    if (input !== null) {
      input.focused = true;
      return input;
    }
    delay(0.1);
  }
  throw new Error("its message box didn't appear");
}

function run(argv) {
  const [prompt, mode] = argv;

  // Launches Gemini if needed, and reopens a window if every window was closed
  app.doShellScript(`open -b ${BUNDLE_ID}`);

  const { process, win } = waitForWindow();
  process.frontmost = true;
  win.actions.byName("AXRaise").perform();
  centerWindow(win);

  if (mode === TEMPORARY_MODE) {
    process.menuBars[0].menuBarItems.byName("File").menus[0].menuItems.byName("New Temporary Chat").click();
    delay(0.5);
  }

  const input = waitForInput(process, win);
  input.value = prompt;
  delay(0.2);
  systemEvents.keyCode(RETURN_KEY);
}
