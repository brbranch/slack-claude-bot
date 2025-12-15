# Slack Claude Bot

## 概要
Slackからメッセージを受信し、Claude Code CLIを実行して結果を返すBot。
ポーリング方式でSlack APIを監視するため、外部公開不要。

## 技術スタック
- Node.js（TypeScript）
- Slack Web API（@slack/web-api）

## 機能要件

### 1. Slackメッセージ監視
- 指定チャンネルをポーリング（10秒間隔）
- 特定フォーマットのメッセージを検出
  - 例: `!claude <プロジェクト名> <指示内容>`
  - 例: `@bot <指示内容>`（チャンネル紐付けの場合）
- 注: Slackの `/` はスラッシュコマンド用に予約されているため `!` を使用

### 2. Claude Code CLI実行
- 検出したメッセージからプロンプトを抽出
- `claude -p "<プロンプト>" --cwd <プロジェクトパス>` を実行
- 実行結果を取得

### 3. 結果返信
- Claude Code CLIの出力をSlackに投稿
- スレッド返信形式で投稿

### 4. 画像対応
- Slackにアップロードされた画像を検出
- Slack APIで画像をダウンロード
- Claude Codeに画像を渡して処理

### 5. 設定管理
- `config.yaml` で以下を管理
  - Slack Bot Token
  - ポーリング間隔
  - プロジェクト名とパスの紐付け
  - チャンネルIDとプロジェクトの紐付け（オプション）

## 設定ファイル例

```yaml
slack:
  botToken: ${SLACK_BOT_TOKEN}  # 環境変数から取得
  pollingInterval: 10000  # ミリ秒

projects:
  my-project: /path/to/project
  # other-project: /path/to/other

channels:
  # チャンネルIDとデフォルトプロジェクトの紐付け（オプション）
  # C0123456789: my-project
```

## 使用方法

### Slackでの呼び出し
```
!claude my-project テストを実行して
!claude my-project このバグを修正して [画像添付]
```

### 起動
```bash
npm start
# または
npm run dev  # 開発時
```

## TODO
- [x] プロジェクト初期化（package.json, tsconfig.json）
- [x] Slack API連携実装
- [x] ポーリング処理実装
- [x] Claude Code CLI実行処理
- [x] 画像ダウンロード・処理
- [x] 設定ファイル読み込み
- [x] エラーハンドリング
- [x] README.md作成
- [x] セッション継続（スレッド内会話）
- [x] Markdown→mrkdwn変換
- [x] 編集ファイル一覧表示

## Slack App設定（事前準備）
1. https://api.slack.com/apps でApp作成
2. Bot Token Scopes設定:
   - `channels:history` - チャンネル履歴読み取り
   - `chat:write` - メッセージ投稿
   - `files:read` - ファイル読み取り（画像用）
3. Appをワークスペースにインストール
4. Bot User OAuth Token（`xoxb-xxx`）を取得
5. Botを監視対象チャンネルに招待
