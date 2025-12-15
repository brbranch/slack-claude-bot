/**
 * 設定ファイル読み込み
 */

import * as fs from 'fs';
import * as path from 'path';
import { config as dotenvConfig } from 'dotenv';
import { parse } from 'yaml';
import { AppConfig } from '../types';
import { logger } from '../utils/logger';

// .envファイルを読み込み
dotenvConfig();

/**
 * 環境変数を展開
 * ${ENV_VAR} 形式の文字列を環境変数の値に置換
 * @param value 対象の値
 * @returns 環境変数を展開した値
 */
function expandEnvVars(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
      const envValue = process.env[envVar];
      if (envValue === undefined) {
        logger.warn(`環境変数 ${envVar} が設定されていません`);
        return '';
      }
      return envValue;
    });
  }
  if (Array.isArray(value)) {
    return value.map(expandEnvVars);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = expandEnvVars(val);
    }
    return result;
  }
  return value;
}

/**
 * 設定ファイルを読み込み
 * @param configPath 設定ファイルパス（省略時は config.yaml）
 * @returns アプリケーション設定
 * @throws 設定ファイルが存在しない場合
 */
export function loadConfig(configPath?: string): AppConfig {
  const targetPath = configPath || path.join(process.cwd(), 'config.yaml');

  logger.info('設定ファイルを読み込み', { path: targetPath });

  if (!fs.existsSync(targetPath)) {
    throw new Error(`設定ファイルが見つかりません: ${targetPath}`);
  }

  const content = fs.readFileSync(targetPath, 'utf-8');
  const rawConfig = parse(content);
  const config = expandEnvVars(rawConfig) as AppConfig;

  // バリデーション
  if (!config.slack?.botToken) {
    throw new Error('slack.botToken が設定されていません');
  }
  if (!config.projects || Object.keys(config.projects).length === 0) {
    throw new Error('projects が設定されていません');
  }

  logger.info('設定ファイル読み込み完了', {
    pollingInterval: config.slack.pollingInterval,
    projectCount: Object.keys(config.projects).length,
  });

  return config;
}
