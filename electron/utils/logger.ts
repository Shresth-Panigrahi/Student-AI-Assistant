import log from 'electron-log';

let configured = false;

export function configureLogger(): typeof log {
  if (configured) {
    return log;
  }

  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
  log.transports.file.level = 'info';
  log.transports.file.maxSize = 5 * 1024 * 1024;
  configured = true;

  return log;
}

export function createLogger(scope: string) {
  return configureLogger().scope(scope);
}

export const logger = configureLogger();
