import config from '../config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const logLevels: { [key: string]: number } = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private prefix: string;
  private level: number;

  constructor(prefix: string = 'App') {
    this.prefix = prefix;
    const configLevel = (config.logging.level as LogLevel) || 'info';
    this.level = logLevels[configLevel] || logLevels.info;
  }

  info(message: string, ...args: any[]): void {
    if (this.level <= logLevels.info) {
      console.log(`[${new Date().toISOString()}] [${this.prefix}] [INFO] ${message}`, ...args);
    }
  }

  error(message: string, error?: any): void {
    if (this.level <= logLevels.error) {
      console.error(`[${new Date().toISOString()}] [${this.prefix}] [ERROR] ${message}`, error);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.level <= logLevels.warn) {
      console.warn(`[${new Date().toISOString()}] [${this.prefix}] [WARN] ${message}`, ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.level <= logLevels.debug) {
      console.debug(`[${new Date().toISOString()}] [${this.prefix}] [DEBUG] ${message}`, ...args);
    }
  }
}

export default new Logger();
