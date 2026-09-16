# Vue3 单组件移植实现规范（基于 音频顺序播放器.html 精确逆向）

源文件行号均以 `音频顺序播放器.html` 为准；enhancer 部分以 `system_library_enhancer.js` 为准（简写为 enh.js）。标注 [未知] 为未明确定义处。

## 0. 文件总体结构
- 主体是一个 inline `<script>`（L550–1674），函数全部以 `function` 声明（顶层可重赋值），可被外部脚本覆盖——这是 enhancer 能工作的前提。
- L1676–1678 依次加载 `system_listening_audio_data.js` / `system_word_audio_data.js` / `system_library_enhancer.js`（数据脚本各自定义 `window.SYSTEM_LISTENING_AUDIO_DATA` / `window.SYSTEM_WORD_AUDIO_DATA`，enhancer 自执行）。
- 无 localStorage/sessionStorage；唯一持久化是 IndexedDB 历史缓存（见 §8）。

## 1. 数据结构
### 1.1 音频文件条目 fileItem（上传产生，L1147–1153）
- 字段：`id`（`createId('file')`）、`name`（File.name）、`file`（原始 File 对象引用）、`url`（`URL.createObjectURL(file)`）、`duration`（初始 `null`）。
- duration 由探测填充（见 §5 loadDurationForFile），合法数字或 null，**无 sortKey 字段**。
- 生命周期：仅在 removeFile/clearFilesBtn/beforeunload 时 `URL.revokeObjectURL(url)`（L899–901、L1176、L1673）。
- enhancer 会向 `state.files` 注入另一形态条目：`{id, kind:'sequence', name, libraryLabel, gapSeconds, segments:[{label,url,...}], duration:null}`，**无 file/url**（enh.js L969–980）；以 `fileItem.kind==='sequence'` 区分（enh.js L413–415）。非 sequence 条目结构同 1.1。

### 1.2 播放清单条目 playlistItem（makePlaylistItem，L1107–1116）
- 字段：`id`（`createId('item')`）、`fileId`（参数 fileId，空则回退 `state.files[0].id`）、`rate`、`repeats`、`useGlobalRate:false`、`useGlobalRepeats:false`。
- **注意：不是"null=跟随全局"模型**，而是"自有值 + 布尔开关"模型：rate/repeats 恒为已钳制数字（新建时复制当时的全局值 L1111–1112），`useGlobalRate/useGlobalRepeats` 为开关。有效值 `getEffectiveRate/Repeats`（L868–874）：开→读全局钳制值；关→读自身钳制值。
- `createId(prefix)` L747–749：`prefix + '-' + Math.random().toString(36).slice(2,10)`（8 位随机）。
- `duplicateItem(itemId)` L1219–1234：整对象浅拷贝并换新 id，插入原条目**之后**（index+1）；若 `currentIndex > 原index` 则 currentIndex+1；renderPlaylist。
- `moveItem(itemId, direction)` L1198–1217：target=cur+direction，越界(<0 或 >=length)直接 return；splice 搬移后修正 currentIndex：被移项即当前→currentIndex=target；cur>原index 且 cur<=target→-1；cur<原index 且 cur>=target→+1；renderPlaylist。
- 条目删除按钮（remove-item，见 §4）只从 playlist 删，不从 state.files 删；反之 removeFile（§5）会删除 playlist 中所有引用它的条目。

### 1.3 历史缓存（IndexedDB）
- DB `audio_playlist_history_db`，store `history_files`，keyPath `'id'`（L605–624 openHistoryDb；upgradeneeded 建 store，版本 1）。
- 键 id：`createHistoryId(file)` L626–628 = `[name, size, lastModified, type||'']` 以 `'::'` join。**重复上传同文件 = 同 id = store.put 覆盖并刷新 updatedAt，相当于置顶，不是新增行**。
- 存的记录字段（L663–672）：`{id, name, size, type, lastModified, updatedAt:Date.now(), blob: file}`——**blob 直接存原始 File 对象**（File 是 Blob 子类，可结构化克隆进 IDB）。
- 读：loadHistoryFilesFromCache L644–656 `store.getAll()` 后按 `updatedAt` 降序排序返回；排序与去重规则即"按 updatedAt 最新在前，id 天然去重"。
- 写：saveFilesToHistoryCache(fileList) L658–677，每个文件 put 一条；refreshHistoryLibrary L701–710 重读并 renderHistoryLibrary，失败置空列表并 updateStatus(警告)。
- 删：deleteHistoryFileById(historyId) L679–688 按 id delete；clearHistoryCache L690–699 `store.clear()`。
- 还原：historyEntryToFile(entry) L712–717 = `new File([entry.blob], entry.name, {type: entry.type||'audio/mpeg', lastModified: entry.lastModified||Date.now()})`。
- 历史 UI：renderHistoryLibrary L719–745，每行 `文件pill`（name + formatFileSize(size)）带按钮 `data-action="add-history"/"remove-history"` + `data-history-id=entry.id`；空时显示 empty-state。addAllHistoryBtn/clearHistoryCacheBtn 在无历史时 disabled。
- 历史点击（L1551–1577）：add-history → `addFiles([historyEntryToFile(entry)], {persistHistory:false})`（不二次入库）；remove-history → deleteHistoryFileById + refreshHistoryLibrary。addAllHistoryBtn（L1582–1591）：全部转 File 后 `addFiles(files, {persistHistory:false})`。clearHistoryCacheBtn L1592–1609：`window.confirm('确认清空全部历史音频缓存吗？')` 后 clear+refresh。

### 1.4 其他小工具
- formatFileSize L630–642（<1KB 'B'，<1MB KB 1 位小数，否则 MB）；escapeHtml L855–862（& < > " '）；getFileById L864–866。

## 2. 全局配置
- 输入元素：globalRate（number，min0.6/max2/step0.2，初值 1.0，L480）、globalRepeats（number，min1/max10/step1，初值1，L484）、timerMinutes（number，min0/max999/step0.1，初值120，placeholder 提示 0 停用，L488）、volumeSlider（range 0..1 step0.01 初值1，L537）、playMode（select：sequence|loop|shuffle，默认 sequence，L540–544）。
- clampRate(v) L751–761：非有限数→1；否则按 0.6 步长 0.2 就近取整 `round((v-min)/step)*step+min` 再夹到 [0.6,2]，返回 `Number(toFixed(1))`。
- clampRepeats(v) L763–769：`round(Number(v))`，非有限→1，夹到 [1,10]。
- getGlobalRate L771–775：clampRate 后把输入框 value 写成 `rate.toFixed(2)`（显示两位小数），返回数字。
- getGlobalRepeats L777–781：clampRepeats 后回写 String。
- getTimerMinutes L783–788：`Number(value)` 夹 [0,999]，非有限→0；回写 '0' 或 String。
- setTimerMinutes(m) L790–794：同钳制回写 + updateTimerLabel()（当前为 no-op）。
- getPlayMode L796–802：select.value 是 'loop'/'shuffle' 才生效，否则 'sequence'。
- change 事件：globalRate.change L1522–1526 → getGlobalRate + renderPlaylist + updateTimerLabel；globalRepeats.change L1528–1531 → getGlobalRepeats + renderPlaylist；timerMinutes.change/input L1533–1534 → 仅 updateTimerLabel；预设按钮 L1535–1538 → setTimerMinutes(0/30/60/90)；playMode.change L1539–1541 → 仅 updateStatus 文案。volume：见 §3（input 即改 audioPlayer.volume，L1437–1441）。

## 3. 播放引擎核心
### 3.1 状态机
- state 字段（L551–566）：files、historyFiles、playlist、currentIndex(-1)、currentLoop(0)、isPlaying、isPaused、autoPauseRemainingMs/deadline/TimeoutId、countdownIntervalId、autoPauseTriggered、activeItemId、statusClearTimeoutId。
- 状态 = (isPlaying,isPaused)：空闲(F,F)/播放中(T,F)/暂停(F,T)。startPlayback L1355–1366：validatePlaylist 失败 return；置 T,F；currentIndex = shuffle? `pickRandomIndex(-1)` : 0；currentLoop=1；initializeRunTimer()；playCurrentItem()；updateButtonStates()。**从 0/随机开始，无"续播当前项"入口**。
- pausePlayback(msg) L1368–1380：非 isPlaying 直接 return；audio.pause()；F,T；pauseRunTimer()；updateButtonStates()；可选状态文案。
- resumePlayback L1382–1391：非 isPaused return；T,F；resumeRunTimer()；`playCurrentItem({restart:false})`；updateButtonStates()。
- stopPlayback(msg) L1393–1399：resetPlaybackState(true) + updateButtonStates + 可选文案。
- completePlayback L1349–1353：resetPlaybackState(true) + updateStatus(`播放完成，共处理 ${playlist.length} 个播放项。`)。
- resetPlaybackState(keepStatusMessage) L980–997：currentIndex=-1、currentLoop=0、F,F、activeItemId=null、autoPauseTriggered=false、autoPauseRemainingMs=null、clearTimerArtifacts()、audio.pause()、removeAttribute('src')、audio.load()、progressFill 宽 0%、两个时间标签 '00:00'、updateTimerLabel()、renderPlaylist()。（注意：主脚本此函数不写状态文案，keepStatusMessage 参数实际未用；enhancer 版会用它。）
- startBtn 点击 L1491–1499：空闲→startPlayback；播放中→pausePlayback()；暂停→resumePlayback()（一个按钮切换）。stopBtn→stopPlayback()（L1500）。
- Space 键 L1502–1520：目标为 input/textarea/select/button 时忽略；否则 preventDefault 后同样三段切换。
- 图标：playIcon（▶️）与 pauseIcon（⏸️）是两个 span（L528–529）；updateButtonStates L1097–1098：播放中(T,!P)→playIcon none、pauseIcon inline，其余反之。
- updateButtonStates 全量规则 L1086–1105：clearFilesBtn.disabled=!files.length；addItemBtn.disabled=!files.length；applyRate/Repeats/AllBtn.disabled=!playlist.length；startBtn.disabled=!playlist.length；stopBtn.disabled=!isPlaying&&!isPaused；addAllHistory/clearHistoryCacheBtn.disabled=!historyFiles.length。

### 3.2 playCurrentItem（L1307–1336，含 URL/错误语义）
- `options.restart` 默认 true。取 `playlist[currentIndex]`；无条目→completePlayback()。
- fileItem 解析失败（fileId 无对应文件）→ updateStatus('当前播放项没有可用音频，已跳过。', true) 后 advanceToNextItem()——**这是"跳过失效项"逻辑**。
- 设置 activeItemId；rate=getEffectiveRate；repeats=getEffectiveRepeats；`currentLoop=max(1, currentLoop||1)`；`audioPlayer.playbackRate=rate`（每次重设）。
- src 应用：`if (restart || audioPlayer.src !== fileItem.url) { audioPlayer.src=url; currentTime=0 }`——restart=true（开始/换项/同项下一遍）强制归零；restart=false（resume）且 src 相同则保留进度续播。
- 然后 renderPlaylist()；`await audioPlayer.play()`；reject（如自动播放拦截/坏文件）→ `console.warn` + pausePlayback()（**主脚本无 audio 'error' 事件监听、无坏文件自动跳下一项的循环**，仅此 catch；audio 元素 preload="metadata"、无 autoplay 属性、无 controls、display:none，L545）。
- 音量：仅 volumeSlider 'input' 时钳 [0,1] 写 audioPlayer.volume（L1437–1441），播放过程不重放。
- 主脚本 playCurrentItem 不发 updateStatus；enhancer 覆盖版才发（见 §6）。

### 3.3 "播放次数"语义与推进（ended 处理器 L1401–1417）
- **次数循环发生在同一条目内**：每次自然的 'ended'：若 !isPlaying return（stop/complete 后的迟到事件被丢弃）；无当前 item→completePlayback；`repeats=getEffectiveRepeats(item)`；`currentLoop < repeats` → currentLoop+=1 后 playCurrentItem()（restart 默认 true，同 url 重播本项）——即一条目连续完整播放 repeats 遍；否则 advanceToNextItem()。
- 每遍是完整的"载入→play→自然 ended"，次数不重置 currentTime 之外的其它状态。
- advanceToNextItem L1338–1347：`getNextPlaylistIndex(currentIndex)`；-1→completePlayback；否则 currentIndex=next、currentLoop=1、playCurrentItem()。
- getNextPlaylistIndex L819–833：total=0→-1；loop → `(ci+1+total)%total`（永不为 -1，无限循环，含单条目）；shuffle → pickRandomIndex(ci)（L804–817：total=1→0；否则随机数 != ci 重抽，永不 -1）；sequence → ci+1，`next>=total?-1:next`（播到末尾自然结束）。shuffle/loop 无 playlist 清空时不会 complete。

### 3.4 进度与时间显示
- audio 事件注册 L1401–1435：'ended'（如上）；'timeupdate' → currentTimeLabel=formatTime(cur)、duration 有限>0 时 progressFill 宽度 `(cur/dur*100).toFixed(2)%`、durationLabel=formatTime(dur)，否则宽 0%/00:00；'loadedmetadata' → durationLabel=formatTime(duration) 或 00:00。
- 两套格式化：formatTime L1443–1448（进度用，`Math.floor`，m 补零两位数，非有限或 <0 → '00:00'）；formatDuration L835–843（文件时长展示用，<=0/非有限→'时长待加载'，`Math.round`，分不补零）；formatCountdown L845–853（倒计时，ceil，补零 mm:ss，<=0→'00:00'）。

### 3.5 定时自动暂停
- updateTimerLabel L919–921 = **no-op（极简 UI 已移除可见倒计时标签）**，但被多处调用以保持结构。
- armAutoPause(remainingMs) L931–946：先 clearTimerArtifacts()；remaining<=0/非有限 → remaining=null + updateTimerLabel 返回；否则 remaining=ms、deadline=now+ms、`setTimeout`（到点：remaining=0、autoPauseTriggered=true、`pausePlayback('定时器到点，已自动暂停。')`）+ startCountdownTicker（L923–929：清旧 interval、每 1000ms 调 updateTimerLabel=no-op）。
- initializeRunTimer L948–958：minutes=getTimerMinutes()；autoPauseTriggered=false；<=0 → clearTimerArtifacts + remaining=null；否则 armAutoPause(minutes*60_000)。**仅在 startPlayback 调用**。
- pauseRunTimer L960–966：有 deadline 时 remaining=max(0, deadline-now) 冻结；clearTimerArtifacts()；updateTimerLabel。
- resumeRunTimer L968–978：若 `autoPauseTriggered || remaining===0` → initializeRunTimer()（**自动到点后继续 = 重新整段计时**）；否则 remaining!==null → armAutoPause(remaining)（续走剩余）；null → 仅 updateTimerLabel。
- 用户手动暂停 → 计时器同时冻结；手动继续 → 续走。autoPauseTriggered 在 startPlayback 与 resetPlaybackState 中复位。
- clearTimerArtifacts L903–917：清 autoPauseTimeoutId/countdownIntervalId/statusClearTimeoutId，deadline=null。

## 4. 播放清单交互
### 4.1 renderPlaylist（L1027–1084）DOM 结构（每项一个 `<article class="queue-item[ active]">`，active 判定 `item.id===state.activeItemId`）
- item-head：`item-index`（index+1）、strong 标题（fileItem?name:'未选择音频'）、muted span（fileItem?formatDuration(duration):'请为这个条目选择一个已上传的音频'）；操作按钮行（data-action + data-item-id）：ghost `move-up` 上移、ghost `move-down` 下移、secondary `duplicate` 复制、danger `remove-item` 删除。
- field-grid 内三个 field：
  1) 音频文件 `<select id="file-<id>" data-field="fileId" data-item-id>`，option 由 fileOptionMarkup(item.fileId)（L999–1007，无文件→`<option value="">请先上传音频</option>`，否则每 file 一行 value=file.id、选中项 selected、文本 escapeHtml(name)）。
  2) 自定义倍速：`<input id="rate-<id>" type="number" min0.6 max2 step0.2 data-field="rate" value=<rate.toFixed(2)>>`，`item.useGlobalRate` 时加 `disabled`；下方 checkbox（data-field="useGlobalRate"，checked=useGlobalRate）文案 `跟随全局倍速（当前 ${effectiveRate}x）`。
  3) 自定义次数：`<input id="repeat-<id>" type="number" min1 max10 step1 data-field="repeats" value=<clampRepeats>>`，useGlobalRepeats 时 disabled；checkbox（data-field="useGlobalRepeats"）`跟随全局次数（当前 ${effectiveRepeats} 遍）`。
- item-meta 四 chip：实际倍速 `Xx`、实际次数 `N 遍`、累计播放（fileItem? `formatDuration(duration*getEffectiveRepeats(item))` : '--'）、音频来源（文件名后缀大写或 '--'）。
- 尾部：playlistMeta `N 个播放项` + updateButtonStates()。
- 注意 checkbox 不带 item 编号 id、输入框用 `useGlobalX ? disabled` 表达"跟随全局"（禁用时保留自定义值）。

### 4.2 事件委托（playlistContainer）
- click（L1611–1640）命中 `button[data-action]`：move-up/down→moveItem(id,∓1)；duplicate→duplicateItem；remove-item→从 playlist 过滤该 id，`removedIndex!==-1 && currentIndex>removedIndex` 时 currentIndex-=1；若 `activeItemId===id` → stopPlayback('当前播放项已删除，已停止播放。')（内部会 renderPlaylist），否则 renderPlaylist + updateStatus('已删除一个播放项。')。**文件不从 state.files 移除**。
- change（L1656 + handlePlaylistFieldEvent L1642–1654）：凡有 data-item-id+data-field 的目标，checkbox→`updatePlaylistField(id, field, target.checked)`，其余传 target.value（默认 render:true）。
- input（L1657–1662）：仅 `input[type="number"]` → `updatePlaylistField(id, field, value, {render:false})`——**每键实时钳制但不重渲染（避免丢焦点）**，change 时才重渲染刷新 label。
- updatePlaylistField L1236–1275：fileId=rawValue；rate=clampRate；repeats=clampRepeats；useGlobal* = Boolean(raw)。活跃条目特例：若改 rate/useGlobalRate 且是 activeItemId → `audioPlayer.playbackRate=getEffectiveRate(item)`；若 `isPlaying` 且改 fileId → audio.pause()、`currentLoop=max(1,currentLoop||1)`、playCurrentItem() 并 return（此时不额外 render）；改 repeats/useGlobalRepeats 对活跃项无即时动作（注释：循环标签已删）。
- applyGlobalSettings(mode) L1277–1292：先 getGlobalRate/getGlobalRepeats；'rate'|'all' → 每项 `rate=globalRate; useGlobalRate=false`；'repeats'|'all' → `repeats=globalRepeats; useGlobalRepeats=false`；renderPlaylist + updateStatus('已将全局配置同步到全部播放项。')。三个按钮 applyRateBtn/applyRepeatsBtn/applyAllBtn（L503–505）→ mode 'rate'/'repeats'/'all'（L1487–1489）。**注意"同步"是把当前全局值写入各项并取消跟随**。
- 无独立"播放本项"按钮——单文件播放清单恒从 startBtn 开始。

## 5. 文件库与上传
- uploadZone 拖拽：dragenter/dragover preventDefault + 加类 'dragging'；dragleave/drop preventDefault 去类（L1455–1467）；drop → addFiles(e.dataTransfer.files)（L1469–1471）。
- fileInput change（L1450–1453）：addFiles(event.target.files) 后把 `value=''`（可重复选同文件）。accept='audio/*,.mp3,.m4a,.wav,.aac,.ogg'（L452）。
- addFiles(fileList, {persistHistory=true}) L1139–1168：
  - 过滤：`file.type.startsWith('audio/') || /\.(mp3|m4a|wav|aac|ogg)$/i.test(file.name)`；一个都没有 → 警告 status 并 return。
  - **无 name+size 去重**——每次加入都 push 新 fileItem 并 push 一个新 playlistItem（自动生成对应播放项）；重复上传只会让历史键覆盖（§1.3），files/playlist 照常增加。
  - 每个文件：建 fileItem（§1.1）→ files.push → playlist.push(makePlaylistItem(fileItem.id)) → loadDurationForFile(fileItem)。
  - loadDurationForFile L1123–1137：临时 `new Audio()` preload='metadata'，src=url；loadedmetadata → duration=有限?duration:null；error → null；once 后 renderFileLibrary+renderPlaylist。
  - 收尾 renderFileLibrary()+renderPlaylist()；status '已加入 N 个音频文件，并自动生成对应播放项。'；persistHistory=true 时 saveFilesToHistoryCache(incoming).then(refreshHistoryLibrary).catch(警告)。
- renderFileLibrary L1009–1025：空→empty-state '当前还没有上传音频。'；否则每文件 `<div class="file-pill">`（strong name + span formatDuration(duration)）+ danger 按钮 `data-action="remove-file" data-file-id` '移除'；libraryMeta=`N 个音频文件`；**同时填充 newItemSource**（`<option value="">选择音频文件</option>` + fileOptionMarkup('')）——下拉是主脚本自身填的。
- removeFile(fileId) L1170–1196：从 files 摘除并 revokeObjectURL；统计 playlist 中引用该 fileId 且 `index<currentIndex` 的数量 removedBeforeCurrent；**同步过滤掉 playlist 中所有引用该文件的条目**；currentIndex>=0 且有前置移除则 `max(0, ci-removedBeforeCurrent)`；若 activeItemId 已不在 playlist → stopPlayback('当前播放项对应的文件已移除，已停止播放。')（内 render），否则 renderFileLibrary+renderPlaylist+status('已移除音频：'+name)。
- clearFilesBtn L1473–1480：revokeFileUrls() → files=[] → playlist=[] → stopPlayback('已清空音频库和播放清单。') → renderFileLibrary()+renderPlaylist()。addItemBtn L1482–1485：addPlaylistItem(newItemSource.value||'') + status('已新增一个播放项。')。

## 6. 系统增强入口（enhancer 契约，简）
- 主脚本侧最小契约：HTML 只需给一个空占位 `<div id="systemLibraryAnchor">`（L445，.layout 内首元素）+ `<audio id="audioPlayer">` + 供增强渲染复用的元素（见下）。enhancer 自己 insertAdjacentHTML('beforebegin', 面板 HTML)（enh.js L83–89）、自己注入 `<style id="system-library-enhancer-style">`（L42–81）、自己在 DOMContentLoaded 或立即 initialize（L1226–1244）。主脚本**不需要显式调用 enhancer**。
- 它依赖主脚本的**全局（顶层 function 声明 + const state/elements）**：state、elements、以及函数：`createId, makePlaylistItem, fileOptionMarkup, clampRate, clampRepeats, getEffectiveRate, getEffectiveRepeats, getFileById, escapeHtml, formatDuration, formatTime, formatCountdown, updateStatus, clearTimerArtifacts, pauseRunTimer, resumeRunTimer, getNextPlaylistIndex` 和**可被整体重赋值的 12 个函数**：`renderFileLibrary, renderPlaylist, updateButtonStates, revokeFileUrls, removeFile, validatePlaylist, playCurrentItem, advanceToNextItem, resetPlaybackState, pausePlayback, resumePlayback, stopPlayback, completePlayback`（共 13 个，overrideGlobals enh.js L1210–1224）。→ 移植时这些必须从"组件内部"提升为可替换/可注入（如 defineExpose 或 hook/plugin 通道），且所有内部相互调用都要走可替换引用而非直接函数。
- 用到的 elements 成员：audioPlayer、progressFill、currentTimeLabel、durationLabel、fileLibrary、libraryMeta、newItemSource、playlistContainer、playlistMeta、clearFilesBtn、addItemBtn、applyRate/Repeats/AllBtn、startBtn、stopBtn。
- 数据：读 `window.SYSTEM_LISTENING_AUDIO_DATA`（[{chapterId,chapterTitle,word,file,wordFile,originalFile}]，按 `'listening:'+chapterId` 分组，segment.url = `new URL('../listening-word/assets/audio/'+(wordFile||file||originalFile), location.href).href`）与 `window.SYSTEM_WORD_AUDIO_DATA`（[{id,word,chapter,group,relativePath,wordRelativePath,references[]}]，按 reference.chapter 的 `'words:'+chapterTitle` 分组，url = `new URL('../words/'+(relativePath||wordRelativePath), href)`；组内按 groupOrder/order 排序；章节标题按 /Chapter\s*(\d+)/i 排序）（enh.js L424–496）。
- 自身扩展 state：`systemLibraries{listening[],words[]}`、`systemSelection(Set)`、`sequenceRuntime{itemId,segmentIndex,inGap,gapRemainingMs,gapDeadline,gapTimeoutId}`、`systemFilters/systemSorts/systemSelectedOnly/systemLastToggled`（L32–40）。
- 导入流程 importSelectedSystemGroups（L982–998）：每个选中章节 createSequenceFileItem（`kind:'sequence'` fileItem，segments 拷贝）→ files.push + playlist.push(makePlaylistItem(fileItem.id)) → 清 selection → 渲染。间隔 select systemGapSeconds：0.5–5 步进 0.5，无 selected 时默认首项 0.5；getSystemGapSeconds 钳制同上（L298–309）。
- 播放扩展：playCurrentItemEnhanced 对 kind==='sequence' 走 playSequenceSegment（L816–854：按 segments[segmentIndex] 逐段设 src=segment.url 播放；段间 gap 用 setTimeout 倒计时并在 durationLabel 显示 formatCountdown，期间状态消息"单词 i/N 已完成，等待 X 秒"）；**它以 capture 阶段注册 'ended'/'timeupdate' 拦截器（L1159–1208）对 sequence 项 stopImmediatePropagation 屏蔽主脚本对应 handler**；片内循环语义同 §3.3：段播完且 segmentIndex<last → +1 后 gap；整项段播完且 currentLoop<repeats → 重置 runtime.segmentIndex=0、currentLoop+1 再 playCurrentItem；否则 advanceToNextItem。其 pause 需同时冻结 gap 剩余时间（L930–935）。进度=段基数+段内占比合成（L775–793）。
- **顺序依赖**：主脚本先于 enhancer 执行（L1676–1678 在 L1675 主脚本之后）；'ended'/'timeupdate' 主监听先绑、拦截器后绑（capture+stopImmediatePropagation 才能压制）。newItemSource 下拉由主脚本 renderFileLibrary 填充（L1024），enhancer 覆盖版重填同样内容（enh.js L633）。

## 7. 初始化与清理
- 顺序（L1664–1674）：renderFileLibrary() → renderHistoryLibrary() → renderPlaylist() → updateTimerLabel() → updateButtonStates() → refreshHistoryLibrary()（异步恢复历史显示）→ 注册 beforeunload。事件绑定（change/click/keydown/drag/drop/delegation/audio 监听）都在脚本体顺序注册（§3/§4/§5），audio 元素在 HTML 中已存在（L545）。
- 默认状态：files/historyFiles/playlist 空、currentIndex=-1、currentLoop=0、双标志 F、定时器各 id null、activeItemId null；audio 无 src；音量=1。
- beforeunload（L1671–1674）：clearTimerArtifacts() + revokeFileUrls()。enhancer 场景下该两个函数被覆盖版（跳过 sequence url）替换，端口需同样整体替换。
- 启动后各 render 函数即可被 enhancer 整体替换并立即以增强版输出。

## 8. 持久化总结
- **无 localStorage/sessionStorage（任何键）**（全文件 grep 无命中）。
- 唯一持久层：IndexedDB `audio_playlist_history_db` / store `history_files`（§1.3）。文件、播放清单、全局配置、timer、volume、mode 全部仅内存，刷新即失；历史缓存只存"上传过的原始音频 Blob + 元数据"。enhancer 的系统数据来自外部静态 JS（随页面加载，不进 IDB）。

## 附：移植到 Vue3 SFC 的关键注意点（供照做）
1. playlistItem 是"数字值 + useGlobal* 开关"，不是 null 继承——`getEffectiveRate/Repeats` 两个函数要在 reactive 计算里等价实现，且全局值变化要能触发条目 label 更新（原实现靠 renderPlaylist 全量重渲）。
2. playCurrentItem 的 restart/src 判断、ended→同条目 currentLoop+1 vs advance、resume 用 restart:false 保进度，三点必须原样保留；audio 的 ended/timeupdate/loadedmetadata 用同一个 <audio> ref 绑定。
3. 渲染用 id 前缀 file-/rate-/repeat- 依赖 `item.id`（内含随机串），模板 ref 或 data-attr 均可用；焦点问题靠"number input 的 input 事件不重渲、change 才重渲"规避。
4. enhancer 需要 13 个可替换渲染/播放入口 + 顶层共享 state/elements 形状 + capture 期 audio 拦截 + anchor；单组件方案需暴露命令式接口（如 expose({renderPlaylist,…}) 或注册表）并保证 enhancer 后加载、替换引用而非函数体内直接调用。
5. URL 生命周期：createObjectURL 后必须在 removeFile/clearFiles/unmount/beforeunload 成对 revoke；system 条目无 url，不可 revoke。
6. 历史 Blob 依赖 File 可入 IDB；还原用 new File([blob], name, {type 兜底 audio/mpeg})。
7. 主脚本无 audio 'error' 处理与坏文件跳过循环；play() reject 仅 pause + console.warn（enhancer 版会发中文警告状态）。[未知] 其余行为均以本报告为准。
