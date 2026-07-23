/**
 * agently/components/BlogContent.tsx   — FULL REPLACEMENT
 *
 * ISSUE 3: "More block settings: width, spacing, background image, and corners
 *           changes from there are not reflecting ... and not even showing on
 *           the published blogpost"
 *
 * ROOT CAUSE — the renderer never read the settings.
 *   BlogBlockStyle (services/blogApi.ts) defines ELEVEN properties:
 *     fontFamily, fontSize, textColor, backgroundColor, textAlign,
 *     widthPercent, paddingY, borderRadius, backgroundImageUrl,
 *     overlayOpacity, mediaFit
 *   The previous 55-line renderer read `block.text`, `block.items` and
 *   `block.url` and NOTHING ELSE. Every style was saved to the database
 *   correctly and then silently discarded at render time — which is why the
 *   editor, the preview and the published post all looked identical no matter
 *   what you changed.
 *
 * This version applies all eleven. Preview and published output both render
 * through this component, so they now agree by construction.
 */

import React from "react";
import type {
  BlogBlock,
  BlogBlockStyle,
  BlogTemplateKey,
  BlogFontFamily,
} from "../services/blogApi";

const FONT_STACKS: Record<BlogFontFamily, string> = {
  default: "",
  sans: "'Inter', system-ui, -apple-system, sans-serif",
  serif: "'Georgia', 'Times New Roman', serif",
  display: "'Poppins', 'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
};

/** Outer wrapper: width, vertical rhythm, corners, background, background image. */
function blockShellStyle(style?: BlogBlockStyle): React.CSSProperties {
  if (!style) return {};
  const css: React.CSSProperties = {};

  // WIDTH — the setting that appeared to do nothing.
  if (typeof style.widthPercent === "number" && style.widthPercent > 0) {
    css.width = `${Math.min(Math.max(style.widthPercent, 10), 100)}%`;
    // Centre it, or a 60%-width block reads as broken rather than deliberate.
    css.marginLeft = "auto";
    css.marginRight = "auto";
  }

  // SPACING
  if (typeof style.paddingY === "number") {
    css.paddingTop = `${style.paddingY}px`;
    css.paddingBottom = `${style.paddingY}px`;
  }

  // CORNERS
  if (typeof style.borderRadius === "number") {
    css.borderRadius = `${style.borderRadius}px`;
    // Without this a background image squares off the rounded corners.
    css.overflow = "hidden";
  }

  if (style.backgroundColor) css.backgroundColor = style.backgroundColor;

  // BACKGROUND IMAGE
  if (style.backgroundImageUrl) {
    css.backgroundImage = `url(${style.backgroundImageUrl})`;
    css.backgroundSize = style.mediaFit === "contain" ? "contain" : "cover";
    css.backgroundPosition = "center";
    css.backgroundRepeat = "no-repeat";
    css.position = "relative";
    // A background image needs breathing room or text sits on its edge.
    if (typeof style.paddingY !== "number") {
      css.paddingTop = "48px";
      css.paddingBottom = "48px";
    }
    css.paddingLeft = "clamp(16px, 4%, 40px)";
    css.paddingRight = "clamp(16px, 4%, 40px)";
  }

  return css;
}

/** Inner: typography only, so the overlay sits between shell and text. */
function textStyle(style?: BlogBlockStyle): React.CSSProperties {
  if (!style) return {};
  const css: React.CSSProperties = {};
  if (style.fontFamily && style.fontFamily !== "default") {
    css.fontFamily = FONT_STACKS[style.fontFamily];
  }
  if (typeof style.fontSize === "number" && style.fontSize > 0) {
    css.fontSize = `${style.fontSize}px`;
    css.lineHeight = style.fontSize > 32 ? 1.15 : 1.6;
  }
  if (style.textColor) css.color = style.textColor;
  if (style.textAlign) css.textAlign = style.textAlign;
  return css;
}

/** Dark scrim so text stays readable over a background image. */
const Overlay: React.FC<{ style?: BlogBlockStyle }> = ({ style }) => {
  if (!style?.backgroundImageUrl) return null;
  const opacity =
    typeof style.overlayOpacity === "number" ? style.overlayOpacity : 0.45;
  if (opacity <= 0) return null;
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: `rgba(15, 23, 42, ${Math.min(Math.max(opacity, 0), 1)})`,
        pointerEvents: "none",
      }}
    />
  );
};

const BlockShell: React.FC<{
  style?: BlogBlockStyle;
  children: React.ReactNode;
}> = ({ style, children }) => (
  <div style={blockShellStyle(style)}>
    <Overlay style={style} />
    <div style={{ position: "relative" }}>{children}</div>
  </div>
);

const BlogContent: React.FC<{
  blocks: BlogBlock[];
  templateKey?: BlogTemplateKey;
}> = ({ blocks, templateKey = "product_update" }) => (
  <div
    className={`agently-blog-content agently-blog-template-${templateKey.replace("_", "-")}`}
  >
    {blocks.map((block) => {
      const style = (block as { style?: BlogBlockStyle }).style;

      if (block.type === "heading") {
        return (
          <BlockShell key={block.id} style={style}>
            <h2 style={textStyle(style)}>{block.text}</h2>
          </BlockShell>
        );
      }

      if (block.type === "paragraph") {
        return (
          <BlockShell key={block.id} style={style}>
            <p style={textStyle(style)}>{block.text}</p>
          </BlockShell>
        );
      }

      if (block.type === "quote") {
        return (
          <BlockShell key={block.id} style={style}>
            <blockquote style={textStyle(style)}>{block.text}</blockquote>
          </BlockShell>
        );
      }

      if (block.type === "bullets") {
        return (
          <BlockShell key={block.id} style={style}>
            <ul style={textStyle(style)}>
              {block.items.map((item, index) => (
                <li key={`${block.id}-${index}`}>{item}</li>
              ))}
            </ul>
          </BlockShell>
        );
      }

      if (block.type === "image") {
        return (
          <BlockShell key={block.id} style={style}>
            <figure>
              <img
                src={block.url}
                alt={block.alt || ""}
                loading="lazy"
                style={{
                  objectFit:
                    style?.mediaFit === "contain" ? "contain" : "cover",
                  borderRadius: style?.borderRadius
                    ? `${style.borderRadius}px`
                    : undefined,
                  width: "100%",
                }}
              />
              {block.caption ? (
                <figcaption style={textStyle(style)}>
                  {block.caption}
                </figcaption>
              ) : null}
            </figure>
          </BlockShell>
        );
      }

      if (block.type === "video") {
        return (
          <BlockShell key={block.id} style={style}>
            <figure>
              <video
                src={block.url}
                poster={block.posterUrl || undefined}
                controls
                style={{
                  objectFit:
                    style?.mediaFit === "contain" ? "contain" : "cover",
                  borderRadius: style?.borderRadius
                    ? `${style.borderRadius}px`
                    : undefined,
                  width: "100%",
                }}
              />
              {block.caption ? (
                <figcaption style={textStyle(style)}>
                  {block.caption}
                </figcaption>
              ) : null}
            </figure>
          </BlockShell>
        );
      }

      return null;
    })}
  </div>
);

export default BlogContent;
