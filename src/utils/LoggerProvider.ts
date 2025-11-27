import pino from "pino";

class LoggerProvider {
    
    private baseLogger: pino.Logger;

    constructor(logLevel?:string) {
        this.baseLogger = pino(
        {
            level: process.env.PINO_LOG_LEVEL,
            formatters: {
            level: (label) => {
                return { level: label.toUpperCase() };
            },
            },
            timestamp: pino.stdTimeFunctions.isoTime,
        }
        );

        const consoleLogger = pino({
          level: logLevel || "info",
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
        let childLogger = this.baseLogger.child({"route": loggerName});

        let transport = pino.transport({
            target: 'pino/file',
            options: { destination: `${__dirname}/${loggerName}.log` },
        });

        pino(transport)
    }
}