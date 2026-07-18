/**
 * Sätteri HAST プラグイン: リンクカード
 *
 * マークダウン内で URL だけの段落を検出し、
 * ビルド時に OGP メタデータを取得してカード形式に変換する。
 *
 * 使い方（マークダウン内）:
 *   [https://example.com](https://example.com)
 *
 * 上記のように「リンクテキスト = href」かつ段落内にそれしかない場合にカード化される。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Element, Text } from "hast";
import sharp from "sharp";
import { defineHastPlugin } from "satteri";

interface OgpData {
  title: string;
  description: string;
  image: string;
  favicon: string;
  domain: string;
}

/** 対応している画像 Content-Type（これ以外はキャッシュ対象外） */
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  // SVG は sharp の raster 化を避けるため別系統で扱う
]);

/**
 * 外部画像をビルド時にダウンロードして public/link-cards/ にキャッシュする。
 *
 * 【背景】CSP の img-src を 'self' data: に絞っているため、外部ドメインの
 *   favicon / og:image はクライアント側でブロックされる。rehype プラグイン側で
 *   ビルド時に fetch してローカル配信に差し替えることで CSP を緩めずに解決する。
 *
 * 同じ URL は sha256 ハッシュで重複排除され、2 回目以降は再 fetch しない。
 * OG 画像は sharp で WebP にリサイズ圧縮し、favicon は原寸のまま保存する。
 */
async function cacheImage(
  url: string,
  mode: "favicon" | "og"
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AstroBot/1.0)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    if (!contentType) return null;

    const hash = crypto
      .createHash("sha256")
      .update(url)
      .digest("hex")
      .slice(0, 16);
    const cacheDir = path.join(process.cwd(), "public/link-cards");
    const buffer = Buffer.from(await res.arrayBuffer());

    // OG 画像は常に WebP に変換してリサイズ
    if (mode === "og") {
      if (!SUPPORTED_IMAGE_TYPES.has(contentType)) return null;
      const fileName = `${hash}.webp`;
      const filePath = path.join(cacheDir, fileName);
      try {
        await fs.access(filePath);
        return `/link-cards/${fileName}`;
      } catch {
        // 新規保存
      }
      const optimized = await sharp(buffer)
        .resize({ width: 460, withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(filePath, optimized);
      return `/link-cards/${fileName}`;
    }

    // favicon は原寸のままファイル保存（ico/png/webp 等）
    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/x-icon": "ico",
      "image/vnd.microsoft.icon": "ico",
    };
    const ext = extMap[contentType];
    if (!ext) return null;
    const fileName = `${hash}.${ext}`;
    const filePath = path.join(cacheDir, fileName);
    try {
      await fs.access(filePath);
      return `/link-cards/${fileName}`;
    } catch {
      // 新規保存
    }
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(filePath, buffer);
    return `/link-cards/${fileName}`;
  } catch {
    return null;
  }
}

/** URL から OGP メタデータを取得 */
async function fetchOgp(url: string): Promise<OgpData | null> {
  let domain: string;
  try {
    domain = new URL(url).hostname;
  } catch {
    return null;
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AstroBot/1.0)",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    const faviconRemote = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    if (!res.ok) {
      // fetch 失敗時はタイトルなしのフォールバックカードを返す（favicon だけ試行）
      return {
        title: domain,
        description: "",
        image: "",
        favicon: (await cacheImage(faviconRemote, "favicon")) ?? "",
        domain,
      };
    }
    const html = await res.text();

    const getMetaContent = (property: string): string => {
      // og:xxx または name="xxx" のメタタグから content を取得
      const pattern = new RegExp(
        `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']|<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
        "i"
      );
      const match = html.match(pattern);
      return match?.[1] || match?.[2] || "";
    };

    const getTitle = (): string => {
      const ogTitle = getMetaContent("og:title");
      if (ogTitle) return ogTitle;
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      return titleMatch?.[1]?.trim() || domain;
    };

    // og:image は相対パスや protocol-relative の場合があるので絶対 URL に正規化
    const rawImage = getMetaContent("og:image");
    let absoluteImage = "";
    if (rawImage) {
      try {
        absoluteImage = new URL(rawImage, url).toString();
      } catch {
        absoluteImage = "";
      }
    }

    const [cachedFavicon, cachedImage] = await Promise.all([
      cacheImage(faviconRemote, "favicon"),
      absoluteImage ? cacheImage(absoluteImage, "og") : Promise.resolve(null),
    ]);

    return {
      title: getTitle(),
      description:
        getMetaContent("og:description") || getMetaContent("description"),
      image: cachedImage ?? "",
      favicon: cachedFavicon ?? "",
      domain,
    };
  } catch {
    return null;
  }
}

/** リンクのみの段落かどうか判定 */
function isBareLinkParagraph(node: Element): string | null {
  if (node.tagName !== "p") return null;

  // 子要素からホワイトスペースのみのテキストノードを除外
  const meaningful = node.children.filter((child) => {
    if (child.type === "text" && (child as Text).value.trim() === "")
      return false;
    return true;
  });

  // <a> が1つだけ
  if (meaningful.length !== 1) return null;
  const child = meaningful[0];
  if (child.type !== "element" || (child as Element).tagName !== "a")
    return null;

  const anchor = child as Element;
  const href = anchor.properties?.href;
  if (typeof href !== "string" || !href.startsWith("https://")) return null;

  // リンクテキストが URL と一致する場合（bare link）
  const textContent = anchor.children
    .filter((c) => c.type === "text")
    .map((c) => (c as Text).value)
    .join("")
    .trim();

  if (textContent === href) return href;
  return null;
}

/** OGP データからカード要素を生成 */
function createCardElement(url: string, ogp: OgpData): Element {
  const children: Element[] = [];

  // テキスト部分（左側）
  const textChildren: Element[] = [
    {
      type: "element",
      tagName: "span",
      properties: { className: ["link-card-title"] },
      children: [{ type: "text", value: ogp.title }],
    },
  ];

  if (ogp.description) {
    textChildren.push({
      type: "element",
      tagName: "span",
      properties: { className: ["link-card-description"] },
      children: [
        {
          type: "text",
          value:
            ogp.description.length > 100
              ? `${ogp.description.slice(0, 100)}…`
              : ogp.description,
        },
      ],
    });
  }

  const domainChildren: (Element | Text)[] = [];
  if (ogp.favicon) {
    domainChildren.push({
      type: "element",
      tagName: "img",
      properties: {
        src: ogp.favicon,
        alt: "",
        width: 16,
        height: 16,
        className: ["link-card-favicon"],
        loading: "lazy",
      },
      children: [],
    });
  }
  domainChildren.push({ type: "text", value: ogp.domain });

  textChildren.push({
    type: "element",
    tagName: "span",
    properties: { className: ["link-card-domain"] },
    children: domainChildren,
  });

  children.push({
    type: "element",
    tagName: "span",
    properties: { className: ["link-card-content"] },
    children: textChildren,
  });

  // OGP 画像（右側）
  if (ogp.image) {
    children.push({
      type: "element",
      tagName: "span",
      properties: { className: ["link-card-image"] },
      children: [
        {
          type: "element",
          tagName: "img",
          properties: {
            src: ogp.image,
            alt: "",
            loading: "lazy",
          },
          children: [],
        },
      ],
    });
  }

  return {
    type: "element",
    tagName: "a",
    properties: {
      href: url,
      target: "_blank",
      // hast の型定義上 rel は space-separated 配列（HTML 出力は同じ "noopener noreferrer"）
      rel: ["noopener", "noreferrer"],
      className: ["link-card"],
    },
    children,
  };
}

export default function satteriLinkCard() {
  return defineHastPlugin({
    name: "satteri-link-card",
    element: {
      filter: ["p"],
      async visit(node) {
        const url = isBareLinkParagraph(node);
        if (!url) return;

        const ogp = await fetchOgp(url);
        if (!ogp) return;

        return createCardElement(url, ogp);
      },
    },
  });
}
