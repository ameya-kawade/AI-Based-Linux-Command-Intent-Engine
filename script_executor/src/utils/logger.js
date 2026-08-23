const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

const formatMessage = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
};

const logger = {
  debug: (msg, meta) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatMessage(LogLevel.DEBUG, msg, meta));
    }
  },
  info: (msg, meta) => console.log(formatMessage(LogLevel.INFO, msg, meta)),
  warn: (msg, meta) => console.warn(formatMessage(LogLevel.WARN, msg, meta)),
  error: (msg, meta) => console.error(formatMessage(LogLevel.ERROR, msg, meta)),
};

module.exports = logger;
