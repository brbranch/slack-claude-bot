/**
 * コマンドパーサー
 * Slackメッセージからコマンドを抽出
 */

import { ParsedCommand, SlackMessage } from '../types';
import { logger } from '../utils/logger';

/**
 * !claude コマンドのパターン
 * 例: !claude json-creator テストを実行して
 * 注: Slackの `/` はスラッシュコマンドとして予約されているため `!` を使用
 */
const COMMAND_PATTERN = /^!claude\s+(\S+)\s+(.+)$/s;

/**
 * メッセージをパース
 * @param message Slackメッセージ
 * @param defaultProject デフォルトプロジェクト名（チャンネル設定から）
 * @returns パースされたコマンド。コマンドでない場合はnull
 */
export function parseCommand(message: SlackMessage, defaultProject?: string): ParsedCommand | null {
  const text = message.text?.trim();

  if (!text) {
    return null;
  }

  // /claude コマンド形式をチェック
  const match = text.match(COMMAND_PATTERN);
  if (match) {
    const projectName = match[1];
    const prompt = match[2].trim();

    logger.info('コマンド解析成功', {
      projectName,
      promptLength: prompt.length,
    });

    return {
      projectName,
      prompt,
      imageUrls: extractImageUrls(message),
    };
  }

  // デフォルトプロジェクトが設定されている場合、メンション形式もサポート
  // 例: @bot テストを実行して
  if (defaultProject && text.startsWith('<@')) {
    const mentionEnd = text.indexOf('>');
    if (mentionEnd !== -1) {
      const prompt = text.substring(mentionEnd + 1).trim();
      if (prompt) {
        logger.info('メンション形式コマンド解析成功', {
          projectName: defaultProject,
          promptLength: prompt.length,
        });

        return {
          projectName: defaultProject,
          prompt,
          imageUrls: extractImageUrls(message),
        };
      }
    }
  }

  return null;
}

/**
 * メッセージから画像URLを抽出
 * @param message Slackメッセージ
 * @returns 画像URL一覧
 */
function extractImageUrls(message: SlackMessage): string[] | undefined {
  if (!message.files || message.files.length === 0) {
    return undefined;
  }

  const imageFiles = message.files.filter((file) => file.mimetype?.startsWith('image/'));

  if (imageFiles.length === 0) {
    return undefined;
  }

  return imageFiles
    .filter((file) => file.url_private)
    .map((file) => file.url_private!);
}
