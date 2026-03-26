import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import {
  BACKEND_HEALTH_URL,
  BACKEND_HOST,
  BACKEND_PORT,
  BACKEND_URL,
  BACKEND_WS_URL,
  getBackendSourceDir,
  getBundledBackendExecutableCandidates,
  getBundledBackendRootCandidates,
  isDevelopment
} from './utils/paths';
import { createLogger } from './utils/logger';

export type BackendLifecycleState = 'stopped' | 'starting' | 'ready' | 'restarting' | 'error';

export interface BackendState {
  state: BackendLifecycleState;
  pid: number | null;
  healthy: boolean;
  backendUrl: string;
  wsUrl: string;
  lastError: string | null;
  restartCount: number;
}

export interface BackendProgress {
  attempt: number;
  progress: number;
  message: string;
}

type LaunchConfig = {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
};

const logger = createLogger('backend');

export class BackendManager extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private state: BackendLifecycleState = 'stopped';
  private healthy = false;
  private lastError: string | null = null;
  private restartCount = 0;
  private stopping = false;
  private stopPromise: Promise<void> | null = null;

  getState(): BackendState {
    return {
      state: this.state,
      pid: this.child?.pid ?? null,
      healthy: this.healthy,
      backendUrl: BACKEND_URL,
      wsUrl: BACKEND_WS_URL,
      lastError: this.lastError,
      restartCount: this.restartCount
    };
  }

  async startAndWait(onProgress?: (progress: BackendProgress) => void) {
    await this.start();
    await this.waitUntilHealthy(onProgress);
  }

  async start() {
    if (this.child) {
      return;
    }

    this.stopping = false;
    this.healthy = false;
    this.lastError = null;
    this.state = this.restartCount > 0 ? 'restarting' : 'starting';
    this.emitStatus();

    const launchConfig = await this.resolveLaunchConfig();
    logger.info(`Launching backend: ${launchConfig.command} ${launchConfig.args.join(' ')}`);

    this.child = spawn(launchConfig.command, launchConfig.args, {
      cwd: launchConfig.cwd,
      env: launchConfig.env,
      stdio: 'pipe'
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      logger.info(chunk.trimEnd());
      this.emit('log', { level: 'info', message: chunk });
    });
    this.child.stderr.on('data', (chunk: string) => {
      logger.warn(chunk.trimEnd());
      this.emit('log', { level: 'warn', message: chunk });
    });

    this.child.once('exit', (code, signal) => {
      logger.warn(`Backend exited with code=${code ?? 'null'} signal=${signal ?? 'null'}`);
      this.child = null;
      this.healthy = false;

      if (this.stopping) {
        this.state = 'stopped';
        this.emitStatus();
        return;
      }

      if (this.restartCount < 1) {
        this.restartCount += 1;
        this.state = 'restarting';
        this.lastError = `Backend exited unexpectedly (${code ?? signal ?? 'unknown'})`;
        this.emitStatus();
        void this.start().catch((error) => {
          this.state = 'error';
          this.lastError = error instanceof Error ? error.message : String(error);
          this.emitStatus();
        });
        return;
      }

      this.state = 'error';
      this.lastError = `Backend crashed after retry (${code ?? signal ?? 'unknown'})`;
      this.emitStatus();
    });

    this.emitStatus();
  }

  async restartAndWait(onProgress?: (progress: BackendProgress) => void) {
    this.restartCount = 0;
    await this.stop();
    await this.startAndWait(onProgress);
  }

  async stop() {
    if (!this.child) {
      this.state = 'stopped';
      this.healthy = false;
      this.emitStatus();
      return;
    }

    if (this.stopPromise) {
      return this.stopPromise;
    }

    const child = this.child;
    this.stopping = true;
    this.healthy = false;
    this.state = 'stopped';
    this.emitStatus();

    this.stopPromise = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (!child.killed && child.pid) {
          if (process.platform === 'win32') {
            const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
              stdio: 'ignore'
            });
            killer.once('exit', () => resolve());
          } else {
            child.kill('SIGKILL');
            resolve();
          }
        } else {
          resolve();
        }
      }, 5_000);

      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      child.kill('SIGTERM');
    }).finally(() => {
      this.child = null;
      this.stopPromise = null;
    });

    await this.stopPromise;
  }

  private emitStatus() {
    this.emit('status', this.getState());
  }

  private async waitUntilHealthy(onProgress?: (progress: BackendProgress) => void) {
    const startedAt = Date.now();
    let attempt = 0;

    while (Date.now() - startedAt < 45_000) {
      attempt += 1;
      onProgress?.({
        attempt,
        progress: Math.min(78, 22 + attempt * 3),
        message: attempt === 1 ? 'Booting AI services...' : `Waiting for backend health check (${attempt})...`
      });

      if (await this.checkHealth()) {
        this.healthy = true;
        this.state = 'ready';
        this.restartCount = 0;
        this.lastError = null;
        this.emitStatus();
        logger.info('Backend reported healthy');
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 750));
    }

    this.state = 'error';
    this.lastError = `Backend failed health check at ${BACKEND_HEALTH_URL}`;
    this.emitStatus();
    throw new Error(this.lastError);
  }

  private async checkHealth() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_500);

    try {
      const response = await fetch(BACKEND_HEALTH_URL, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          accept: 'application/json'
        }
      });

      if (!response.ok) {
        return false;
      }

      const payload = (await response.json()) as { status?: string };
      return payload.status === 'healthy';
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveLaunchConfig(): Promise<LaunchConfig> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      LECTURE_LYFT_BACKEND_HOST: BACKEND_HOST,
      LECTURE_LYFT_BACKEND_PORT: String(BACKEND_PORT),
      LECTURE_LYFT_BACKEND_URL: BACKEND_URL,
      LECTURE_LYFT_WS_URL: BACKEND_WS_URL
    };

    if (isDevelopment()) {
      const backendDir = getBackendSourceDir();
      const pythonCommand = this.resolveDevelopmentPythonCommand(backendDir);

      return {
        command: pythonCommand.command,
        args: [...pythonCommand.args, path.join(backendDir, 'main.py')],
        cwd: backendDir,
        env
      };
    }

    const executable = this.resolvePackagedExecutable();
    const runtimeBackendDir = this.resolvePackagedBackendRoot();
    env.LECTURE_LYFT_RUNTIME_BACKEND_DIR = runtimeBackendDir;
    env.LECTURE_LYFT_WHISPERX_WORKER = path.join(runtimeBackendDir, 'whisperx_worker.py');
    env.LECTURE_LYFT_WHISPERX_PYTHON = path.join(
      runtimeBackendDir,
      'venv_whisperx',
      process.platform === 'win32' ? 'Scripts' : 'bin',
      process.platform === 'win32' ? 'python.exe' : 'python'
    );

    return {
      command: executable,
      args: [],
      cwd: runtimeBackendDir,
      env
    };
  }

  private resolveDevelopmentPythonCommand(backendDir: string) {
    const candidates: Array<{ command: string; args: string[] }> = [
      {
        command:
          process.platform === 'win32'
            ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
            : path.join(backendDir, 'venv', 'bin', 'python'),
        args: []
      },
      {
        command:
          process.platform === 'win32'
            ? path.join(backendDir, 'venv_whisperx', 'Scripts', 'python.exe')
            : path.join(backendDir, 'venv_whisperx', 'bin', 'python'),
        args: []
      },
      { command: 'python3', args: [] },
      { command: 'python', args: [] }
    ];

    if (process.platform === 'win32') {
      candidates.push({ command: 'py', args: ['-3'] });
    }

    for (const candidate of candidates) {
      if (!candidate.command.includes(path.sep) || existsSync(candidate.command)) {
        return candidate;
      }
    }

    throw new Error('No Python interpreter found for backend startup.');
  }

  private resolvePackagedExecutable() {
    const executable = getBundledBackendExecutableCandidates().find((candidate) => existsSync(candidate));

    if (!executable) {
      throw new Error('Packaged backend executable was not found in extra resources.');
    }

    return executable;
  }

  private resolvePackagedBackendRoot() {
    const backendRoot = getBundledBackendRootCandidates().find((candidate) => existsSync(candidate));

    if (!backendRoot) {
      throw new Error('Packaged backend resources directory is missing.');
    }

    return backendRoot;
  }
}
