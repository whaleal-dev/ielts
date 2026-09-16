#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const http = require("http");
const https = require("https");

const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_SOURCE = path.resolve(PROJECT_ROOT, "王璐语料库_源码.html");
const DEFAULT_OUTPUT = path.resolve(PROJECT_ROOT, "assets", "audio");
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_RETRY = 3;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_BASE_URL = "http://www.1kao.com.cn/iSpell/Spell/audio";

function normalizeWordFileName(word) {
  return String(word)
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
}

function parseArgs(argv) {
  const options = {
    source: DEFAULT_SOURCE,
    output: DEFAULT_OUTPUT,
    concurrency: DEFAULT_CONCURRENCY,
    retry: DEFAULT_RETRY,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    baseUrl: DEFAULT_BASE_URL,
    chapter: "",
    force: false,
    limit: 0,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--source") {
      options.source = path.resolve(argv[index + 1] || "");
      index += 1;
      continue;
    }

    if (arg === "--output") {
      options.output = path.resolve(argv[index + 1] || "");
      index += 1;
      continue;
    }

    if (arg === "--concurrency") {
      options.concurrency = Math.max(1, Number.parseInt(argv[index + 1] || String(DEFAULT_CONCURRENCY), 10) || DEFAULT_CONCURRENCY);
      index += 1;
      continue;
    }

    if (arg === "--retry") {
      options.retry = Math.max(1, Number.parseInt(argv[index + 1] || String(DEFAULT_RETRY), 10) || DEFAULT_RETRY);
      index += 1;
      continue;
    }

    if (arg === "--timeout") {
      options.timeoutMs = Math.max(1000, Number.parseInt(argv[index + 1] || String(DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS);
      index += 1;
      continue;
    }

    if (arg === "--base-url") {
      options.baseUrl = String(argv[index + 1] || DEFAULT_BASE_URL).replace(/\/$/, "");
      index += 1;
      continue;
    }

    if (arg === "--chapter") {
      options.chapter = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      options.limit = Math.max(0, Number.parseInt(argv[index + 1] || "0", 10) || 0);
      index += 1;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`未知参数：${arg}`);
  }

  return options;
}

function printHelp() {
  console.log(`用法: node download_audio.js [options]

参数:
  --source <path>        语料 HTML 源文件，默认 ../王璐语料库_源码.html
  --output <path>        音频输出目录，默认 ../assets/audio
  --chapter <id>         仅下载指定章节，例如 31
  --concurrency <n>      并发下载数，默认 6
  --retry <n>            单文件失败重试次数，默认 3
  --timeout <ms>         单文件超时毫秒数，默认 15000
  --base-url <url>       音频基地址，默认 http://www.1kao.com.cn/iSpell/Spell/audio
  --limit <n>            仅处理前 n 个文件，便于测试
  --force                覆盖已存在文件
  --dry-run              只输出下载计划，不实际下载
  --help, -h             显示帮助
`);
}

function extractChapterWordSets(sourceHtml) {
  const match = sourceHtml.match(/const CHAPTER_WORD_SETS = (\{[\s\S]*?\n\});\n\s*const EXPORT_FILE_PREFIX/);
  if (!match) {
    throw new Error("未能从 HTML 中提取 CHAPTER_WORD_SETS 对象。");
  }

  return vm.runInNewContext(`(${match[1]})`, Object.create(null));
}

function buildTasks(chapterWordSets, options) {
  const entries = Object.entries(chapterWordSets)
    .sort((left, right) => Number(left[0]) - Number(right[0]));

  const filteredEntries = options.chapter
    ? entries.filter(([chapterId]) => chapterId === options.chapter)
    : entries;

  if (options.chapter && !filteredEntries.length) {
    throw new Error(`章节 ${options.chapter} 不存在。`);
  }

  const tasks = [];
  for (const [chapterId, chapter] of filteredEntries) {
    for (const word of chapter.words) {
      const encodedWord = encodeURIComponent(word);
      const wordFileName = `${normalizeWordFileName(word)}.mp3`;
      tasks.push({
        chapterId,
        chapterTitle: chapter.title,
        word,
        url: `${options.baseUrl}/${encodeURIComponent(chapterId)}/${encodedWord}.mp3`,
        originalOutputPath: path.join(options.output, chapterId, `${encodedWord}.mp3`),
        originalRelativePath: path.join(chapterId, `${encodedWord}.mp3`),
        wordOutputPath: path.join(options.output, "by-word", chapterId, wordFileName),
        wordRelativePath: path.join("by-word", chapterId, wordFileName),
      });
    }
  }

  return options.limit > 0 ? tasks.slice(0, options.limit) : tasks;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function fileExists(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.isFile() && stats.size > 0;
  } catch (_error) {
    return false;
  }
}

function fetchToFile(urlString, targetPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const client = url.protocol === "https:" ? https : http;
    const request = client.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const redirectedUrl = new URL(response.headers.location, urlString).toString();
        fetchToFile(redirectedUrl, targetPath, timeoutMs).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode || "UNKNOWN"}`));
        return;
      }

      ensureDir(path.dirname(targetPath));
      const tempPath = `${targetPath}.part`;
      const fileStream = fs.createWriteStream(tempPath);

      response.pipe(fileStream);

      fileStream.on("finish", () => {
        fileStream.close((closeError) => {
          if (closeError) {
            reject(closeError);
            return;
          }

          fs.rename(tempPath, targetPath, (renameError) => {
            if (renameError) {
              reject(renameError);
              return;
            }
            resolve();
          });
        });
      });

      fileStream.on("error", (streamError) => {
        response.destroy();
        fs.rm(tempPath, { force: true }, () => reject(streamError));
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`TIMEOUT ${timeoutMs}ms`));
    });

    request.on("error", (error) => {
      fs.rm(`${targetPath}.part`, { force: true }, () => reject(error));
    });
  });
}

async function downloadWithRetry(task, options) {
  const maxAttempts = options.retry;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fetchToFile(task.url, task.originalOutputPath, options.timeoutMs);
      return { ok: true, attempts: attempt };
    } catch (error) {
      if (attempt === maxAttempts) {
        return { ok: false, attempts: attempt, error };
      }
    }
  }

  return { ok: false, attempts: maxAttempts, error: new Error("UNKNOWN") };
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const results = new Array(items.length);

  async function consume() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, () => consume());
  await Promise.all(workers);
  return results;
}

function writeManifest(tasks, outputDir) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    total: tasks.length,
    files: tasks.map((task) => ({
      chapterId: task.chapterId,
      chapterTitle: task.chapterTitle,
      word: task.word,
      url: task.url,
      file: task.originalRelativePath,
      originalFile: task.originalRelativePath,
      wordFile: task.wordRelativePath,
    })),
  };

  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

function copyWordNamedFile(task) {
  ensureDir(path.dirname(task.wordOutputPath));
  fs.copyFileSync(task.originalOutputPath, task.wordOutputPath);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceHtml = fs.readFileSync(options.source, "utf8");
  const chapterWordSets = extractChapterWordSets(sourceHtml);
  const tasks = buildTasks(chapterWordSets, options);

  ensureDir(options.output);
  writeManifest(tasks, options.output);

  console.log(`源文件: ${options.source}`);
  console.log(`输出目录: ${options.output}`);
  console.log(`计划处理: ${tasks.length} 个音频文件`);
  console.log(`并发数: ${options.concurrency}，重试次数: ${options.retry}`);

  if (!tasks.length) {
    console.log("没有可处理的音频任务。");
    return;
  }

  if (options.dryRun) {
    console.log("dry-run 模式，不执行实际下载。");
    return;
  }

  let downloaded = 0;
  let skipped = 0;
  let synced = 0;
  let failed = 0;

  const startedAt = Date.now();

  await runPool(tasks, options.concurrency, async (task, index) => {
    const prefix = `[${index + 1}/${tasks.length}] ${task.chapterId} ${task.word}`;

    const hasOriginal = fileExists(task.originalOutputPath);
    const hasWordNamed = fileExists(task.wordOutputPath);

    if (!options.force && hasOriginal) {
      if (hasWordNamed) {
        skipped += 1;
        console.log(`${prefix} -> 两份文件已存在，跳过`);
        return;
      }

      try {
        copyWordNamedFile(task);
        synced += 1;
        console.log(`${prefix} -> 已补齐单词命名文件`);
        return;
      } catch (error) {
        failed += 1;
        console.error(`${prefix} -> 补齐单词命名文件失败: ${error.message || "UNKNOWN"}`);
        return;
      }
    }

    const result = await downloadWithRetry(task, options);
    if (result.ok) {
      try {
        copyWordNamedFile(task);
        downloaded += 1;
        console.log(`${prefix} -> 下载完成并生成两份文件 (尝试 ${result.attempts} 次)`);
        return;
      } catch (error) {
        failed += 1;
        console.error(`${prefix} -> 下载成功但生成单词命名文件失败: ${error.message || "UNKNOWN"}`);
        return;
      }
    }

    failed += 1;
    console.error(`${prefix} -> 下载失败: ${result.error ? result.error.message : "UNKNOWN"}`);
  });

  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`完成: 下载 ${downloaded}，补齐 ${synced}，跳过 ${skipped}，失败 ${failed}，耗时 ${durationSeconds}s`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});