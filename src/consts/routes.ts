/**
 * サイト内ルート定義（zenshin-hp の routes.ts と同じ思想）
 *
 * 全ての内部リンクはここから参照する。パスを変更するときは
 * このファイル 1 箇所だけを編集すれば、全参照箇所が連動して更新される。
 */
export const ROUTES = {
  home: "/",
  blog: "/blog/",
  slides: "/slides/",
  gallery: "/gallery/",
  rss: "/rss.xml",

  // 外部（コーポレートサイト）
  corporate: "https://www.zenshin-inc.co.jp/",
  corporateContact: "https://www.zenshin-inc.co.jp/contact/",

  // 動的ルート
  blogPost: (slug: string) => `/blog/${slug}/` as const,
  blogTag: (tag: string) => `/blog/tags/${encodeURIComponent(tag)}/` as const,
  blogArchive: (yearMonth: string) => `/blog/archive/${yearMonth}/` as const,

  // OGP 画像 (1200x630 PNG)
  ogImageBlog: (slug: string) => `/og/blog/${slug}.png` as const,
  ogImageSite: "/og/site.png",
} as const;
