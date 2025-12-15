/**
 * Slack APIクライアント
 */

import { WebClient, LogLevel } from '@slack/web-api';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SlackConfig, SlackMessage, SlackFile } from '../types';
import { logger } from '../utils/logger';
import { convertMarkdownToMrkdwn } from '../utils/markdown-converter';

/**
 * Slackクライアント
 */
export class SlackClient {
  private client: WebClient;
  private botToken: string;
  private botUserId?: string;

  /**
   * コンストラクタ
   * @param config Slack設定
   */
  constructor(config: SlackConfig) {
    this.botToken = config.botToken;
    this.client = new WebClient(config.botToken, {
      logLevel: LogLevel.ERROR,
    });
  }

  /**
   * 接続テスト
   * @returns Bot情報
   */
  async testConnection(): Promise<{ ok: boolean; botId?: string; botName?: string; userId?: string }> {
    logger.info('Slack接続テスト開始');

    const result = await this.client.auth.test();

    this.botUserId = result.user_id;

    logger.info('Slack接続テスト完了', {
      ok: result.ok,
      botId: result.bot_id,
      user: result.user,
      userId: result.user_id,
    });

    return {
      ok: result.ok ?? false,
      botId: result.bot_id,
      botName: result.user,
      userId: result.user_id,
    };
  }

  /**
   * BotのユーザーIDを取得
   * @returns BotのユーザーID
   */
  getBotUserId(): string | undefined {
    return this.botUserId;
  }

  /**
   * チャンネル履歴を取得
   * @param channelId チャンネルID
   * @param oldest 取得開始時刻（Unix timestamp）
   * @returns メッセージ一覧
   */
  async getChannelHistory(channelId: string, oldest?: string): Promise<SlackMessage[]> {
    logger.info('チャンネル履歴取得', { channelId, oldest });

    const result = await this.client.conversations.history({
      channel: channelId,
      oldest,
      limit: 100,
    });

    logger.info('チャンネル履歴取得完了', {
      channelId,
      messageCount: result.messages?.length ?? 0,
    });

    return (result.messages ?? []).map((msg) => ({
      ts: msg.ts ?? '',
      channel: channelId,
      user: msg.user,
      text: msg.text,
      files: msg.files as SlackFile[] | undefined,
      thread_ts: (msg as { thread_ts?: string }).thread_ts,
    }));
  }

  /**
   * スレッドの返信を取得
   * @param channelId チャンネルID
   * @param threadTs スレッドの親タイムスタンプ
   * @param oldest 取得開始時刻（Unix timestamp）
   * @returns メッセージ一覧
   */
  async getThreadReplies(channelId: string, threadTs: string, oldest?: string): Promise<SlackMessage[]> {
    logger.info('スレッド返信取得', { channelId, threadTs, oldest });

    const result = await this.client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      oldest,
      limit: 100,
    });

    logger.info('スレッド返信取得完了', {
      channelId,
      threadTs,
      messageCount: result.messages?.length ?? 0,
    });

    return (result.messages ?? []).map((msg) => ({
      ts: msg.ts ?? '',
      channel: channelId,
      user: msg.user,
      text: msg.text,
      files: msg.files as SlackFile[] | undefined,
      thread_ts: (msg as { thread_ts?: string }).thread_ts,
    }));
  }

  /**
   * メッセージを投稿
   * @param channelId チャンネルID
   * @param text メッセージテキスト
   * @param threadTs スレッドの親タイムスタンプ
   */
  async postMessage(channelId: string, text: string, threadTs?: string): Promise<void> {
    logger.info('メッセージ投稿', {
      channelId,
      threadTs,
      textLength: text.length,
    });

    // MarkdownをSlackのmrkdwn形式に変換
    const mrkdwnText = convertMarkdownToMrkdwn(text);

    await this.client.chat.postMessage({
      channel: channelId,
      text: mrkdwnText,
      thread_ts: threadTs,
    });

    logger.info('メッセージ投稿完了', { channelId, threadTs });
  }

  /**
   * 画像ファイルをダウンロード
   * @param file Slackファイル情報
   * @returns ダウンロードしたファイルのパス
   */
  async downloadImage(file: SlackFile): Promise<string> {
    if (!file.url_private) {
      throw new Error('ファイルURLが存在しません');
    }

    logger.info('画像ダウンロード開始', {
      fileId: file.id,
      fileName: file.name,
      mimetype: file.mimetype,
    });

    const tempDir = os.tmpdir();
    const fileName = file.name || `${file.id}.png`;
    const filePath = path.join(tempDir, `slack-${Date.now()}-${fileName}`);

    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(filePath);

      https.get(
        file.url_private!,
        {
          headers: {
            Authorization: `Bearer ${this.botToken}`,
          },
        },
        (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`ダウンロード失敗: ${response.statusCode}`));
            return;
          }

          response.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            logger.info('画像ダウンロード完了', { filePath });
            resolve(filePath);
          });
        }
      ).on('error', (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
    });
  }
}
