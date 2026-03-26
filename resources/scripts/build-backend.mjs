import { access, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const backendDir = path.join(rootDir, 'backend');
const outputDir = path.join(rootDir, 'resources', 'backend-dist');
const pyinstallerWorkDir = path.join(rootDir, '.cache', 'pyinstaller', 'build');
const pyinstallerSpecDir = path.join(rootDir, '.cache', 'pyinstaller', 'spec');
const entryScript = path.join(rootDir, 'resources', 'scripts', 'backend-entry.py');
const binaryDirName = 'lecture-lyft-backend';

const collectAllPackages = [
  'fastapi',
  'uvicorn',
  'websockets',
  'groq',
  'dotenv',
  'pymongo',
  'slowapi',
  'langchain',
  'langchain_core',
  'langchain_groq',
  'langgraph',
  'faster_whisper',
  'ctranslate2',
  'tokenizers',
  'numpy',
  'sounddevice',
  'soundfile'
];

const hiddenImports = [
  'uvicorn.logging',
  'uvicorn.loops.auto',
  'uvicorn.protocols.http.auto',
  'uvicorn.protocols.websockets.auto',
  'websockets.legacy',
  'websockets.legacy.client',
  'websockets.legacy.server'
];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      },
      ...options
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function pythonCandidates() {
  if (process.env.LECTURE_LYFT_PYTHON) {
    return [[process.env.LECTURE_LYFT_PYTHON, []]];
  }

  const candidates = [];
  const localVenv =
    process.platform === 'win32'
      ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
      : path.join(backendDir, 'venv', 'bin', 'python');

  const whisperxVenv =
    process.platform === 'win32'
      ? path.join(backendDir, 'venv_whisperx', 'Scripts', 'python.exe')
      : path.join(backendDir, 'venv_whisperx', 'bin', 'python');

  candidates.push([localVenv, []], [whisperxVenv, []], ['python3', []], ['python', []]);

  if (process.platform === 'win32') {
    candidates.push(['py', ['-3']]);
  }

  return candidates;
}

async function resolvePythonCommand() {
  for (const [candidate, prefixArgs] of pythonCandidates()) {
    if (candidate.includes(path.sep) && !(await exists(candidate))) {
      continue;
    }

    try {
      await run(candidate, [...prefixArgs, '--version'], { stdio: 'ignore' });
      return { command: candidate, prefixArgs };
    } catch {
      continue;
    }
  }

  throw new Error('Unable to find a Python 3 interpreter for backend packaging.');
}

async function copyIfPresent(source, destination) {
  if (await exists(source)) {
    await cp(source, destination, { recursive: true, force: true });
  }
}

async function main() {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await mkdir(pyinstallerWorkDir, { recursive: true });
  await mkdir(pyinstallerSpecDir, { recursive: true });

  const { command, prefixArgs } = await resolvePythonCommand();
  const args = [
    ...prefixArgs,
    '-m',
    'PyInstaller',
    '--noconfirm',
    '--clean',
    '--onedir',
    '--name',
    binaryDirName,
    '--distpath',
    outputDir,
    '--workpath',
    pyinstallerWorkDir,
    '--specpath',
    pyinstallerSpecDir,
    '--paths',
    backendDir
  ];

  for (const pkg of collectAllPackages) {
    args.push('--collect-all', pkg);
  }

  for (const hiddenImport of hiddenImports) {
    args.push('--hidden-import', hiddenImport);
  }

  args.push(entryScript);

  await run(command, args);

  const packagedBackendDir = path.join(outputDir, binaryDirName);
  await copyIfPresent(path.join(backendDir, '.env'), path.join(packagedBackendDir, '.env'));
  await copyIfPresent(path.join(backendDir, 'whisperx_worker.py'), path.join(packagedBackendDir, 'whisperx_worker.py'));
  await copyIfPresent(path.join(backendDir, 'venv_whisperx'), path.join(packagedBackendDir, 'venv_whisperx'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
