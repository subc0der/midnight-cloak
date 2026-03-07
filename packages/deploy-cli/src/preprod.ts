// Preprod deployment entry point for Midnight Cloak
// Connects to Midnight Preprod network with local proof server

import { pino } from 'pino';
import { run } from './cli.js';
import { PreprodConfig } from './config.js';

const config = new PreprodConfig();

// Simple console logger with pino-pretty for readability
const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

logger.info('Starting Midnight Cloak deployment CLI (Preprod)');

run(config, logger).catch((err) => {
  logger.error(err);
  process.exit(1);
});
