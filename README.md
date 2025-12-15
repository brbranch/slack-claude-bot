# Slack Claude Bot

SlackメッセージからClaude Code CLIを実行し、結果を返すBot。ポーリング方式でメッセージを監視するため、外部公開不要。

## 機能

- Slackチャンネルをポーリングで監視
- 指定プロジェクトのコンテキストでClaude Code CLIを実行
- スレッド内での会話継続をサポート
- 画像添付に対応
- 複数プロジェクトの設定が可能
- 編集されたファイル一覧を自動表示

## 必要条件

- Node.js v18以降
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) がインストール・認証済み
- Slack Bot Token（必要な権限付き）

## インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd slack-claude-bot

# 依存関係をインストール
npm install

# 環境変数ファイルをコピー
cp .env.example .env

# 設定ファイルをコピー
cp config.yaml.example config.yaml

# .env と config.yaml を編集
```

## 設定

### 環境変数（.env）

```env
# Slack Bot Token（必須）
SLACK_BOT_TOKEN=xoxb-xxxxx-xxxxx-xxxxx

# Claude CLIのパス（オプション、デフォルトは 'claude'）
# CLAUDE_PATH=/opt/homebrew/bin/claude
```

### config.yaml

```yaml
slack:
  botToken: ${SLACK_BOT_TOKEN}  # 環境変数から取得（変更不要）
  pollingInterval: 10000        # ポーリング間隔（ミリ秒）

projects:
  # プロジェクト名とディレクトリパスのマッピング
  my-project: /path/to/my-project
  another-project: /path/to/another

channels:
  # チャンネルIDとデフォルトプロジェクトの紐付け（オプション）
  # 設定すると、そのチャンネルでは @bot メンションだけで使用可能
  C0123456789: my-project

claude:
  # システムプロンプト（オプション）
  systemPrompt: |
    あなたはSlack経由で呼び出されています。
    回答は簡潔に、Slackで読みやすい形式で返してください。
```

## Slack App 設定

### 1. Appの作成

1. [Slack API Apps](https://api.slack.com/apps) にアクセス
2. **Create New App** → **From scratch** を選択
3. App名（例: `Claude Bot`）とワークスペースを選択して作成

### 2. Bot Token Scopesの設定

**OAuth & Permissions** ページで以下のスコープを追加:

| スコープ | 説明 |
|---------|------|
| `channels:history` | パブリックチャンネルのメッセージ履歴を読み取り |
| `groups:history` | プライベートチャンネルのメッセージ履歴を読み取り（必要な場合） |
| `chat:write` | メッセージを投稿 |
| `files:read` | ファイル（画像）を読み取り |

### 3. Appのインストール

1. **OAuth & Permissions** ページで **Install to Workspace** をクリック
2. 権限を確認して **許可する** をクリック
3. **Bot User OAuth Token**（`xoxb-...`で始まる）をコピー
4. `.env` ファイルの `SLACK_BOT_TOKEN` に設定

### 4. Botをチャンネルに招待

監視したいチャンネルで以下を実行:
```
/invite @Claude Bot
```

### 5. チャンネルIDの取得

`config.yaml` に設定するチャンネルIDの取得方法:

1. Slackでチャンネルを開く
2. チャンネル名をクリック → **チャンネル詳細を開く**
3. 一番下にある **チャンネルID**（`C0123456789` 形式）をコピー

## 使用方法

### Botの起動

```bash
# 開発モード（ホットリロード）
npm run dev

# 本番モード
npm start

# または起動スクリプトを使用
./start.sh
```

### コマンド形式

#### 1. `!claude` コマンド（プロジェクト指定）

```
!claude <プロジェクト名> <指示内容>
```

例:
```
!claude my-project テストを実行して
!claude my-project ユーザー認証のバグを修正して
```

> **注意**: Slackの `/` はスラッシュコマンド用に予約されているため、`!` を使用しています。

#### 2. メンション形式（デフォルトプロジェクト設定時）

`config.yaml` でチャンネルにデフォルトプロジェクトを設定している場合:

```
@Claude Bot テストを実行して
@Claude Bot main関数の説明をして
```

#### 3. 画像添付

メッセージに画像を添付すると、Claudeに画像を渡して処理できます:
```
!claude my-project このデザインを実装して [画像を添付]
```

### スレッド内での会話継続

最初のコマンド後、スレッド内で会話を続けることができます。Botはセッションを維持するため、文脈を理解した応答が得られます。

```
あなた: !claude my-project テストを実行して
Bot: テストを実行しました。3件失敗しています...

あなた: 失敗しているテストを修正して
Bot: 修正しました...
```

## プロジェクト構成

```
slack-claude-bot/
├── src/
│   ├── index.ts              # メインエントリーポイント
│   ├── config/
│   │   └── loader.ts         # 設定ローダー
│   ├── services/
│   │   ├── slack-client.ts   # Slack APIクライアント
│   │   ├── claude-executor.ts # Claude Code CLI実行
│   │   └── command-parser.ts # コマンドパーサー
│   ├── types/
│   │   └── index.ts          # 型定義
│   └── utils/
│       ├── logger.ts         # ロガー
│       └── markdown-converter.ts # Markdown→mrkdwn変換
├── config.yaml.example       # 設定ファイルテンプレート
├── .env.example              # 環境変数テンプレート
├── package.json
└── tsconfig.json
```

## npmスクリプト

| スクリプト | 説明 |
|-----------|------|
| `npm start` | Botを起動 |
| `npm run dev` | 開発モードで起動 |
| `npm run build` | TypeScriptをコンパイル |
| `npm run test:connection` | Slack API接続テスト |

## トラブルシューティング

### Botがメッセージに反応しない

1. Botがチャンネルに招待されているか確認
2. `config.yaml` のチャンネルIDが正しいか確認
3. コマンド形式が正しいか確認（`!claude` または `@Bot`）

### 「プロジェクトが見つかりません」エラー

`config.yaml` の `projects` セクションでプロジェクト名とパスが正しく設定されているか確認。

### Claude CLIが見つからない

`.env` に `CLAUDE_PATH` を設定:
```env
CLAUDE_PATH=/opt/homebrew/bin/claude
```

## ライセンス

ISC
