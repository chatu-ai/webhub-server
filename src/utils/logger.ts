import pino, { Logger } from 'pino';

let logger: Logger;

export function createLogger(options?: {
  level?: string;
  name?: string;
}): Logger {
  const envLevel = process.env.LOG_LEVEL || 'info';
  const level = options?.level || envLevel;

  logger = pino({
    name: options?.name || 'webhub',
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    base: {
      service: 'webhub',
      version: process.env.npm_package_version || '1.0.0',
    },
  });

  return logger;
}

export function getLogger(): Logger {
  if (!logger) {
    return createLogger();
  }
  return logger;
}

// Helper for request logging
export function createRequestLogger(logger: Logger) {
  return {
    logRequest: (
      method: string,
      path: string,
      statusCode: number,
      responseTime: number,
      requestId?: string
    ) => {
      logger.info({
        type: 'request',
        method,
        path,
        statusCode,
        responseTime,
        requestId,
      });
    },
    logError: (method: string, path: string, error: Error, requestId?: string) => {
      logger.error({
        type: 'request_error',
        method,
        path,
        error: error.message,
        stack: error.stack,
        requestId,
      });
    },
  };
}
