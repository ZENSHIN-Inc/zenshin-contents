/**
 * OGP タイトルの「行幅」を全角換算（em）で見積もるヘルパー。
 *
 * OGP 画像（1200x630、内側コンテンツ幅 1072px）でタイトルを自動改行させないための共通ロジック:
 *   - レンダラー（og-image.ts）は行幅に応じてフォントサイズを 52px から自動縮小する
 *   - ブログ（content.config.ts の Zod）とスライド（build-slides.ts）は、縮小限界を超える
 *     長さをビルドエラーにする
 *
 * 見積もりは「全角 = 1em、半角 = 0.6em」の近似（Noto Sans JP Bold の実測に安全側マージン込み）。
 */

/** タイトル 1 行の上限（全角換算）。1072px ÷ 28em ≈ 38px が最小フォントサイズになる。
 * 20 文字（標準の 52px のまま）に収めるのが望ましく、28 は縮小の許容限界 */
export const MAX_TITLE_EM = 28;

/** 1 行分のテキストの全角換算幅を返す */
export function lineEm(line: string): number {
  let em = 0;
  for (const ch of line) {
    // 半角（ASCII + 半角カナ等の Halfwidth Forms）を 0.6em、それ以外を 1em とみなす
    const code = ch.codePointAt(0) ?? 0;
    const isHalfwidth = code <= 0xff || (code >= 0xff61 && code <= 0xffdc);
    em += isHalfwidth ? 0.6 : 1;
  }
  return em;
}

/** タイトル全行のうち最長の行の全角換算幅を返す（明示的な "\n" 区切りに対応） */
export function maxLineEm(title: string): number {
  return Math.max(...title.split("\n").map(lineEm));
}

/** タイトルが上限を超えている場合にエラーメッセージを返す（問題なければ null） */
export function validateTitleWidth(title: string): string | null {
  const em = maxLineEm(title);
  if (em <= MAX_TITLE_EM) return null;
  return (
    `タイトルが長すぎます（全角換算 ${em.toFixed(1)} 文字 > 上限 ${MAX_TITLE_EM} 文字）。` +
    `OGP 画像で自動改行が発生しないよう、タイトルを短くするか "\\n" で明示的に改行してください`
  );
}
