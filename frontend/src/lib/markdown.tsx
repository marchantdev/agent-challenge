/**
 * Shared markdown rendering utilities for Axiom components.
 * Supports: bold, inline code, headers (##/###), bullet lists,
 * numbered lists, fenced code blocks, and pipe-delimited tables.
 */
import React from "react";

export function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-zinc-100">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-xs font-mono text-emerald-300"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/** Returns true if a line is a markdown table separator (|---|---| style). */
function isTableSeparator(line: string): boolean {
  return /^\|[\s|:-]+\|$/.test(line.trim());
}

/** Returns true if a line looks like a table row. */
function isTableRow(line: string): boolean {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

/** Parse a table row string into an array of cell strings. */
function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * Collects consecutive table lines (header + separator + rows) starting at `start`.
 * Returns [tableNode, nextIndex].
 */
function extractTable(
  lines: string[],
  start: number,
  keyPrefix: string
): [React.ReactNode, number] {
  const headers = parseTableRow(lines[start]);
  let i = start + 1;

  // Skip separator row
  if (i < lines.length && isTableSeparator(lines[i])) i++;

  const rows: string[][] = [];
  while (i < lines.length && isTableRow(lines[i])) {
    rows.push(parseTableRow(lines[i]));
    i++;
  }

  const table = (
    <div key={keyPrefix} className="overflow-x-auto my-3">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-zinc-800">
            {headers.map((h, hi) => (
              <th
                key={hi}
                className="border border-zinc-700 px-3 py-1.5 text-left font-semibold text-zinc-200 whitespace-nowrap"
              >
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className={ri % 2 === 0 ? "bg-zinc-900" : "bg-zinc-800/50"}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="border border-zinc-700 px-3 py-1.5 text-zinc-300"
                >
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return [table, i];
}

/**
 * Render a markdown string into a React node tree.
 * Handles: fenced code blocks, ## / ### headers, bullet lists,
 * numbered lists, pipe tables, and inline formatting.
 */
export function renderMarkdown(
  text: string,
  wrapperClass = "text-sm text-zinc-200 leading-relaxed"
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeKey = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        parts.push(
          <pre
            key={`code-${codeKey++}`}
            className="bg-zinc-900 border border-zinc-700 rounded-md p-3 my-2 overflow-x-auto text-xs font-mono"
          >
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      i++;
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      i++;
      continue;
    }

    // Table detection
    if (isTableRow(line)) {
      const [tableNode, next] = extractTable(lines, i, `tbl-${i}`);
      parts.push(tableNode);
      i = next;
      continue;
    }

    // ### heading
    if (line.startsWith("### ")) {
      parts.push(
        <h4 key={i} className="font-semibold text-zinc-200 mt-3 mb-1 text-sm">
          {line.slice(4)}
        </h4>
      );
      i++;
      continue;
    }

    // ## heading
    if (line.startsWith("## ")) {
      parts.push(
        <h3 key={i} className="font-bold text-zinc-100 mt-3 mb-1">
          {line.slice(3)}
        </h3>
      );
      i++;
      continue;
    }

    // Bullet list
    if (line.match(/^[-*]\s/)) {
      parts.push(
        <div key={i} className="flex items-start gap-2 ml-2 my-0.5">
          <span className="text-emerald-500 mt-0.5 shrink-0">&#8226;</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
      i++;
      continue;
    }

    // Numbered list
    if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\./)?.[1] || "";
      parts.push(
        <div key={i} className="flex items-start gap-2 ml-2 my-0.5">
          <span className="text-emerald-400 font-mono text-xs mt-0.5 w-4 shrink-0">
            {num}.
          </span>
          <span>{renderInline(line.replace(/^\d+\.\s/, ""))}</span>
        </div>
      );
      i++;
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      parts.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    // Plain paragraph
    parts.push(
      <p key={i} className="my-0.5">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  // Flush unclosed code block
  if (inCodeBlock && codeLines.length > 0) {
    parts.push(
      <pre
        key={`code-end-${codeKey}`}
        className="bg-zinc-900 border border-zinc-700 rounded-md p-3 my-2 overflow-x-auto text-xs font-mono"
      >
        <code>{codeLines.join("\n")}</code>
      </pre>
    );
  }

  return <div className={wrapperClass}>{parts}</div>;
}
