/**
 * Centralized Logger Utility
 * Logs messages in development (__DEV__) and suppresses verbose logs in production.
 */

/* eslint-disable no-console */
export const logger = {
  log: (...args: any[]) => {
    if (__DEV__) {
      console.log('[LOG]', ...args);
    }
  },
  warn: (...args: any[]) => {
    if (__DEV__) {
      console.warn('[WARN]', ...args);
    }
  },
  error: (...args: any[]) => {
    if (__DEV__) {
      console.error('[ERROR]', ...args);
    }
  },
  info: (...args: any[]) => {
    if (__DEV__) {
      console.info('[INFO]', ...args);
    }
  },
};
