import React from "react";
import type { BlogBlock, BlogTemplateKey } from "../services/blogApi";

const BlogContent: React.FC<{
  blocks: BlogBlock[];
  templateKey?: BlogTemplateKey;
}> = ({ blocks, templateKey = "product_update" }) => (
  <div
    className={`agently-blog-content agently-blog-template-${templateKey.replace("_", "-")}`}
  >
    {blocks.map((block) => {
      if (block.type === "heading") {
        return <h2 key={block.id}>{block.text}</h2>;
      }
      if (block.type === "paragraph") {
        return <p key={block.id}>{block.text}</p>;
      }
      if (block.type === "quote") {
        return <blockquote key={block.id}>{block.text}</blockquote>;
      }
      if (block.type === "bullets") {
        return (
          <ul key={block.id}>
            {block.items.map((item, index) => (
              <li key={`${block.id}-${index}`}>{item}</li>
            ))}
          </ul>
        );
      }
      if (block.type === "image") {
        return (
          <figure key={block.id}>
            <img src={block.url} alt={block.alt || ""} loading="lazy" />
            {block.caption ? <figcaption>{block.caption}</figcaption> : null}
          </figure>
        );
      }
      if (block.type === "video") {
        return (
          <figure key={block.id}>
            <video
              src={block.url}
              poster={block.posterUrl || undefined}
              controls
            />
            {block.caption ? <figcaption>{block.caption}</figcaption> : null}
          </figure>
        );
      }
      return null;
    })}
  </div>
);

export default BlogContent;
