/**
 * ロガーユーティリティ
 * 構造化ログを出力
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  location: string;
  [key: string]: unknown;
}

/**
 * 呼び出し元の位置情報を取得
 * @returns ファイル:行番号 形式の文字列
 */
function getCallerLocation(): string {
  const error = new Error();
  const stack = error.stack?.split('\n');
  if (stack && stack.length >= 4) {
    const callerLine = stack[3];
    const match = callerLine.match(/at\s+(?:.+\s+)?\(?(.+):(\d+):\d+\)?/);
    if (match) {
      const filePath = match[1];
      const lineNumber = match[2];
      const fileName = filePath.split('/').pop();
      return `${fileName}:${lineNumber}`;
    }
  }
  return 'unknown';
}

/**
 * ログを出力
 * @param level ログレベル
 * @param message メッセージ
 * @param data 追加データ
 */
function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    location: getCallerLocation(),
    ...data,
  };

  const output = JSON.stringify(entry);

  switch (level) {
    case 'ERROR':
      console.error(output);
      break;
    case 'WARN':
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

export const logger = {
  /**
   * DEBUGログを出力
   */
  debug: (message: string, data?: Record<string, unknown>) => log('DEBUG', message, data),

  /**
   * INFOログを出力
   */
  info: (message: string, data?: Record<string, unknown>) => log('INFO', message, data),

  /**
   * WARNログを出力
   */
  warn: (message: string, data?: Record<string, unknown>) => log('WARN', message, data),

  /**
   * ERRORログを出力
   */
  error: (message: string, error?: Error, data?: Record<string, unknown>) => {
    log('ERROR', message, {
      ...data,
      error: error?.message,
      stack: error?.stack,
    });
  },
};
