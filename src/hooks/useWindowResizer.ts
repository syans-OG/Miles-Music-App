import { useEffect, useLayoutEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from '../stores/usePlayerStore';
import { isTauri } from '../utils/tauriEnv';

export const useWindowResizer = () => {
  const { mode, isDrawerOpen, isUrlInputOpen, youtubeImportTask, spotifyImportTask, dockPosition, setDockPosition } = usePlayerStore(useShallow((state) => ({
    mode: state.mode,
    isDrawerOpen: state.isDrawerOpen,
    isUrlInputOpen: state.isUrlInputOpen,
    youtubeImportTask: state.youtubeImportTask,
    spotifyImportTask: state.spotifyImportTask,
    dockPosition: state.dockPosition,
    setDockPosition: state.setDockPosition,
  })));

  // Resize window according to mode & drawer state
  useLayoutEffect(() => {
    const resizeWindow = () => {
      // Determine target sizes in Logical Pixels
      let targetWidth = 460;
      let targetHeight = 200;

      if (mode === 'control-bar') {
        targetWidth = 440;
        targetHeight = isDrawerOpen
          ? 615
          : isUrlInputOpen
            ? youtubeImportTask?.report || spotifyImportTask?.report
              ? 400
              : youtubeImportTask || spotifyImportTask ? 310 : 270
            : youtubeImportTask?.status === 'success' && youtubeImportTask.backgrounded ? 270 : 185;
      } else if (mode === 'vinyl-widget') {
        targetWidth = 185;
        targetHeight = 185;
      } else if (mode === 'micro-bubble') {
        targetWidth = 64;
        targetHeight = 64;
      }

      try {
        // Do not render the new mode inside the previous mode's viewport.
        // Delaying this resize caused center/end flex alignment to jump after
        // the CSS animation, while left alignment happened to remain stable.
        void invoke('resize_widget_window', {
          width: targetWidth,
          height: targetHeight,
          dockPosition: dockPosition
        }).catch((error) => {
          if (isTauri()) console.error('[useWindowResizer] resize invoke failed:', error);
        });
      } catch (error) {
        if (isTauri()) console.error('[useWindowResizer] resize threw:', error);
      }
    };

    resizeWindow();
  }, [mode, isDrawerOpen, isUrlInputOpen, youtubeImportTask, spotifyImportTask, dockPosition]);


  // Automatic Magnetic Auto-Snap Listener when dragging ends
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let moveTimeout: ReturnType<typeof setTimeout> | null = null;

    const setupMoveListener = async () => {
      try {
        const win = getCurrentWindow();
        unlisten = await win.onMoved(() => {
          if (moveTimeout) clearTimeout(moveTimeout);
          // Debounce: when movement stops for 150ms after release, perform magnetic snap
          moveTimeout = setTimeout(() => {
            handleMagneticSnapOnRelease(setDockPosition);
          }, 150);
        });
      } catch (error) {
        if (isTauri()) console.error('[useWindowResizer] onMoved listener setup failed:', error);
      }
    };

    const handleMouseUp = () => {
      // Secondary trigger on mouse release
      setTimeout(() => {
        handleMagneticSnapOnRelease(setDockPosition);
      }, 50);
    };

    setupMoveListener();
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      if (unlisten) unlisten();
      if (moveTimeout) clearTimeout(moveTimeout);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setDockPosition]);
};

export const handleMagneticSnapOnRelease = async (setDockPosition: (pos: any) => void) => {
  try {
    const newPosition = await invoke<string>('handle_drag_end_snap');
    setDockPosition(newPosition);
  } catch (error) {
    if (isTauri()) console.error('[useWindowResizer] magnetic snap failed:', error);
  }
};

export const autoDetectDockPosition = async (setDockPosition: (pos: any) => void) => {
  try {
    const detected = await invoke<string>('detect_dock_position');
    setDockPosition(detected);
  } catch (error) {
    if (isTauri()) console.error('[useWindowResizer] dock position detection failed:', error);
  }
};
