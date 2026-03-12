export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface LogContext {
  userId?: string;
  projectId?: string;
  correlationId?: string;
  component?: string;
  phase?: string;
  [key: string]: any;
}

export class Logger {
  private static defaultContext: LogContext = {
    service: 'AIBuilder'
  };

  static configure(context: LogContext) {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  private static formatLog(level: LogLevel, message: string, context?: LogContext, error?: any) {
    const timestamp = new Date().toISOString();
    const mergedContext = { ...this.defaultContext, ...context };
    
    // Ensure error objects are properly serialized
    const errorData = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...error
    } : undefined;

    return JSON.stringify({
      timestamp,
      severity: level, // Google Cloud uses 'severity'
      message,
      context: mergedContext,
      error: errorData
    });
  }

  static debug(message: string, context?: LogContext) {
    console.log(this.formatLog(LogLevel.DEBUG, message, context));
  }

  static info(message: string, context?: LogContext) {
    console.log(this.formatLog(LogLevel.INFO, message, context));
  }

  static warn(message: string, context?: LogContext, error?: any) {
    console.warn(this.formatLog(LogLevel.WARN, message, context, error));
  }

  static error(message: string, error?: any, context?: LogContext) {
    console.error(this.formatLog(LogLevel.ERROR, message, context, error));
  }
}
