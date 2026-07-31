#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const sourceRoots = [
  join(projectRoot, "apps", "web", "src"),
  join(projectRoot, "apps", "admin", "src"),
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
      continue;
    }

    if ([".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

function maskNonCode(source) {
  const chars = [...source];
  let state = "code";

  for (let index = 0; index < chars.length; index += 1) {
    const current = chars[index];
    const next = chars[index + 1];

    if (state === "code") {
      if (current === "/" && next === "/") {
        chars[index] = chars[index + 1] = " ";
        index += 1;
        state = "line-comment";
      } else if (current === "/" && next === "*") {
        chars[index] = chars[index + 1] = " ";
        index += 1;
        state = "block-comment";
      } else if (current === "'") {
        chars[index] = " ";
        state = "single-quote";
      } else if (current === '"') {
        chars[index] = " ";
        state = "double-quote";
      } else if (current === "`") {
        chars[index] = " ";
        state = "template";
      }
      continue;
    }

    if (current === "\n") {
      if (state === "line-comment") state = "code";
      continue;
    }

    chars[index] = " ";

    if (current === "\\") {
      if (index + 1 < chars.length) {
        if (chars[index + 1] !== "\n") chars[index + 1] = " ";
        index += 1;
      }
      continue;
    }

    if (state === "block-comment" && current === "*" && next === "/") {
      chars[index + 1] = " ";
      index += 1;
      state = "code";
    } else if (state === "single-quote" && current === "'") {
      state = "code";
    } else if (state === "double-quote" && current === '"') {
      state = "code";
    } else if (state === "template" && current === "`") {
      state = "code";
    }
  }

  return chars.join("");
}

function matchingDelimiter(source, openIndex, openCharacter, closeCharacter) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === openCharacter) depth += 1;
    if (source[index] === closeCharacter) depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function nextNonWhitespace(source, startIndex) {
  let index = startIndex;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
}

function asyncBodyStarts(source) {
  const starts = [];
  const asyncPattern = /\basync\b/g;

  for (const match of source.matchAll(asyncPattern)) {
    let cursor = nextNonWhitespace(source, match.index + match[0].length);

    if (source.startsWith("function", cursor)) {
      const openParenthesis = source.indexOf("(", cursor + "function".length);
      if (openParenthesis < 0) continue;
      const closeParenthesis = matchingDelimiter(
        source,
        openParenthesis,
        "(",
        ")",
      );
      if (closeParenthesis < 0) continue;
      const openBrace = source.indexOf("{", closeParenthesis + 1);
      if (openBrace >= 0) starts.push(openBrace);
      continue;
    }

    if (source[cursor] === "(") {
      const closeParenthesis = matchingDelimiter(source, cursor, "(", ")");
      if (closeParenthesis < 0) continue;
      const afterParameters = nextNonWhitespace(source, closeParenthesis + 1);

      if (source.startsWith("=>", afterParameters)) {
        const openBrace = nextNonWhitespace(source, afterParameters + 2);
        if (source[openBrace] === "{") starts.push(openBrace);
        continue;
      }
    }

    const methodParenthesis = source.indexOf("(", cursor);
    const arrowIndex = source.indexOf("=>", cursor);
    const firstBrace = source.indexOf("{", cursor);

    if (
      arrowIndex >= 0 &&
      (methodParenthesis < 0 || arrowIndex < methodParenthesis) &&
      (firstBrace < 0 || arrowIndex < firstBrace)
    ) {
      const openBrace = nextNonWhitespace(source, arrowIndex + 2);
      if (source[openBrace] === "{") starts.push(openBrace);
      continue;
    }

    if (
      methodParenthesis >= 0 &&
      (firstBrace < 0 || methodParenthesis < firstBrace)
    ) {
      const closeParenthesis = matchingDelimiter(
        source,
        methodParenthesis,
        "(",
        ")",
      );
      if (closeParenthesis < 0) continue;
      const openBrace = source.indexOf("{", closeParenthesis + 1);
      if (openBrace >= 0) starts.push(openBrace);
    }
  }

  return [...new Set(starts)].sort((a, b) => a - b);
}

function matchingBrace(source, openIndex) {
  return matchingDelimiter(source, openIndex, "{", "}");
}

function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function findUnsafeCurrentTargets(source) {
  const masked = maskNonCode(source);
  const starts = asyncBodyStarts(masked);

  const findings = [];
  for (const openIndex of starts) {
    const closeIndex = matchingBrace(masked, openIndex);
    if (closeIndex < 0) continue;

    const body = masked.slice(openIndex + 1, closeIndex);
    const awaitMatch = /\bawait\b/.exec(body);
    if (!awaitMatch) continue;

    const afterAwaitOffset = awaitMatch.index + awaitMatch[0].length;
    const afterAwait = body.slice(afterAwaitOffset);
    const currentTargetPattern = /\b(?:event|e|ev)\.currentTarget\b/g;

    for (const match of afterAwait.matchAll(currentTargetPattern)) {
      findings.push(openIndex + 1 + afterAwaitOffset + match.index);
    }
  }

  return [...new Set(findings)].sort((a, b) => a - b);
}

const failures = [];
for (const root of sourceRoots) {
  for (const file of await collectFiles(root)) {
    const source = await readFile(file, "utf8");
    for (const index of findUnsafeCurrentTargets(source)) {
      failures.push(`${relative(projectRoot, file)}:${lineAt(source, index)}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Unsafe React form-event access found after await:");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    "Capture the form before awaiting: const form = event.currentTarget;",
  );
  process.exit(1);
}

console.log(
  "PASS: no event.currentTarget access occurs after await in async form handlers.",
);
