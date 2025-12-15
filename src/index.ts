/**
 * Slack Claude Bot メインエントリーポイント
 */

import { loadConfig } from './config/loader';
import { SlackClient } from './services/slack-client';
import { executeClaudeCodeWithSession, FileOperation } from './services/claude-executor';
import { parseCommand } from './services/command-parser';
import { AppConfig, SlackMessage, ThreadSession } from './types';
import { logger } from './utils/logger';

/**
 * 処理済みメッセージを追跡するSet
 */
const processedMessages = new Set<string>();

/**
 * ファイル操作タイプの日本語表記
 */
const FILE_OPERATION_LABELS: Record<string, string> = {
  create: '作成',
  edit: '編集',
  delete: '削除',
  unknown: '操作',
};

/**
 * ファイル操作一覧をフォーマット
 * @param files ファイル操作一覧
 * @param projectPath プロジェクトパス（相対パス表示用）
 * @returns フォーマット済み文字列
 */
function formatFileOperations(files: FileOperation[], projectPath: string): string {
  if (files.length === 0) {
    return '';
  }

  const lines = files.map((file) => {
    const label = FILE_OPERATION_LABELS[file.type] || file.type;
    // プロジェクトパスからの相対パスに変換
    const relativePath = file.filePath.startsWith(projectPath)
      ? file.filePath.substring(projectPath.length + 1)
      : file.filePath;
    return `• [${label}] ${relativePath}`;
  });

  return `\n\n*変更されたファイル:*\n${lines.join('\n')}`;
}

/**
 * スレッドごとのセッション情報を管理するMap
 * key: "channelId:threadTs"
 */
const threadSessions = new Map<string, ThreadSession>();

/**
 * スレッドごとの最終確認タイムスタンプ
 * key: "channelId:threadTs"
 */
const threadLastChecked = new Map<string, string>();

/**
 * メインアプリケーションクラス
 */
class SlackClaudeBot {
  private config: AppConfig;
  private slackClient: SlackClient;
  private lastTimestamp: string;
  private botUserId?: string;

  /**
   * コンストラクタ
   * @param config アプリケーション設定
   */
  constructor(config: AppConfig) {
    this.config = config;
    this.slackClient = new SlackClient(config.slack);
    // 起動時点のタイムスタンプから監視開始
    this.lastTimestamp = (Date.now() / 1000).toString();
  }

  /**
   * Botを起動
   */
  async start(): Promise<void> {
    logger.info('Slack Claude Bot 起動');

    // 接続テスト
    const testResult = await this.slackClient.testConnection();
    if (!testResult.ok) {
      throw new Error('Slack接続に失敗しました');
    }
    this.botUserId = testResult.userId;
    logger.info('Slack接続成功', { botName: testResult.botName, botUserId: this.botUserId });

    // ポーリング開始
    this.startPolling();
  }

  /**
   * ポーリングを開始
   */
  private startPolling(): void {
    const interval = this.config.slack.pollingInterval || 10000;
    logger.info('ポーリング開始', { interval });

    setInterval(() => this.poll(), interval);
  }

  /**
   * チャンネルをポーリング
   */
  private async poll(): Promise<void> {
    try {
      // 設定されている全チャンネルをポーリング
      const channelIds = Object.keys(this.config.channels || {});

      for (const channelId of channelIds) {
        await this.pollChannel(channelId);
        // アクティブなスレッドもポーリング
        await this.pollActiveThreads(channelId);
      }
    } catch (err) {
      logger.error('ポーリングエラー', err as Error);
    }
  }

  /**
   * 特定チャンネルをポーリング
   * @param channelId チャンネルID
   */
  private async pollChannel(channelId: string): Promise<void> {
    const messages = await this.slackClient.getChannelHistory(channelId, this.lastTimestamp);

    for (const message of messages) {
      await this.handleMessage(message, channelId);
    }

    // 最新のタイムスタンプを更新
    if (messages.length > 0) {
      const latestTs = Math.max(...messages.map((m) => parseFloat(m.ts)));
      this.lastTimestamp = latestTs.toString();
    }
  }

  /**
   * アクティブなスレッドをポーリング
   * @param channelId チャンネルID
   */
  private async pollActiveThreads(channelId: string): Promise<void> {
    // このチャンネルのアクティブなスレッドを取得
    const activeThreads = Array.from(threadSessions.entries())
      .filter(([key]) => key.startsWith(`${channelId}:`))
      .map(([key, session]) => ({
        threadTs: key.split(':')[1],
        session,
      }));

    for (const { threadTs, session } of activeThreads) {
      const sessionKey = this.getSessionKey(channelId, threadTs);
      const lastChecked = threadLastChecked.get(sessionKey) || threadTs;

      try {
        const replies = await this.slackClient.getThreadReplies(channelId, threadTs, lastChecked);

        // 最新のタイムスタンプを更新
        if (replies.length > 0) {
          const latestTs = Math.max(...replies.map((m) => parseFloat(m.ts)));
          threadLastChecked.set(sessionKey, latestTs.toString());
        }

        // 新しい返信を処理
        for (const reply of replies) {
          // 親メッセージはスキップ
          if (reply.ts === threadTs) {
            continue;
          }
          await this.handleThreadReply(reply, channelId, threadTs, session);
        }
      } catch (err) {
        logger.error('スレッドポーリングエラー', err as Error, { channelId, threadTs });
      }
    }
  }

  /**
   * スレッドセッションのキーを生成
   * @param channelId チャンネルID
   * @param threadTs スレッドの親タイムスタンプ
   * @returns セッションキー
   */
  private getSessionKey(channelId: string, threadTs: string): string {
    return `${channelId}:${threadTs}`;
  }

  /**
   * メッセージを処理
   * @param message Slackメッセージ
   * @param channelId チャンネルID
   */
  private async handleMessage(message: SlackMessage, channelId: string): Promise<void> {
    // 処理済みメッセージはスキップ
    if (processedMessages.has(message.ts)) {
      return;
    }

    // Botからのメッセージはスキップ
    if (message.user === this.botUserId) {
      processedMessages.add(message.ts);
      return;
    }

    // 通常のメッセージ処理
    const defaultProject = this.config.channels?.[channelId];
    const command = parseCommand(message, defaultProject);

    if (!command) {
      return;
    }

    processedMessages.add(message.ts);

    logger.info('コマンド検出', {
      channelId,
      projectName: command.projectName,
      promptLength: command.prompt.length,
    });

    // プロジェクトパスを取得
    const projectPath = this.config.projects[command.projectName];
    if (!projectPath) {
      await this.slackClient.postMessage(
        channelId,
        `エラー: プロジェクト "${command.projectName}" が見つかりません`,
        message.ts
      );
      return;
    }

    // 処理中メッセージを投稿
    await this.slackClient.postMessage(channelId, '処理中...', message.ts);

    // 画像をダウンロード
    const imagePaths: string[] = [];
    if (message.files) {
      for (const file of message.files) {
        if (file.mimetype?.startsWith('image/')) {
          try {
            const filePath = await this.slackClient.downloadImage(file);
            imagePaths.push(filePath);
          } catch (err) {
            logger.error('画像ダウンロードエラー', err as Error);
          }
        }
      }
    }

    // Claude Code CLI実行（セッションIDを取得）
    const result = await executeClaudeCodeWithSession({
      prompt: command.prompt,
      cwd: projectPath,
      images: imagePaths.length > 0 ? imagePaths : undefined,
      systemPrompt: this.config.claude?.systemPrompt,
    });

    // 結果を投稿
    let responseText = result.output || '（出力なし）';
    if (!result.success && result.error) {
      responseText = `エラー:\n${result.error}\n\n出力:\n${result.output}`;
    }

    // ファイル操作一覧を追加
    if (result.modifiedFiles && result.modifiedFiles.length > 0) {
      responseText += formatFileOperations(result.modifiedFiles, projectPath);
    }

    // Slackの文字数制限を考慮（4000文字）
    if (responseText.length > 3900) {
      responseText = responseText.substring(0, 3900) + '\n...(省略)';
    }

    await this.slackClient.postMessage(channelId, responseText, message.ts);

    // スレッドセッションを保存
    const sessionKey = this.getSessionKey(channelId, message.ts);
    threadSessions.set(sessionKey, {
      projectName: command.projectName,
      projectPath,
      sessionId: result.sessionId,
    });

    // 初期のlastCheckedを設定
    threadLastChecked.set(sessionKey, message.ts);

    logger.info('スレッドセッション作成', {
      sessionKey,
      projectName: command.projectName,
      sessionId: result.sessionId,
    });
  }

  /**
   * スレッド返信を処理（会話継続）
   * @param message Slackメッセージ
   * @param channelId チャンネルID
   * @param threadTs スレッドの親タイムスタンプ
   * @param session スレッドセッション情報
   */
  private async handleThreadReply(
    message: SlackMessage,
    channelId: string,
    threadTs: string,
    session: ThreadSession
  ): Promise<void> {
    // 処理済みメッセージはスキップ
    if (processedMessages.has(message.ts)) {
      return;
    }

    // Botからのメッセージはスキップ
    if (message.user === this.botUserId) {
      processedMessages.add(message.ts);
      return;
    }

    processedMessages.add(message.ts);

    const prompt = message.text?.trim();
    if (!prompt) {
      return;
    }

    // メンションを除去
    const cleanPrompt = prompt.replace(/<@[A-Z0-9]+>/g, '').trim();
    if (!cleanPrompt) {
      return;
    }

    logger.info('スレッド内メッセージ処理', {
      channelId,
      threadTs,
      projectName: session.projectName,
      promptLength: cleanPrompt.length,
      sessionId: session.sessionId,
    });

    // 処理中メッセージを投稿
    await this.slackClient.postMessage(channelId, '処理中...', threadTs);

    // 画像をダウンロード
    const imagePaths: string[] = [];
    if (message.files) {
      for (const file of message.files) {
        if (file.mimetype?.startsWith('image/')) {
          try {
            const filePath = await this.slackClient.downloadImage(file);
            imagePaths.push(filePath);
          } catch (err) {
            logger.error('画像ダウンロードエラー', err as Error);
          }
        }
      }
    }

    // Claude Code CLI実行（セッション継続）
    const result = await executeClaudeCodeWithSession({
      prompt: cleanPrompt,
      cwd: session.projectPath,
      images: imagePaths.length > 0 ? imagePaths : undefined,
      resumeSessionId: session.sessionId,
      systemPrompt: this.config.claude?.systemPrompt,
    });

    // 結果を投稿
    let responseText = result.output || '（出力なし）';
    if (!result.success && result.error) {
      responseText = `エラー:\n${result.error}\n\n出力:\n${result.output}`;
    }

    // ファイル操作一覧を追加
    if (result.modifiedFiles && result.modifiedFiles.length > 0) {
      responseText += formatFileOperations(result.modifiedFiles, session.projectPath);
    }

    // Slackの文字数制限を考慮（4000文字）
    if (responseText.length > 3900) {
      responseText = responseText.substring(0, 3900) + '\n...(省略)';
    }

    await this.slackClient.postMessage(channelId, responseText, threadTs);

    // セッションIDを更新
    if (result.sessionId) {
      session.sessionId = result.sessionId;
      const sessionKey = this.getSessionKey(channelId, threadTs);
      threadSessions.set(sessionKey, session);
    }
  }
}

/**
 * メイン関数
 */
async function main(): Promise<void> {
  try {
    const config = loadConfig();
    const bot = new SlackClaudeBot(config);
    await bot.start();
  } catch (err) {
    logger.error('起動エラー', err as Error);
    process.exit(1);
  }
}

main();
