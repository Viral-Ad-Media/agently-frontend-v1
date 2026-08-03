import React from "react";

interface ChatMessageContentProps {
  text: string;
  className?: string;
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function splitTrailingPunctuation(value: string) {
  const match = value.match(/^(.*?)([.,!?;:]+)?$/);
  return {
    value: match?.[1] || value,
    trailing: match?.[2] || "",
  };
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|(https?:\/\/[^\s<]+)/g;
  let cursor = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    if (match[1] && match[2]) {
      const href = safeHttpUrl(match[2]);
      nodes.push(
        href ? (
          <a
            key={`${keyPrefix}-link-${index}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-700"
          >
            {match[1]}
          </a>
        ) : (
          match[0]
        ),
      );
    } else if (match[3] || match[4]) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${index}`} className="font-extrabold text-slate-900">
          {match[3] || match[4]}
        </strong>,
      );
    } else if (match[5]) {
      const parts = splitTrailingPunctuation(match[5]);
      const href = safeHttpUrl(parts.value);
      nodes.push(
        href ? (
          <React.Fragment key={`${keyPrefix}-url-${index}`}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-700"
            >
              {parts.value}
            </a>
            {parts.trailing}
          </React.Fragment>
        ) : (
          match[0]
        ),
      );
    }

    cursor = pattern.lastIndex;
    index += 1;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export const ChatMessageContent: React.FC<ChatMessageContentProps> = ({
  text,
  className = "",
}) => {
  const normalized = String(text || "")
    .replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n")
    .trim();
  const lines = normalized.split("\n");
  const blocks: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const unordered = line.match(/^\s*[-*+•]\s+(.+)$/);
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);

    if (unordered) {
      const items: string[] = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*[-*+•]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="my-2 list-disc space-y-1 pl-5 marker:text-slate-400">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, `ul-${i}-${itemIndex}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (ordered) {
      const items: string[] = [];
      const start = Number(ordered[1]) || 1;
      while (i < lines.length) {
        const item = lines[i].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        i += 1;
      }
      blocks.push(
        <ol
          key={`ol-${i}`}
          start={start}
          className="my-2 list-decimal space-y-1 pl-5 marker:font-bold marker:text-slate-500"
        >
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, `ol-${i}-${itemIndex}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const heading = line.match(/^\s*#{1,4}\s+(.+)$/);
    if (heading) {
      blocks.push(
        <p key={`heading-${i}`} className="mb-1 mt-2 font-extrabold text-slate-900 first:mt-0">
          {renderInline(heading[1], `heading-${i}`)}
        </p>,
      );
      i += 1;
      continue;
    }

    const paragraph: string[] = [line.trim()];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*[-*+•]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*#{1,4}\s+/.test(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push(
      <p key={`p-${i}`} className="my-1.5 whitespace-pre-wrap first:mt-0 last:mb-0">
        {paragraph.map((part, partIndex) => (
          <React.Fragment key={partIndex}>
            {partIndex > 0 ? <br /> : null}
            {renderInline(part, `p-${i}-${partIndex}`)}
          </React.Fragment>
        ))}
      </p>,
    );
  }

  return (
    <div className={`min-w-0 break-words leading-6 ${className}`}>
      {blocks.length ? blocks : null}
    </div>
  );
};

export default ChatMessageContent;
