import React from "react";
import type {
  BlogBlock,
  BlogBlockStyle,
  BlogFontFamily,
  BlogTemplateKey,
} from "../services/blogApi";

const FONT_STACKS: Record<BlogFontFamily, string | undefined> = {
  default: undefined,
  sans: 'Inter, "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  display: "Sora, Manrope, Inter, sans-serif",
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
};

const clamp = (value: number | undefined, min: number, max: number) => {
  if (!Number.isFinite(value)) return undefined;
  return Math.min(Math.max(Number(value), min), max);
};

const blockText = (block: BlogBlock) => {
  if (block.type === "bullets") return block.items.join(". ");
  if (
    block.type === "paragraph" ||
    block.type === "heading" ||
    block.type === "quote"
  ) {
    return block.text;
  }
  return "";
};

const speak = (text: string) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
};

const shellStyle = (style: BlogBlockStyle | undefined): React.CSSProperties => {
  const width = clamp(style?.widthPercent, 35, 100);
  const align = style?.textAlign || "left";
  return {
    width: width ? `${width}%` : undefined,
    marginLeft:
      align === "right" ? "auto" : align === "center" ? "auto" : undefined,
    marginRight:
      align === "left" ? "auto" : align === "center" ? "auto" : undefined,
  };
};

const contentStyle = (
  style: BlogBlockStyle | undefined,
  hasBackgroundImage = false,
): React.CSSProperties => {
  const fontSize = clamp(style?.fontSize, 12, 92);
  const paddingY = clamp(style?.paddingY, 0, 96);
  const borderRadius = clamp(style?.borderRadius, 0, 48);
  const overlayOpacity = clamp(style?.overlayOpacity, 0, 0.92) ?? 0.5;
  const backgroundImage = style?.backgroundImageUrl
    ? `linear-gradient(rgba(15, 23, 42, ${overlayOpacity}), rgba(15, 23, 42, ${overlayOpacity})), url("${style.backgroundImageUrl.replace(/"/g, "%22")}")`
    : undefined;

  return {
    fontFamily: FONT_STACKS[style?.fontFamily || "default"],
    fontSize: fontSize ? `${fontSize}px` : undefined,
    color:
      style?.textColor ||
      (hasBackgroundImage || style?.backgroundImageUrl ? "#ffffff" : undefined),
    backgroundColor: style?.backgroundColor || undefined,
    textAlign: style?.textAlign || undefined,
    paddingTop: paddingY ? `${paddingY}px` : undefined,
    paddingBottom: paddingY ? `${paddingY}px` : undefined,
    paddingLeft:
      style?.backgroundColor || style?.backgroundImageUrl
        ? "clamp(1rem, 4vw, 2.5rem)"
        : undefined,
    paddingRight:
      style?.backgroundColor || style?.backgroundImageUrl
        ? "clamp(1rem, 4vw, 2.5rem)"
        : undefined,
    borderRadius:
      style?.backgroundColor || style?.backgroundImageUrl
        ? `${borderRadius ?? 20}px`
        : undefined,
    backgroundImage,
    backgroundSize: backgroundImage ? "cover" : undefined,
    backgroundPosition: backgroundImage ? "center" : undefined,
  };
};

const ReadButton: React.FC<{ block: BlogBlock }> = ({ block }) => {
  if (!("readAloud" in block) || !block.readAloud) return null;
  const text = blockText(block).trim();
  if (!text) return null;
  return (
    <button
      type="button"
      onClick={() => speak(text)}
      className="agently-blog-listen"
      aria-label="Listen to this section"
      title="Listen to this section"
    >
      <span aria-hidden="true">▶</span>
      Listen
    </button>
  );
};

const BlogContent: React.FC<{
  blocks: BlogBlock[];
  templateKey?: BlogTemplateKey;
}> = ({ blocks, templateKey = "product_update" }) => (
  <div
    className={`agently-blog-content agently-blog-template-${templateKey.replace("_", "-")}`}
  >
    {blocks.map((block) => {
      const style = block.style;
      const shell = shellStyle(style);
      const inner = contentStyle(style, Boolean(style?.backgroundImageUrl));

      if (block.type === "heading") {
        return (
          <div key={block.id} className="agently-blog-block" style={shell}>
            <ReadButton block={block} />
            <h2 style={inner}>{block.text}</h2>
          </div>
        );
      }
      if (block.type === "paragraph") {
        return (
          <div key={block.id} className="agently-blog-block" style={shell}>
            <ReadButton block={block} />
            <p style={inner}>{block.text}</p>
          </div>
        );
      }
      if (block.type === "quote") {
        return (
          <div key={block.id} className="agently-blog-block" style={shell}>
            <ReadButton block={block} />
            <blockquote style={inner}>{block.text}</blockquote>
          </div>
        );
      }
      if (block.type === "bullets") {
        return (
          <div key={block.id} className="agently-blog-block" style={shell}>
            <ReadButton block={block} />
            <ul style={inner}>
              {block.items.map((item, index) => (
                <li key={`${block.id}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
        );
      }
      if (block.type === "video") {
        return (
          <figure key={block.id} className="agently-blog-block" style={shell}>
            <video
              src={block.url}
              poster={block.posterUrl || undefined}
              controls
              preload="metadata"
              playsInline
              style={{
                width: "100%",
                objectFit: style?.mediaFit || "cover",
                borderRadius: `${clamp(style?.borderRadius, 0, 48) ?? 20}px`,
              }}
            />
            {block.caption ? <figcaption>{block.caption}</figcaption> : null}
          </figure>
        );
      }
      return (
        <figure key={block.id} className="agently-blog-block" style={shell}>
          <img
            src={block.url}
            alt={block.alt || ""}
            loading="lazy"
            style={{
              objectFit: style?.mediaFit || "cover",
              borderRadius: `${clamp(style?.borderRadius, 0, 48) ?? 20}px`,
            }}
          />
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      );
    })}
  </div>
);

export default BlogContent;
