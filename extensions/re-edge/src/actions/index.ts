import { PopToRootType, closeMainWindow, popToRoot } from "@raycast/api";
import { SettingsProfileOpenBehaviour, Tab } from "../types/interfaces";
import { getApplicationName } from "../utils/appUtils";
import { geNotInstalledMessage } from "../utils/messageUtils";
import { DEFAULT_PROFILE_ID } from "../constants";
import { runAppleScript } from "@raycast/utils";

export async function getOpenTabs(): Promise<Tab[]> {
  await validateAppIsInstalled();

  const openTabs = await runAppleScript(`
      set _output to ""
      tell application "${getApplicationName()}"
        set _window_index to 1
        repeat with w in windows
          set _tab_index to 1
          repeat with t in tabs of w
            set _title to get title of t
            set _url to get URL of t
            set _favicon to ""
            set _output to (_output & _title & "${Tab.TAB_CONTENTS_SEPARATOR}" & _url & "${
              Tab.TAB_CONTENTS_SEPARATOR
            }" & _favicon & "${Tab.TAB_CONTENTS_SEPARATOR}" & _window_index & "${
              Tab.TAB_CONTENTS_SEPARATOR
            }" & _tab_index & "\\n")
            set _tab_index to _tab_index + 1
          end repeat
          set _window_index to _window_index + 1
          if _window_index > count windows then exit repeat
        end repeat
      end tell
      return _output
  `);

  return openTabs
    .split("\n")
    .filter((line) => line.length !== 0)
    .map((line) => Tab.parse(line));
}

export async function openNewTab({
  url,
  query,
  profileCurrent,
  profileOriginal = DEFAULT_PROFILE_ID,
  openTabInProfile,
}: {
  url?: string;
  query?: string;
  profileCurrent: string;
  profileOriginal?: string;
  openTabInProfile: SettingsProfileOpenBehaviour;
}): Promise<boolean | string> {
  setTimeout(() => {
    popToRoot({ clearSearchBar: true });
  }, 3000);
  await Promise.all([
    closeMainWindow({ clearRootSearch: true, popToRootType: PopToRootType.Suspended }),
    validateAppIsInstalled(),
  ]);

  let script = "";

  const getOpenInProfileCommand = (profile: string) => `
    set profile to quoted form of "${profile}"
    set link to quoted form of "${url ? url : query ? "https://google.com/search?q=" + query : "about:blank"}"
    do shell script "open -na '${getApplicationName()}' --args --profile-directory=" & profile & " " & link
  `;

  switch (openTabInProfile) {
    case SettingsProfileOpenBehaviour.Default:
      script = getOpenInProfileCommand(DEFAULT_PROFILE_ID);
      break;
    case SettingsProfileOpenBehaviour.ProfileCurrent:
      script = getOpenInProfileCommand(profileCurrent);
      break;
    case SettingsProfileOpenBehaviour.ProfileOriginal:
      script = getOpenInProfileCommand(profileOriginal);
      break;
  }

  return await runAppleScript(script);
}

export async function setActiveTab(tab: Tab): Promise<void> {
  await runAppleScript(`
    tell application "${getApplicationName()}"
      -- this iteration finds the first window that has the target tab, restores it if
      -- minimized, activates the target tab and brings that window to front
      set _targetURL to "${tab.url}"
      set _found to false
      repeat with w in windows
        set _tab_index to 1
        repeat with t in tabs of w
          if URL of t is equal to _targetURL then
            if minimized of w then set minimized of w to false
            set active tab index of w to _tab_index
            -- w is a positional reference, so reorder it last
            set index of w to 1
            set _found to true
            exit repeat
          end if
          set _tab_index to _tab_index + 1
        end repeat
        if _found then exit repeat
      end repeat

      activate
    end tell
  `);
}

export const validateAppIsInstalled = async () => {
  const appInstalled = await runAppleScript(`
    set isInstalled to false
    try
        do shell script "osascript -e 'exists application \\"${getApplicationName()}\\"'"
        set isInstalled to true
    end try

    return isInstalled`);

  if (appInstalled === "false") {
    throw new Error(geNotInstalledMessage());
  }
};

export async function getActiveTabUrl(): Promise<string> {
  await validateAppIsInstalled();

  const activeTabUrl = await runAppleScript(
    `tell application "${getApplicationName()}" to return URL of active tab of front window`,
  );

  return activeTabUrl;
}
