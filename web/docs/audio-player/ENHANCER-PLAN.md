# audio-player 系统词库增强（enhancer）接入方案

状态：**方案已定，未实现（骨架预留）** —— 已并入 corpus/listening 数据轮统一规划。

## 背景
legacy `audio-playlist-player/音频顺序播放器.html` 通过外部脚本注入“系统词库”面板：
- `system_word_audio_data.js` / `system_listening_audio_data.js`：超大全局数组（词/听力语料音频索引）
- `system_library_enhancer.js`（1245 行，IIFE）：向 `#systemLibraryAnchor` 注入“词汇库/听力语料库”选择面板，
  并将选中项导入播放清单。

legacy 契约（来自分析报告）：enhancer **整体重赋值主脚本 13 个顶层函数**（renderFileLibrary/renderPlaylist/
playCurrentItem/advanceToNextItem 等）并依赖全局 `state/elements`、用 capture 期 `ended/timeupdate` 拦截器接管
“sequence 条目”播放 —— Vue SFC 无法直接被此类旧 IIFE 复写。

## 决策
不把 legacy enhancer.js 直接塞进 Vue 组件；改为 **数据驱动的原生增强**，规划如下（放入后续轮次或新任务）：
1. 数据统一：词库音频索引 = `web/src/data/vocabulary/corpus.json`（已有）；听力语料条目与章节词集 =
   `web/src/data/corpus/chapters.json` + `sync-corpus-data.mjs`（已有）。系统词库增强改为读这些 JSON。
2. UI：在 `/audio-player` 学习页上方增加可折叠“系统词库”区（对应 legacy `#systemLibraryAnchor`）：
   - Tab A 词库（search + 章节/测试卷筛选 + 全选/反选/仅选中 → “加入音频库”）
   - Tab B 听力语料（章节/卷筛选 + 搜索 + 勾选 → 加入，附 sentence/chapter 信息与播放）
   - “已选摘要 chips” + “清空选择” + 一键“导入选中（含间隔秒 gapSeconds，支持 sequence 条目）”
3. 条目接入：为远程 URL 音频引入 **URL 文件条目**（非 File）：沿用 playlist item 结构并新增 `urlSource: true`
   与 `gapSeconds` 的 sequence 条目渲染与播放（改造 playCurrentItem 分支 + ended/timeupdate 拦截等价逻辑），
   复用现有 token/进度/暂停语义。词库远程音频不写 IndexedDB 历史（blob 无法跨域持久）。
4. 风险/取舍：不 1:1 复刻 legacy 的全局复写 hack；行为以“筛选-选择-加入-顺序播放含间隔”为准。

## 交付形态
- 待实施模块：`web/src/features/audio-player` 新增 `SystemLibrary.vue` 子组件 + store 扩展
- 当前页面在系统词库区预留的空位尚无 UI（与 legacy 加载前一致）；实施时直接挂载
