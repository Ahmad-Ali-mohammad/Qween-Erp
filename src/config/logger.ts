import fs from 'fs';
import path from 'path';
import winston from 'winston';
import { env } from './env';

if (!fs.existsSync(env.logFilePath)) {
  fs.mkdirSync(env.logFilePath, { recursive: true });
}

const baseFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}] ${message}${extra}`;
  })
);

export const logger = winston.createLogger({
  level: env.logLevel,
  format: baseFormat,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({ filename: path.join(env.logFilePath, 'combined.log') }),
    new winston.transports.File({ filename: path.join(env.logFilePath, 'error.log'), level: 'error' })
  ]
});
