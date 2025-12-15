/**
 * Slack接続テスト用スクリプト
 */

import { loadConfig } from './config/loader';
import { SlackClient } from './services/slack-client';
import { logger } from './utils/logger';

/**
 * 接続テストを実行
 */
async function main(): Promise<void> {
  try {
    logger.info('接続テスト開始');

    const config = loadConfig();
    const client = new SlackClient(config.slack);

    const result = await client.testConnection();

    if (result.ok) {
      logger.info('接続テスト成功', {
        botId: result.botId,
        botName: result.botName,
      });
      console.log('\n✅ Slack接続成功!');
      console.log(`   Bot ID: ${result.botId}`);
      console.log(`   Bot Name: ${result.botName}`);
    } else {
      logger.error('接続テスト失敗');
      console.log('\n❌ Slack接続失敗');
      process.exit(1);
    }
  } catch (err) {
    logger.error('接続テストエラー', err as Error);
    console.error('\n❌ エラー:', (err as Error).message);
    process.exit(1);
  }
}

main();
