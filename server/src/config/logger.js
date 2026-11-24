import winston from "winston";

const { combine, timestamp, errors, json, colorize, printf } = winston.format;
const isProduction = process.env.NODE_ENV === "production";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  format: combine(timestamp(), errors({ stack: true }), json()),
  transports: [
    new winston.transports.Console({
      format: isProduction
        ? combine(timestamp(), errors({ stack: true }), json())
        : combine(colorize(), timestamp({ format: "HH:mm:ss" }), printf(({ timestamp: time, level, message, ...meta }) => {
            const details = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
            return `${time} ${level}: ${message}${details}`;
          }))
    })
  ],
  exitOnError: false
});

export default logger;
