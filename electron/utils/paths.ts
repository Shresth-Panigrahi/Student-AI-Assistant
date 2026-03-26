import path from 'node:path';
import { existsSync } from 'node:fs';
import { app } from 'electron';

const DEFAULT_BACKEND_HOST = process.env.LECTURE_LYFT_BACKEND_HOST ?? '127.0.0.1';
const DEFAULT_BACKEND_PORT = Number(process.env.LECTURE_LYFT_BACKEND_PORT ?? '8000');

export const BACKEND_HOST = DEFAULT_BACKEND_HOST;
export const BACKEND_PORT = DEFAULT_BACKEND_PORT;
export const BACKEND_URL = process.env.LECTURE_LYFT_BACKEND_URL ?? `http://${BACKEND_HOST}:${BACKEND_PORT}`;
export const BACKEND_WS_URL = process.env.LECTURE_LYFT_WS_URL ?? `ws://${BACKEND_HOST}:${BACKEND_PORT}/ws`;
export const BACKEND_HEALTH_URL = `${BACKEND_URL}/api/health`;

export function isDevelopment() {
  return !app.isPackaged || process.env.NODE_ENV === 'development' || Boolean(process.env.VITE_DEV_SERVER_URL);
}

export function getProjectRoot() {
  if (app.isPackaged) {
    return app.getAppPath();
  }

  const candidates = [
    process.env.LECTURE_LYFT_PROJECT_ROOT,
    process.cwd(),
    app.getAppPath(),
    path.resolve(__dirname, '..', '..')
  ].filter((candidate): candidate is string => Boolean(candidate));

  const projectRoot = candidates.find((candidate) => {
    return existsSync(path.join(candidate, 'package.json')) && existsSync(path.join(candidate, 'backend'));
  });

  return projectRoot ?? path.resolve(__dirname, '..', '..');
}

export function getPreloadPath() {
  return path.join(__dirname, 'preload.js');
}

export function getDevServerUrl() {
  return process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:3000';
}

export function getRendererHtmlPath() {
  return path.join(getProjectRoot(), 'webapp', 'dist', 'index.html');
}

export function getBackendSourceDir() {
  return path.join(getProjectRoot(), 'backend');
}

export function getBuildResourcesDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'icons') : path.join(getProjectRoot(), 'resources', 'icons');
}

export function getAppIconPath() {
  const extension = process.platform === 'win32' ? 'ico' : 'png';
  const iconPath = path.join(getBuildResourcesDir(), `icon.${extension}`);

  if (existsSync(iconPath)) {
    return iconPath;
  }

  return path.join(getProjectRoot(), 'webapp', 'public', 'favicon.png');
}

export function getBundledBackendRootCandidates() {
  return [
    path.join(process.resourcesPath, 'backend', 'lecture-lyft-backend'),
    path.join(process.resourcesPath, 'backend')
  ];
}

export function getBundledBackendExecutableCandidates() {
  const executableName = process.platform === 'win32' ? 'lecture-lyft-backend.exe' : 'lecture-lyft-backend';

  return getBundledBackendRootCandidates().flatMap((backendRoot) => [
    path.join(backendRoot, executableName),
    path.join(backendRoot, 'lecture-lyft-backend', executableName)
  ]);
}
