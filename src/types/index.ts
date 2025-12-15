/**
 * Slack Claude Bot 型定義
 */

/**
 * プロジェクト設定
 */
export interface ProjectConfig {
  /** プロジェクト名 */
  name: string;
  /** プロジェクトパス */
  path: string;
}

/**
 * チャンネル設定
 */
export interface ChannelConfig {
  /** チャンネルID */
  channelId: string;
  /** デフォルトプロジェクト名 */
  defaultProject?: string;
}

/**
 * Slack設定
 */
export interface SlackConfig {
  /** Bot Token */
  botToken: string;
  /** ポーリング間隔（ミリ秒） */
  pollingInterval: number;
}

/**
 * Claude設定
 */
export interface ClaudeConfig {
  /** システムプロンプト（事前知識） */
  systemPrompt?: string;
}

/**
 * アプリケーション設定
 */
export interface AppConfig {
  slack: SlackConfig;
  /** プロジェクト名とパスのマッピング */
  projects: Record<string, string>;
  /** チャンネルIDとデフォルトプロジェクトのマッピング */
  channels?: Record<string, string>;
  /** Claude設定 */
  claude?: ClaudeConfig;
}

/**
 * パースされたコマンド
 */
export interface ParsedCommand {
  /** プロジェクト名 */
  projectName: string;
  /** プロンプト */
  prompt: string;
  /** 添付画像のURL一覧 */
  imageUrls?: string[];
}

/**
 * Slackメッセージ情報
 */
export interface SlackMessage {
  /** タイムスタンプ */
  ts: string;
  /** チャンネルID */
  channel: string;
  /** ユーザーID */
  user?: string;
  /** メッセージテキスト */
  text?: string;
  /** 添付ファイル */
  files?: SlackFile[];
  /** スレッドの親タイムスタンプ（スレッド返信の場合） */
  thread_ts?: string;
}

/**
 * Slackファイル情報
 */
export interface SlackFile {
  /** ファイルID */
  id: string;
  /** ファイル名 */
  name?: string;
  /** MIMEタイプ */
  mimetype?: string;
  /** プライベートダウンロードURL */
  url_private?: string;
}

/**
 * スレッドセッション情報
 */
export interface ThreadSession {
  /** プロジェクト名 */
  projectName: string;
  /** プロジェクトパス */
  projectPath: string;
  /** Claude CodeセッションID */
  sessionId?: string;
}
