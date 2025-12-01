import pino from "pino";
import { inject, injectable } from "tsyringe";

@injectable()
export class AppLogger {
    
    public static DEFAULT_LOG_LEVEL:string = "info";

    private logDirectory: string;
    private logLevel: string;

    constructor(
      @inject("log.level") logLevel?:string,
      @inject("log.directory") logDirectory?:string
    ) {
        this.logDirectory = logDirectory!;
        this.logLevel = logLevel || AppLogger.DEFAULT_LOG_LEVEL;

        const consoleLogger = pino({
          level: logLevel!,
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:dd-mm-yyyy HH:MM:ss",
              ignore: "pid,hostname",
            },
          },
          base: {
            pid: false,
            hostname: false,
          },
          timestamp: pino.stdTimeFunctions.isoTime,
        });
    }
    
    getLogger(loggerName: string) {
      const transport = pino.transport({
        targets: [
          {
            target: 'pino/file',
            options: { destination: `${this.logDirectory}/${loggerName}.log` },
          },
          {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:dd-mm-yyyy HH:MM:ss",
              ignore: "pid,hostname",
            }
          },
        ],
      });


      let logger = pino({
            level: this.logLevel,
            formatters: {
            level: (label) => {
                return { level: label.toUpperCase() };
            },
            },
            timestamp: pino.stdTimeFunctions.isoTime,
        },
        transport
      );

      return logger;
    }
}