# 开发维护指南

本指南对照 [package.json](../package.json) 、[vite.config.js](../vite.config.js) 与根目录 [scripts/](../scripts/) 编写。使用方式见 [使用指南](usage.md) ，真实进度与最近验证见 [路线图](../ROADMAP.md) 。

## 运行要求与启动

依赖版本以 `package.json` 和 `package-lock.json` 为准。当前已安装 Vite 与官方 Vue 插件均要求 Node.js `^20.19.0 || >=22.12.0`，使用满足该范围的 Node.js 和 npm，不因整理文档升级依赖。

```sh
npm ci
npm run dev
```

开发地址为 [http://127.0.0.1:5173/](http://127.0.0.1:5173/) 。开发服务只绑定 `127.0.0.1`，固定端口 5173，端口占用时直接报错，不自动换端口。Vue 源文件通过 HTTP 使用，不能双击 HTML。

## npm 命令

| 命令 | 实际行为 |
| --- | --- |
| `npm run prepare:listening` | 从听力语料源与本地 MP3 生成精简章节、文件清单及缺失报告 |
| `npm run prepare:words` | 从现有单词分组生成精简章节，读取听力生成数据建立完整词条音频索引 |
| `npm run dev` | `predev` 先依次准备听力和单词，再启动 Vite 开发服务 |
| `npm test` | 执行 `node --test tests/*.test.js`，不自动准备数据 |
| `npm run build` | `prebuild` 先依次准备数据，再执行 Vite 构建、音频复制与最新版本指针写入 |
| `npm run preview` | 在固定本地地址预览 `dist/latest.json` 指定的构建，不重新构建或复制音频 |

### 数据变更

修改听力语料或音频后，顺序执行：

```sh
npm run prepare:listening
npm run prepare:words
```

修改单词分组 JSON 时，若听力生成数据已存在且未变，可仅运行 `npm run prepare:words`。重启开发或执行完整构建会自动完成两步。输出目录 `src/generated/` 不手工编辑或提交，听力覆盖检查查看 `src/generated/listening-audio-report.json`。

`words/scripts/` 的抓取、旧同义词打包与 HTML 内联刷新脚本不属于这些命令；不得用内联刷新工具覆盖当前 Vue 入口。输入与生成文件职责见 [架构说明](architecture.md#数据来源与准备顺序) 。

## 验证

新检出或缺少 `src/generated/` 时，先准备数据，再运行测试；现有部分回归通过 Vite 加载依赖生成数据的学习模块。

```sh
npm run prepare:listening
npm run prepare:words
npm test
npm run build
git diff --check
```

| 测试文件 | 主要覆盖 |
| --- | --- |
| [learning.test.js](../tests/learning.test.js) 、[storage.test.js](../tests/storage.test.js) | 难度、复习与记录大小、保存失败及恢复 |
| [word-library.test.js](../tests/word-library.test.js) 、[word-audio.test.js](../tests/word-audio.test.js) | CSV／TXT、格式边界、词库隔离、目标删除与 MP3 匹配复制 |
| [listening.test.js](../tests/listening.test.js) | 语料、分隔符、播放与判题、章节计分、旧记录与存储 |
| [practice.test.js](../tests/practice.test.js) 、[synonym-cache.test.js](../tests/synonym-cache.test.js) | 词表解析、循环、发音取消、缓存顺序与保存 |
| [browser-notice.test.js](../tests/browser-notice.test.js) | 浏览器识别、共享每日提醒与存储不可用 |
| [audit-regressions.test.js](../tests/audit-regressions.test.js) | 审查问题的并发、双后端故障、容量／编码、键回收、反馈、快捷键与日期回归 |

按改动范围验证核心操作、刷新恢复、桌面／手机布局、存储失败重试与实际音频。自动化测试通过不能替代真实浏览器、Windows 原生快捷键或生产缓存验收；本次执行与历史结果分别记录在路线图。

音频 HTTP 核验使用生成索引或听力 `audioUrl()` 返回的实际地址，特别注意文件名中的字面加号与百分号。当前 Vite 预览中，将字面加号另写为 `%2B` 可能返回 HTML 回退页；必须同时检查状态、音频类型和响应字节，不能只看 200。相关生成与复制规则见 [发音链路](architecture.md#发音链路) 。

文档变更需核对实际代码、命令、相对链接、章节锚点、格式示例与围栏，并运行 `git diff --check`。不要把尚未执行的步骤写成验证通过。

## 静态构建与预览

完整构建由 [build.mjs](../scripts/build.mjs) 编排，[build-output.mjs](../scripts/build-output.mjs) 为每轮创建新目录。`vite build` 单独运行只完成 Vite 部分，不包含完整音频复制与最新版本指针更新。

```text
dist/
  latest.json
  releases/
    build-<random>/
      index.html
      words/study_words.html
      listening-word/王璐语料库_源码.html
      synonyms/index.html
      word-player/index.html
      assets/
      words/assets/audio/
      listening-word/...
```

每轮输出五个 HTML 入口、脚本、样式、数据与本地音频。Vite 构建及音频复制全部成功后才写入 `dist/latest.json`，包含 `directory` 和 `builtAt`；后者为 UTC ISO 时间。失败时指针保留旧值，失败目录保留供检查，现有构建与历史目录也保留。

```sh
npm run build
node --input-type=module -e "import { readFileSync } from 'node:fs'; console.log(JSON.parse(readFileSync('dist/latest.json', 'utf8')).directory);"
npm run preview
```

预览和开发都使用 `http://127.0.0.1:5173/`，切换前停止当前进程。预览按指针读取；指针缺失时配置回退到旧 `dist/`，这不表示已有可用的完整构建，首次预览仍需先执行 `npm run build`。

发布取指针指定目录中的内容；不能直接上传整个 `dist/`，也不能固定使用某个历史 `build-*` 目录。源数据和本地音频总量较大，构建会新增完整版本；清理旧目录需另行取得删除授权。

## 服务器部署

仓库记录的既有环境为 `47.100.74.187`，使用系统 Nginx 提供纯静态文件，访问地址为 [IELTS Studio](http://47.100.74.187/) 。服务器不需要 Vite、Node.js 或数据库参与网站运行。本指南记录环境与流程，当前实际发布版本以路线图最近一次服务器验证为准。

| 项目 | 路径 |
| --- | --- |
| 独立发布目录 | `/var/www/ielts-studio/releases/` |
| 当前入口 | `/var/www/ielts-studio/current`，指向已验证版本 |
| 服务器站点配置 | `/etc/nginx/conf.d/ielts-studio.conf` |
| 仓库配置副本 | [deploy/ielts-studio.nginx.conf](../deploy/ielts-studio.nginx.conf) |
| 访问与错误日志 | `/var/log/nginx/ielts-studio.access.log`、`/var/log/nginx/ielts-studio.error.log` |
| 发布文件 SHA-256 清单 | `/var/lib/ielts-studio/`，位于公开站点目录外 |

取得该次发布授权后，按以下顺序执行：

1. 本地测试与完整构建通过，读取 `dist/latest.json` 指定目录。
2. 将目录内文件上传到新的独立服务器版本目录，逐项核对 SHA-256，检查 `nginx -t`。
3. 校验后切换 `current`，需要时重载 Nginx，保留历史版本。
4. 复验五个入口、词库、缺失资源 404、音频 Range 和缓存，再更新 `ROADMAP.md`。

配置副本使用 `try_files` 返回真实 404；HTML 使用 `no-cache`，`/assets/` 使用一年不可变缓存，MP3 缓存 30 天。脚本和样式使用内容哈希，开启文本资源 Gzip。生产 Range、响应字节和缓存效果必须实际请求验证，不能仅凭配置文本判定通过。

授权范围内的服务器状态检查命令：

```sh
systemctl status nginx
systemctl is-enabled nginx
nginx -t
readlink -f /var/www/ielts-studio/current
```

当前部署约定使用 HTTP；本地与服务器来源不同，学习记录不会自动共享。公开发布、服务器配置修改、文件清理及其他红线操作仍按 [项目规范](../CLAUDE.md) 和用户当次授权执行，文档记录不构成操作授权。
