import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".codex-hardhat",
  ".venv-slither",
  "aderyn-reports",
  "artifacts",
  "cache",
  "crytic-export",
  "node_modules",
  "slither-reports",
  "typechain-types",
]);

const requiredFiles = [
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "LICENSE",
  "AGENTS.md",
  "docs/CURRENT_STATE.md",
  "docs/DEVELOPER_GUIDE.md",
  "docs/REPOSITORY_MAINTENANCE.md",
  ".github/CODEOWNERS",
  ".github/pull_request_template.md",
];

const secretPatterns = [
  {
    name: "private key assignment",
    pattern:
      /\b(?:PRIVATE_KEY|OWNER_PRIVATE_KEY|TREASURY_PRIVATE_KEY|LIQ_PRIVATE_KEY)\s*[:=]\s*["']?0x[a-fA-F0-9]{64}\b/g,
  },
  {
    name: "mnemonic or seed phrase assignment",
    pattern:
      /\b(?:MNEMONIC|SEED_PHRASE)\s*[:=]\s*["'][^"'\r\n]{20,}["']/gi,
  },
  {
    name: "credential-bearing RPC URL",
    pattern:
      /https:\/\/[^\s"'`]*(?:alchemy\.com|infura\.io|quiknode\.pro)\/(?:v2|v3|[a-fA-F0-9]{16,})\/?[^\s"'`)]+/gi,
  },
];

const textExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ps1",
  ".sh",
  ".sol",
  ".ts",
  ".txt",
  ".yml",
  ".yaml",
]);

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

function relative(absolute) {
  return path.relative(root, absolute).replaceAll("\\", "/");
}

function localMarkdownTargets(markdown) {
  const targets = [];
  const pattern = /!?\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of markdown.matchAll(pattern)) {
    const raw = match[1].replace(/^<|>$/g, "");
    if (
      raw.startsWith("#") ||
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("mailto:")
    ) {
      continue;
    }
    targets.push(decodeURIComponent(raw.split("#", 1)[0]));
  }
  return targets;
}

const errors = [];

for (const file of requiredFiles) {
  if (!(await exists(path.join(root, file)))) {
    errors.push(`required file missing: ${file}`);
  }
}

const forbiddenRootFiles = [".env", ".env.local", ".env.v4.fresh"];
for (const file of forbiddenRootFiles) {
  if (await exists(path.join(root, file))) {
    errors.push(`private environment file present in repository tree: ${file}`);
  }
}

const files = await walk(root);
for (const absolute of files) {
  const extension = path.extname(absolute).toLowerCase();
  if (!textExtensions.has(extension)) continue;

  const content = await readFile(absolute, "utf8");
  const file = relative(absolute);

  for (const { name, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      errors.push(`${name} detected: ${file}`);
    }
  }

  if (extension === ".json") {
    try {
      JSON.parse(content);
    } catch (error) {
      errors.push(`invalid JSON: ${file}: ${error.message}`);
    }
  }

  if (extension === ".md") {
    for (const target of localMarkdownTargets(content)) {
      if (!target) continue;
      const resolved = path.resolve(path.dirname(absolute), target);
      if (!(await exists(resolved))) {
        errors.push(`broken local Markdown link: ${file} -> ${target}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Public repository verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Public repository verification passed (${files.length} files inspected).`,
  );
}
