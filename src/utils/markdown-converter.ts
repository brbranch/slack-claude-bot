/**
 * MarkdownをSlackのmrkdwn形式に変換するユーティリティ
 */

/**
 * MarkdownをSlackのmrkdwn形式に変換
 * @param markdown Markdown形式のテキスト
 * @returns Slack mrkdwn形式のテキスト
 */
export function convertMarkdownToMrkdwn(markdown: string): string {
  let result = markdown;

  // コードブロックを一時的に保護（変換対象外にする）
  const codeBlocks: string[] = [];
  result = result.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `\x00CODEBLOCK${codeBlocks.length - 1}\x00`;
  });

  // インラインコードを一時的に保護
  const inlineCodes: string[] = [];
  result = result.replace(/`[^`]+`/g, (match) => {
    inlineCodes.push(match);
    return `\x00INLINECODE${inlineCodes.length - 1}\x00`;
  });

  // リンク: [text](url) → <url|text>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');

  // ボールド: **text** → *text*
  result = result.replace(/\*\*([^*]+)\*\*/g, '*$1*');

  // イタリック: *text* → _text_ （ボールド変換後に実行）
  // 単独の*で囲まれたテキストのみ変換（**は既に変換済み）
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '_$1_');

  // 取り消し線: ~~text~~ → ~text~
  result = result.replace(/~~([^~]+)~~/g, '~$1~');

  // 見出し: # text → *text* （ボールドで代用）
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

  // インラインコードを復元
  result = result.replace(/\x00INLINECODE(\d+)\x00/g, (_, index) => {
    return inlineCodes[parseInt(index, 10)];
  });

  // コードブロックを復元
  result = result.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, index) => {
    return codeBlocks[parseInt(index, 10)];
  });

  return result;
}
