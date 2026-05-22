import { useState, useEffect, useCallback } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { Locale, t } from "../i18n";

const DEV_MOCK_KEY = "log_analysis_dev_mock_update";

export interface UpdateState {
  available: boolean;
  update: Update | null;
  checking: boolean;
  downloading: boolean;
  downloadProgress: number;
}

export const useAutoUpdater = (locale: Locale) => {
  const isDev = import.meta.env.DEV;

  const [updateState, setUpdateState] = useState<UpdateState>({
    available: false,
    update: null,
    checking: false,
    downloading: false,
    downloadProgress: 0,
  });

  const mockCheckForUpdate = useCallback(async (showPrompt: boolean) => {
    const mockHasUpdate = localStorage.getItem(DEV_MOCK_KEY) === "available";

    setUpdateState((prev) => ({ ...prev, checking: true }));
    await new Promise((r) => setTimeout(r, 800));

    if (!mockHasUpdate) {
      setUpdateState({
        available: false,
        update: null,
        checking: false,
        downloading: false,
        downloadProgress: 0,
      });
      if (showPrompt) {
        window.alert(t("updateAlreadyLatest", locale));
      }
      return;
    }

    setUpdateState({
      available: true,
      update: null,
      checking: false,
      downloading: false,
      downloadProgress: 0,
    });

    if (showPrompt) {
      const shouldInstall = window.confirm(
        t("updateAvailable", locale)
          .replace("{version}", "9.9.9")
          .replace("{currentVersion}", "0.1.0")
      );
      if (shouldInstall) {
        await mockInstallUpdate();
      }
    }
  }, [locale]);

  const mockInstallUpdate = async () => {
    setUpdateState((prev) => ({ ...prev, downloading: true, downloadProgress: 0 }));
    for (let i = 5; i <= 100; i += 5) {
      await new Promise((r) => setTimeout(r, 150));
      setUpdateState((prev) => ({ ...prev, downloadProgress: i }));
    }
    setUpdateState((prev) => ({
      ...prev,
      available: false,
      downloading: false,
      downloadProgress: 0,
    }));
    window.alert("Mock: update installed, would relaunch now.");
  };

  const checkForUpdate = useCallback(async (showPrompt = false) => {
    if (isDev) {
      return mockCheckForUpdate(showPrompt);
    }

    setUpdateState((prev) => ({ ...prev, checking: true }));

    try {
      const update = await check();
      
      if (!update) {
        setUpdateState({
          available: false,
          update: null,
          checking: false,
          downloading: false,
          downloadProgress: 0,
        });
        
        if (showPrompt) {
          window.alert(t("updateAlreadyLatest", locale));
        }
        return;
      }

      setUpdateState({
        available: true,
        update,
        checking: false,
        downloading: false,
        downloadProgress: 0,
      });

      if (showPrompt) {
        const shouldInstall = window.confirm(
          t("updateAvailable", locale)
            .replace("{version}", update.version)
            .replace("{currentVersion}", update.currentVersion)
        );
        
        if (shouldInstall) {
          await installUpdate(update);
        }
      }
    } catch (error) {
      console.warn("Update check failed", error);
      setUpdateState((prev) => ({ ...prev, checking: false }));
      
      if (showPrompt) {
        window.alert(t("updateCheckFailed", locale));
      }
    }
  }, [locale, isDev, mockCheckForUpdate]);

  const installUpdate = async (update: Update) => {
    setUpdateState((prev) => ({ ...prev, downloading: true, downloadProgress: 0 }));

    let downloaded = 0;
    let contentLength = 0;
    
    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength || 0;
          downloaded = 0;
          return;
        }

        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            const percent = Math.round((downloaded / contentLength) * 100);
            setUpdateState((prev) => ({ ...prev, downloadProgress: percent }));
          }
        }
      });

    } catch (error) {
      console.error("Update installation failed", error);
      setUpdateState((prev) => ({ ...prev, downloading: false, downloadProgress: 0 }));
      window.alert(t("updateInstallFailed", locale));
      return;
    }

    try {
      await relaunch();
    } catch (relaunchError) {
      console.error("Relaunch failed after update", relaunchError);
      window.alert(t("updateInstallFailed", locale));
    }
  };

  useEffect(() => {
    checkForUpdate(false);

    const intervalMs = isDev ? 10 * 1000 : 60 * 60 * 1000;
    const intervalId = setInterval(() => {
      checkForUpdate(false);
    }, intervalMs);

    return () => {
      clearInterval(intervalId);
    };
  }, [checkForUpdate, isDev]);

  return {
    ...updateState,
    checkForUpdate,
    installUpdate,
  };
};
