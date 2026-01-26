/**
 * Simple logging interface for CLI applications
 * Independent version for lain-lang package
 */

export type LogLevel = "info" | "warn" | "error" | "success";

export interface LogMessage {
    level: LogLevel;
    message: string;
}

export interface Logger {
    log(messages: LogMessage[]): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    success(message: string): void;
}

/**
 * Default console logger implementation
 */
class ConsoleLogger implements Logger {
    log(messages: LogMessage[]): void {
        messages.forEach(({ level, message }) => {
            switch (level) {
                case "info":
                    console.log(message);
                    break;
                case "warn":
                    console.warn(message);
                    break;
                case "error":
                    console.error(message);
                    break;
                case "success":
                    console.log(message);
                    break;
            }
        });
    }

    info(message: string): void {
        console.log(message);
    }

    warn(message: string): void {
        console.warn(message);
    }

    error(message: string): void {
        console.error(message);
    }

    success(message: string): void {
        console.log(message);
    }
}

// Default logger instance
export const logger: Logger = new ConsoleLogger();

/**
 * Helper to create log messages
 */
export const create_log_messages = (...messages: Array<{ level: LogLevel; message: string }>): LogMessage[] => {
    return messages;
};

/**
 * Batch log helper - logs an array of messages at once
 */
export const batch_log = (messages: LogMessage[]): void => {
    logger.log(messages);
};
