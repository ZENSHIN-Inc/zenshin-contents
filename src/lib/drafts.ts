/**
 * ブログ記事のドラフト（`published: false`）表示制御。
 *
 * このリポジトリには staging / PR プレビューがない（main push = 即公開）ため、
 * zenshin-hp にあった PUBLIC_INCLUDE_DRAFTS の仕組みは持ち込まず、
 * `astro dev` のときだけドラフトを可視化する。
 *
 *   - ローカル `bun run dev`: import.meta.env.DEV が true なので自動的に可視化
 *   - `astro build`（=公開ビルド）: 確実に除外される
 */

const INCLUDE_DRAFTS = import.meta.env.DEV;

type HasPublished = { data: { published: boolean } };

/** `published` フラグでポストをフィルタする。dev のときは全件返す（= ドラフトも見せる） */
export function filterPublished<T extends HasPublished>(posts: T[]): T[] {
  return INCLUDE_DRAFTS ? posts : posts.filter((p) => p.data.published);
}
