/**
 * Claude Code CLI実行サービス
 */

import { execSync } from 'child_process';
import { logger } from '../utils/logger';

/** Claude CLIのパス（環境変数またはデフォルト） */
const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude';

/**
 * 許可するツール一覧
 * ファイル操作・検索・Git操作・npm/テスト実行を許可
 */
const ALLOWED_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Grep',
  'Glob',
  'Bash(git:*)',
  'Bash(npm:*)',
  'Bash(npx:*)',
  'Bash(ls:*)',
  'Bash(cat:*)',
  'Bash(mkdir:*)',
  'Bash(rm:*)',
  'Bash(mv:*)',
  'Bash(cp:*)',
];

/**
 * Claude Code CLI実行オプション
 */
export interface ClaudeExecuteOptions {
  /** プロンプト */
  prompt: string;
  /** 作業ディレクトリ */
  cwd: string;
  /** 画像ファイルパス一覧 */
  images?: string[];
  /** 継続するセッションID */
  resumeSessionId?: string;
  /** システムプロンプト（事前知識） */
  systemPrompt?: string;
  /** 追加で許可するツール */
  additionalAllowedTools?: string[];
}

/**
 * ファイル操作情報
 */
export interface FileOperation {
  /** 操作タイプ（create, edit, delete） */
  type: string;
  /** ファイルパス */
  filePath: string;
}

/**
 * Claude Code CLI実行結果
 */
export interface ClaudeExecuteResult {
  /** 成功フラグ */
  success: boolean;
  /** 出力 */
  output: string;
  /** エラー出力 */
  error?: string;
  /** セッションID */
  sessionId?: string;
  /** 編集されたファイル一覧 */
  modifiedFiles?: FileOperation[];
}

/**
 * シェル用にエスケープ
 * @param str エスケープ対象
 * @returns エスケープ済み文字列
 */
function escapeShellArg(str: string): string {
  return `'${str.replace(/'/g, "'\"'\"'")}'`;
}

/**
 * 出力からセッションIDを抽出
 * @param output CLI出力
 * @returns セッションID（見つからない場合はundefined）
 */
function extractSessionId(output: string): string | undefined {
  // Claude Codeの出力からセッションIDを抽出
  // 出力形式: JSON出力モードで取得する
  return undefined; // JSON出力でない場合は取得不可
}

/**
 * allowedToolsオプションを構築
 * @param additionalTools 追加ツール
 * @returns CLIオプション文字列
 */
function buildAllowedToolsOption(additionalTools?: string[]): string {
  const tools = [...ALLOWED_TOOLS];
  if (additionalTools) {
    tools.push(...additionalTools);
  }
  // スペース区切りでダブルクォートで囲む
  return tools.map(t => `"${t}"`).join(' ');
}

/**
 * Claude Code CLIを実行
 * @param options 実行オプション
 * @returns 実行結果
 */
export async function executeClaudeCode(options: ClaudeExecuteOptions): Promise<ClaudeExecuteResult> {
  const { prompt, cwd, images, resumeSessionId, systemPrompt, additionalAllowedTools } = options;

  logger.info('Claude Code CLI実行開始', {
    cwd,
    promptLength: prompt.length,
    imageCount: images?.length ?? 0,
    resumeSessionId,
  });

  const startTime = Date.now();

  try {
    // コマンドを構築
    let command = `${CLAUDE_PATH} -p ${escapeShellArg(prompt)}`;

    // 許可ツールを追加
    command += ` --allowedTools ${buildAllowedToolsOption(additionalAllowedTools)}`;

    // システムプロンプトがある場合は追加
    if (systemPrompt) {
      command += ` --system-prompt ${escapeShellArg(systemPrompt)}`;
    }

    // セッション継続の場合は --resume オプションを追加
    if (resumeSessionId) {
      command += ` --resume ${escapeShellArg(resumeSessionId)}`;
    }

    // 画像ファイルがある場合は追加
    if (images && images.length > 0) {
      for (const imagePath of images) {
        command += ` ${escapeShellArg(imagePath)}`;
      }
    }

    logger.info('Claude Code実行コマンド', {
      command: command.replace(prompt, '[PROMPT]'),
      cwd,
    });

    // 同期実行（タイムアウト5分）
    const output = execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    const duration = Date.now() - startTime;

    logger.info('Claude Code CLI実行完了', {
      duration,
      outputLength: output.length,
    });

    return {
      success: true,
      output,
      sessionId: extractSessionId(output),
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    const error = err as Error & { stdout?: string; stderr?: string };

    logger.error('Claude Code CLI実行エラー', error, {
      duration,
    });

    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || error.message,
    };
  }
}

/**
 * stream-json出力からファイル操作とメッセージを抽出
 * @param rawOutput stream-json形式の出力
 * @returns パース結果
 */
function parseStreamJsonOutput(rawOutput: string): {
  result: string;
  sessionId?: string;
  modifiedFiles: FileOperation[];
} {
  const lines = rawOutput.split('\n').filter(line => line.trim());
  const modifiedFiles: FileOperation[] = [];
  let result = '';
  let sessionId: string | undefined;

  for (const line of lines) {
    try {
      const json = JSON.parse(line);

      // tool_use_resultからファイル操作を抽出
      if (json.tool_use_result && json.tool_use_result.filePath) {
        modifiedFiles.push({
          type: json.tool_use_result.type || 'unknown',
          filePath: json.tool_use_result.filePath,
        });
      }

      // 最終結果を取得
      if (json.type === 'result') {
        result = json.result || '';
        sessionId = json.session_id;
      }
    } catch {
      // JSONパース失敗は無視
    }
  }

  return { result, sessionId, modifiedFiles };
}

/**
 * Claude Code CLIを実行（stream-json出力モード）
 * セッションIDとファイル操作情報を取得可能
 * @param options 実行オプション
 * @returns 実行結果
 */
export async function executeClaudeCodeWithSession(options: ClaudeExecuteOptions): Promise<ClaudeExecuteResult> {
  const { prompt, cwd, images, resumeSessionId, systemPrompt, additionalAllowedTools } = options;

  logger.info('Claude Code CLI実行開始（セッションモード）', {
    cwd,
    promptLength: prompt.length,
    imageCount: images?.length ?? 0,
    resumeSessionId,
  });

  const startTime = Date.now();

  try {
    // コマンドを構築（stream-json出力モード）
    let command = `${CLAUDE_PATH} -p ${escapeShellArg(prompt)} --output-format stream-json --verbose`;

    // 許可ツールを追加
    command += ` --allowedTools ${buildAllowedToolsOption(additionalAllowedTools)}`;

    // システムプロンプトがある場合は追加
    if (systemPrompt) {
      command += ` --system-prompt ${escapeShellArg(systemPrompt)}`;
    }

    // セッション継続の場合は --resume オプションを追加
    if (resumeSessionId) {
      command += ` --resume ${escapeShellArg(resumeSessionId)}`;
    }

    // 画像ファイルがある場合は追加
    if (images && images.length > 0) {
      for (const imagePath of images) {
        command += ` ${escapeShellArg(imagePath)}`;
      }
    }

    logger.info('Claude Code実行コマンド', {
      command: command.replace(prompt, '[PROMPT]'),
      cwd,
    });

    // 同期実行（タイムアウト5分）
    const rawOutput = execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    const duration = Date.now() - startTime;

    // stream-json出力をパース
    const { result, sessionId, modifiedFiles } = parseStreamJsonOutput(rawOutput);

    logger.info('Claude Code CLI実行完了', {
      duration,
      outputLength: result.length,
      sessionId,
      modifiedFilesCount: modifiedFiles.length,
    });

    return {
      success: true,
      output: result || '（出力なし）',
      sessionId,
      modifiedFiles: modifiedFiles.length > 0 ? modifiedFiles : undefined,
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    const error = err as Error & { stdout?: string; stderr?: string };

    logger.error('Claude Code CLI実行エラー', error, {
      duration,
    });

    // エラー時も出力をパースしてみる
    let modifiedFiles: FileOperation[] | undefined;
    if (error.stdout) {
      const parsed = parseStreamJsonOutput(error.stdout);
      if (parsed.modifiedFiles.length > 0) {
        modifiedFiles = parsed.modifiedFiles;
      }
    }

    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || error.message,
      modifiedFiles,
    };
  }
}
