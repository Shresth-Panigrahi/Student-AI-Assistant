import type { LectureLyftBridge } from './ipc';

declare global {
  interface Window {
    lectureLyft?: LectureLyftBridge;
  }
}

export {};
