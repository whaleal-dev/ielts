(function () {
    function systemElements() {
        return {
            systemGapSeconds: document.getElementById('systemGapSeconds'),
            importSelectedBtn: document.getElementById('importSelectedBtn'),
            clearSystemSelectionBtn: document.getElementById('clearSystemSelectionBtn'),
            systemDataStatus: document.getElementById('systemDataStatus'),
            systemSelectionSummary: document.getElementById('systemSelectionSummary'),
            systemSelectionChips: document.getElementById('systemSelectionChips'),
            listeningSystemList: document.getElementById('listeningSystemList'),
            wordsSystemList: document.getElementById('wordsSystemList'),
            listeningLibraryMeta: document.getElementById('listeningLibraryMeta'),
            wordsLibraryMeta: document.getElementById('wordsLibraryMeta'),
            listeningSearchInput: document.getElementById('listeningSearchInput'),
            wordsSearchInput: document.getElementById('wordsSearchInput'),
            listeningSelectAllBtn: document.getElementById('listeningSelectAllBtn'),
            wordsSelectAllBtn: document.getElementById('wordsSelectAllBtn'),
            listeningInvertBtn: document.getElementById('listeningInvertBtn'),
            wordsInvertBtn: document.getElementById('wordsInvertBtn'),
            listeningClearBtn: document.getElementById('listeningClearBtn'),
            wordsClearBtn: document.getElementById('wordsClearBtn'),
            listeningSortSelect: document.getElementById('listeningSortSelect'),
            wordsSortSelect: document.getElementById('wordsSortSelect'),
            listeningSelectedOnly: document.getElementById('listeningSelectedOnly'),
            wordsSelectedOnly: document.getElementById('wordsSelectedOnly'),
            listeningPresetChapterBtn: document.getElementById('listeningPresetChapterBtn'),
            listeningPresetTestPaperBtn: document.getElementById('listeningPresetTestPaperBtn'),
            wordsPresetChapterBtn: document.getElementById('wordsPresetChapterBtn')
        };
    }

    function ensureStateExtensions() {
        state.systemLibraries = state.systemLibraries || { listening: [], words: [] };
        state.systemSelection = state.systemSelection || new Set();
        state.sequenceRuntime = state.sequenceRuntime || null;
        state.systemFilters = state.systemFilters || { listening: '', words: '' };
        state.systemSorts = state.systemSorts || { listening: 'chapter', words: 'chapter' };
        state.systemSelectedOnly = state.systemSelectedOnly || { listening: false, words: false };
        state.systemLastToggled = state.systemLastToggled || { listening: '', words: '' };
    }

    function ensureStyles() {
        if (document.getElementById('system-library-enhancer-style')) {
            return;
        }
        var style = document.createElement('style');
        style.id = 'system-library-enhancer-style';
        style.textContent = [
            '.system-toolbar{justify-content:space-between;align-items:center;gap:10px;}',
            '.system-topline{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;}',
            '.system-selection-bar{margin-top:12px;padding:12px 14px;border-radius:14px;border:1px solid rgba(17,24,39,.08);background:linear-gradient(180deg,rgba(255,255,255,.94),rgba(247,250,255,.9));}',
            '.system-selection-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}',
            '.system-selection-chip{display:inline-flex;align-items:center;gap:8px;padding:5px 10px;border-radius:999px;background:rgba(10,132,255,.12);border:1px solid rgba(10,132,255,.2);color:#0b63bf;font-size:.78rem;font-weight:600;}',
            '.system-selection-chip button{appearance:none;border:none;background:transparent;cursor:pointer;color:inherit;font-size:1rem;line-height:1;padding:0 0 2px;}',
            '.system-library-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:16px;}',
            '.system-library-block{border:1px solid rgba(17,24,39,.08);border-radius:18px;background:rgba(255,255,255,.78);padding:16px;display:grid;gap:12px;box-shadow:0 10px 22px rgba(15,23,42,.06);}',
            '.system-library-head{display:flex;justify-content:space-between;gap:12px;align-items:center;}',
            '.system-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}',
            '.system-tools .ghost-btn,.system-tools .secondary-btn{padding:8px 14px;font-size:.82rem;}',
            '.system-tools .system-subtle{padding:8px 12px;border-radius:999px;border:1px solid rgba(17,24,39,.12);background:rgba(255,255,255,.82);font-size:.8rem;color:var(--muted);cursor:pointer;}',
            '.system-tools .system-subtle.active{background:rgba(10,132,255,.12);border-color:rgba(10,132,255,.3);color:#0b63bf;}',
            '.system-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;}',
            '.system-controls select{width:auto;min-width:150px;padding:9px 11px;border-radius:12px;}',
            '.system-search{width:100%;border:1px solid rgba(17,24,39,.12);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.95);}',
            '.system-search:focus{outline:none;border-color:rgba(10,132,255,.56);box-shadow:0 0 0 3px rgba(10,132,255,.14);}',
            '.system-preset-row{display:flex;gap:8px;flex-wrap:wrap;}',
            '.system-preset{padding:6px 10px;border-radius:999px;border:1px solid rgba(17,24,39,.12);background:rgba(255,255,255,.84);font-size:.78rem;cursor:pointer;color:var(--muted);}',
            '.system-preset:hover{border-color:rgba(10,132,255,.4);color:#0b63bf;}',
            '.system-list{display:grid;gap:10px;max-height:360px;overflow:auto;padding-right:2px;}',
            '.system-card{border:1px solid rgba(17,24,39,.08);border-radius:12px;padding:12px 14px;background:rgba(255,255,255,.9);transition:.2s ease;}',
            '.system-card.selected{border-color:rgba(10,132,255,.46);box-shadow:0 10px 18px rgba(10,132,255,.14);background:rgba(245,250,255,.95);}',
            '.system-card label{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:start;cursor:pointer;}',
            '.system-card input[type="checkbox"]{width:18px;height:18px;margin-top:2px;accent-color:var(--accent);}',
            '.system-card strong{display:block;font-size:.95rem;line-height:1.45;}',
            '.system-card span{display:block;color:var(--muted);font-size:.82rem;line-height:1.55;margin-top:4px;}',
            '.system-chip{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;background:rgba(10,132,255,.12);color:#0b63bf;font-size:.75rem;font-weight:600;margin-top:6px;font-style:normal;}',
            '.system-summary{margin-top:14px;color:var(--muted);line-height:1.6;}',
            '@media (max-width:760px){.system-library-grid{grid-template-columns:1fr;}.system-controls{grid-template-columns:1fr;}}'
        ].join('');
        document.head.appendChild(style);
    }

    function insertPanel() {
        if (document.getElementById('systemGapSeconds')) {
            return;
        }
        var panelAnchor = document.getElementById('systemLibraryAnchor');
        if (panelAnchor) {
            panelAnchor.insertAdjacentHTML('beforebegin', '' +
                '<section class="panel" id="systemLibraryPanel">' +
                    '<div class="system-topline">' +
                        '<div>' +
                            '<h2>系统章节导入</h2>' +
                            '<p class="panel-subtext">可直接勾选听力语料库或雅思真经单词章节导入。每个章节会生成一个组合播放项，章节内单词间隔支持 0.5-5 秒（步进 0.5）。</p>' +
                        '</div>' +
                        '<span class="tiny" id="systemDataStatus">系统音频库加载中...</span>' +
                    '</div>' +
                    '<div class="field-grid">' +
                        '<div class="field">' +
                            '<label for="systemGapSeconds">章节内单词间隔</label>' +
                            '<select id="systemGapSeconds">' +
                                '<option value="0.5">0.5 秒</option>' +
                                '<option value="1">1.0 秒</option>' +
                                '<option value="1.5">1.5 秒</option>' +
                                '<option value="2">2.0 秒</option>' +
                                '<option value="2.5">2.5 秒</option>' +
                                '<option value="3">3.0 秒</option>' +
                                '<option value="3.5">3.5 秒</option>' +
                                '<option value="4">4.0 秒</option>' +
                                '<option value="4.5">4.5 秒</option>' +
                                '<option value="5">5.0 秒</option>' +
                            '</select>' +
                        '</div>' +
                    '</div>' +
                    '<div class="toolbar system-toolbar">' +
                        '<div class="button-row">' +
                            '<button class="primary-btn" id="importSelectedBtn" type="button">导入选中章节</button>' +
                            '<button class="ghost-btn" id="clearSystemSelectionBtn" type="button">清空选择</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="system-selection-bar">' +
                        '<p class="system-summary tiny" id="systemSelectionSummary">当前未选择任何章节。</p>' +
                        '<div class="system-selection-chips" id="systemSelectionChips"></div>' +
                    '</div>' +
                    '<div class="system-library-grid">' +
                        '<section class="system-library-block">' +
                            '<div class="system-library-head">' +
                                '<div>' +
                                    '<h2>听力语料库</h2>' +
                                    '<p class="panel-subtext" style="margin:4px 0 0;">按章节/Test Paper 选择。</p>' +
                                '</div>' +
                                '<span class="tiny" id="listeningLibraryMeta">0 个章节</span>' +
                            '</div>' +
                            '<div class="system-preset-row">' +
                                '<button class="system-preset" id="listeningPresetChapterBtn" type="button">常用词：Chapter</button>' +
                                '<button class="system-preset" id="listeningPresetTestPaperBtn" type="button">常用词：Test Paper</button>' +
                            '</div>' +
                            '<input id="listeningSearchInput" class="system-search" type="text" placeholder="搜索章节（例如 Chapter 5 或 Test Paper 9）">' +
                            '<div class="system-controls">' +
                                '<div class="system-tools">' +
                                    '<button class="secondary-btn" id="listeningSelectAllBtn" type="button">全选可见</button>' +
                                    '<button class="ghost-btn" id="listeningInvertBtn" type="button">反选可见</button>' +
                                    '<button class="ghost-btn" id="listeningClearBtn" type="button">清空当前库</button>' +
                                    '<button class="system-subtle" id="listeningSelectedOnly" type="button">仅看已选</button>' +
                                '</div>' +
                                '<select id="listeningSortSelect">' +
                                    '<option value="chapter">按章节号</option>' +
                                    '<option value="count-desc">按单词数降序</option>' +
                                    '<option value="title">按标题</option>' +
                                '</select>' +
                            '</div>' +
                            '<div class="system-list" id="listeningSystemList"></div>' +
                        '</section>' +
                        '<section class="system-library-block">' +
                            '<div class="system-library-head">' +
                                '<div>' +
                                    '<h2>雅思真经单词</h2>' +
                                    '<p class="panel-subtext" style="margin:4px 0 0;">按章节选择，例如 Chapter 1 自然地理。</p>' +
                                '</div>' +
                                '<span class="tiny" id="wordsLibraryMeta">0 个章节</span>' +
                            '</div>' +
                            '<div class="system-preset-row">' +
                                '<button class="system-preset" id="wordsPresetChapterBtn" type="button">常用词：Chapter</button>' +
                            '</div>' +
                            '<input id="wordsSearchInput" class="system-search" type="text" placeholder="搜索章节（例如 Chapter 1）">' +
                            '<div class="system-controls">' +
                                '<div class="system-tools">' +
                                    '<button class="secondary-btn" id="wordsSelectAllBtn" type="button">全选可见</button>' +
                                    '<button class="ghost-btn" id="wordsInvertBtn" type="button">反选可见</button>' +
                                    '<button class="ghost-btn" id="wordsClearBtn" type="button">清空当前库</button>' +
                                    '<button class="system-subtle" id="wordsSelectedOnly" type="button">仅看已选</button>' +
                                '</div>' +
                                '<select id="wordsSortSelect">' +
                                    '<option value="chapter">按章节号</option>' +
                                    '<option value="count-desc">按单词数降序</option>' +
                                    '<option value="title">按标题</option>' +
                                '</select>' +
                            '</div>' +
                            '<div class="system-list" id="wordsSystemList"></div>' +
                        '</section>' +
                    '</div>' +
                '</section>');
            var gapSelectFromAnchor = document.getElementById('systemGapSeconds');
            if (gapSelectFromAnchor) {
                gapSelectFromAnchor.value = '1.5';
            }
            panelAnchor.remove();
            return;
        }
        var fileLibrary = document.getElementById('fileLibrary');
        if (!fileLibrary) {
            return;
        }
        var uploadPanel = fileLibrary.closest('.panel');
        if (!uploadPanel) {
            return;
        }
        uploadPanel.insertAdjacentHTML('afterend', '' +
            '<section class="panel" id="systemLibraryPanel">' +
                '<div class="system-topline">' +
                    '<div>' +
                        '<h2>系统章节导入</h2>' +
                        '<p class="panel-subtext">可直接勾选听力语料库或雅思真经单词章节导入。每个章节会生成一个组合播放项，章节内单词间隔支持 0.5-5 秒（步进 0.5）。</p>' +
                    '</div>' +
                    '<span class="tiny" id="systemDataStatus">系统音频库加载中...</span>' +
                '</div>' +
                '<div class="field-grid">' +
                    '<div class="field">' +
                        '<label for="systemGapSeconds">章节内单词间隔</label>' +
                        '<select id="systemGapSeconds">' +
                            '<option value="0.5">0.5 秒</option>' +
                            '<option value="1">1.0 秒</option>' +
                            '<option value="1.5">1.5 秒</option>' +
                            '<option value="2">2.0 秒</option>' +
                            '<option value="2.5">2.5 秒</option>' +
                            '<option value="3">3.0 秒</option>' +
                            '<option value="3.5">3.5 秒</option>' +
                            '<option value="4">4.0 秒</option>' +
                            '<option value="4.5">4.5 秒</option>' +
                            '<option value="5">5.0 秒</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<div class="toolbar system-toolbar">' +
                    '<div class="button-row">' +
                        '<button class="primary-btn" id="importSelectedBtn" type="button">导入选中章节</button>' +
                        '<button class="ghost-btn" id="clearSystemSelectionBtn" type="button">清空选择</button>' +
                    '</div>' +
                '</div>' +
                '<div class="system-selection-bar">' +
                    '<p class="system-summary tiny" id="systemSelectionSummary">当前未选择任何章节。</p>' +
                    '<div class="system-selection-chips" id="systemSelectionChips"></div>' +
                '</div>' +
                '<div class="system-library-grid">' +
                    '<section class="system-library-block">' +
                        '<div class="system-library-head">' +
                            '<div>' +
                                '<h2>听力语料库</h2>' +
                                '<p class="panel-subtext" style="margin:4px 0 0;">按章节/Test Paper 选择。</p>' +
                            '</div>' +
                            '<span class="tiny" id="listeningLibraryMeta">0 个章节</span>' +
                        '</div>' +
                        '<div class="system-preset-row">' +
                            '<button class="system-preset" id="listeningPresetChapterBtn" type="button">常用词：Chapter</button>' +
                            '<button class="system-preset" id="listeningPresetTestPaperBtn" type="button">常用词：Test Paper</button>' +
                        '</div>' +
                        '<input id="listeningSearchInput" class="system-search" type="text" placeholder="搜索章节（例如 Chapter 5 或 Test Paper 9）">' +
                        '<div class="system-controls">' +
                            '<div class="system-tools">' +
                                '<button class="secondary-btn" id="listeningSelectAllBtn" type="button">全选可见</button>' +
                                '<button class="ghost-btn" id="listeningInvertBtn" type="button">反选可见</button>' +
                                '<button class="ghost-btn" id="listeningClearBtn" type="button">清空当前库</button>' +
                                '<button class="system-subtle" id="listeningSelectedOnly" type="button">仅看已选</button>' +
                            '</div>' +
                            '<select id="listeningSortSelect">' +
                                '<option value="chapter">按章节号</option>' +
                                '<option value="count-desc">按单词数降序</option>' +
                                '<option value="title">按标题</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="system-list" id="listeningSystemList"></div>' +
                    '</section>' +
                    '<section class="system-library-block">' +
                        '<div class="system-library-head">' +
                            '<div>' +
                                '<h2>雅思真经单词</h2>' +
                                '<p class="panel-subtext" style="margin:4px 0 0;">按章节选择，例如 Chapter 1 自然地理。</p>' +
                            '</div>' +
                            '<span class="tiny" id="wordsLibraryMeta">0 个章节</span>' +
                        '</div>' +
                        '<div class="system-preset-row">' +
                            '<button class="system-preset" id="wordsPresetChapterBtn" type="button">常用词：Chapter</button>' +
                        '</div>' +
                        '<input id="wordsSearchInput" class="system-search" type="text" placeholder="搜索章节（例如 Chapter 1）">' +
                        '<div class="system-controls">' +
                            '<div class="system-tools">' +
                                '<button class="secondary-btn" id="wordsSelectAllBtn" type="button">全选可见</button>' +
                                '<button class="ghost-btn" id="wordsInvertBtn" type="button">反选可见</button>' +
                                '<button class="ghost-btn" id="wordsClearBtn" type="button">清空当前库</button>' +
                                '<button class="system-subtle" id="wordsSelectedOnly" type="button">仅看已选</button>' +
                            '</div>' +
                            '<select id="wordsSortSelect">' +
                                '<option value="chapter">按章节号</option>' +
                                '<option value="count-desc">按单词数降序</option>' +
                                '<option value="title">按标题</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="system-list" id="wordsSystemList"></div>' +
                    '</section>' +
                '</div>' +
            '</section>');
        var gapSelectFallback = document.getElementById('systemGapSeconds');
        if (gapSelectFallback) {
            gapSelectFallback.value = '1.5';
        }
    }

    function getSystemGapSeconds() {
        var system = systemElements();
        var raw = Number(system.systemGapSeconds && system.systemGapSeconds.value);
        if (!Number.isFinite(raw)) {
            return 1;
        }
        var min = 0.5;
        var max = 5;
        var step = 0.5;
        var rounded = Math.round((raw - min) / step) * step + min;
        return Math.min(max, Math.max(min, Number(rounded.toFixed(1))));
    }

    function getFilteredGroups(libraryType) {
        var groups = libraryType === 'listening' ? state.systemLibraries.listening : state.systemLibraries.words;
        var keyword = (state.systemFilters[libraryType] || '').trim().toLowerCase();
        var filtered = groups;
        if (keyword) {
            filtered = filtered.filter(function (group) {
                return String(group.title || '').toLowerCase().indexOf(keyword) !== -1;
            });
        }
        if (state.systemSelectedOnly[libraryType]) {
            filtered = filtered.filter(function (group) {
                return state.systemSelection.has(group.id);
            });
        }
        var sortMode = state.systemSorts[libraryType] || 'chapter';
        var sorted = filtered.slice();
        if (sortMode === 'count-desc') {
            sorted.sort(function (left, right) {
                return right.itemCount - left.itemCount;
            });
        } else if (sortMode === 'title') {
            sorted.sort(function (left, right) {
                return String(left.title).localeCompare(String(right.title), 'zh-CN');
            });
        } else {
            sorted.sort(function (left, right) {
                return extractChapterNumber(left.title) - extractChapterNumber(right.title);
            });
        }
        return sorted;
    }

    function applyQuickKeyword(libraryType, keyword) {
        var system = systemElements();
        state.systemFilters[libraryType] = keyword;
        if (libraryType === 'listening' && system.listeningSearchInput) {
            system.listeningSearchInput.value = keyword;
        }
        if (libraryType === 'words' && system.wordsSearchInput) {
            system.wordsSearchInput.value = keyword;
        }
        renderSystemLibraries();
    }

    function toggleVisibleSelection(libraryType) {
        getFilteredGroups(libraryType).forEach(function (group) {
            if (state.systemSelection.has(group.id)) {
                state.systemSelection.delete(group.id);
            } else {
                state.systemSelection.add(group.id);
            }
        });
        renderSystemLibraries();
    }

    function applyRangeSelection(libraryType, startGroupId, endGroupId, checked) {
        var visible = getFilteredGroups(libraryType);
        var startIndex = visible.findIndex(function (group) { return group.id === startGroupId; });
        var endIndex = visible.findIndex(function (group) { return group.id === endGroupId; });
        if (startIndex === -1 || endIndex === -1) {
            return;
        }
        var from = Math.min(startIndex, endIndex);
        var to = Math.max(startIndex, endIndex);
        visible.slice(from, to + 1).forEach(function (group) {
            if (checked) {
                state.systemSelection.add(group.id);
            } else {
                state.systemSelection.delete(group.id);
            }
        });
    }

    function parseChineseNumber(value) {
        var mapping = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
        if (!value) {
            return 0;
        }
        if (mapping[value]) {
            return mapping[value];
        }
        if (value === '十一') {
            return 11;
        }
        if (value === '十二') {
            return 12;
        }
        return String(value).split('').reduce(function (total, char) {
            return total + (mapping[char] || 0);
        }, 0);
    }

    function extractChapterNumber(text) {
        var match = String(text || '').match(/Chapter\s*(\d+)/i);
        return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
    }

    function extractGroupOrder(text) {
        var match = String(text || '').match(/第([一二三四五六七八九十]+)组/);
        return match ? parseChineseNumber(match[1]) : Number.MAX_SAFE_INTEGER;
    }

    function isSequenceItem(fileItem) {
        return Boolean(fileItem && fileItem.kind === 'sequence');
    }

    function clearSequenceRuntime() {
        if (state.sequenceRuntime && state.sequenceRuntime.gapTimeoutId) {
            clearTimeout(state.sequenceRuntime.gapTimeoutId);
        }
        state.sequenceRuntime = null;
    }

    function buildSystemLibraries() {
        var listeningData = Array.isArray(window.SYSTEM_LISTENING_AUDIO_DATA) ? window.SYSTEM_LISTENING_AUDIO_DATA : [];
        var listeningMap = new Map();
        listeningData.forEach(function (entry) {
            var key = 'listening:' + entry.chapterId;
            if (!listeningMap.has(key)) {
                listeningMap.set(key, {
                    id: key,
                    libraryType: 'listening',
                    title: entry.chapterTitle,
                    itemCount: 0,
                    segments: []
                });
            }
            var group = listeningMap.get(key);
            group.itemCount += 1;
            group.segments.push({
                label: entry.word,
                url: new URL('../listening-word/assets/audio/' + (entry.wordFile || entry.file || entry.originalFile), window.location.href).href
            });
        });

        var wordData = Array.isArray(window.SYSTEM_WORD_AUDIO_DATA) ? window.SYSTEM_WORD_AUDIO_DATA : [];
        var wordMap = new Map();
        wordData.forEach(function (entry) {
            var references = Array.isArray(entry.references) && entry.references.length ? entry.references : [{
                chapter: entry.chapter,
                group: entry.group,
                index: 0,
                word: entry.word
            }];
            references.forEach(function (reference) {
                var chapterTitle = reference.chapter || entry.chapter;
                if (!chapterTitle) {
                    return;
                }
                var key = 'words:' + chapterTitle;
                if (!wordMap.has(key)) {
                    wordMap.set(key, {
                        id: key,
                        libraryType: 'words',
                        title: chapterTitle,
                        itemCount: 0,
                        segments: []
                    });
                }
                var group = wordMap.get(key);
                group.itemCount += 1;
                group.segments.push({
                    label: reference.word || entry.word,
                    group: reference.group || entry.group,
                    groupOrder: extractGroupOrder(reference.group || entry.group),
                    order: Number(reference.index) || 0,
                    url: new URL('../words/' + (entry.relativePath || entry.wordRelativePath), window.location.href).href
                });
            });
        });

        state.systemLibraries.listening = Array.from(listeningMap.values()).sort(function (left, right) {
            return extractChapterNumber(left.title) - extractChapterNumber(right.title);
        });
        state.systemLibraries.words = Array.from(wordMap.values()).map(function (group) {
            group.segments.sort(function (left, right) {
                if (left.groupOrder !== right.groupOrder) {
                    return left.groupOrder - right.groupOrder;
                }
                return left.order - right.order;
            });
            return group;
        }).sort(function (left, right) {
            return extractChapterNumber(left.title) - extractChapterNumber(right.title);
        });
    }

    function getSystemGroupById(groupId) {
        return state.systemLibraries.listening.concat(state.systemLibraries.words).find(function (entry) {
            return entry.id === groupId;
        }) || null;
    }

    function describeFileTiming(fileItem) {
        if (!fileItem) {
            return '时长待加载';
        }
        if (isSequenceItem(fileItem)) {
            return fileItem.segments.length + ' 个单词音频，间隔 ' + fileItem.gapSeconds + ' 秒';
        }
        return formatDuration(fileItem.duration);
    }

    function describeFileSource(fileItem) {
        if (!fileItem) {
            return '--';
        }
        if (isSequenceItem(fileItem)) {
            return fileItem.libraryLabel + ' / ' + fileItem.segments.length + ' 段 / 间隔 ' + fileItem.gapSeconds + ' 秒';
        }
        return '本地上传 / ' + fileItem.name.split('.').pop().toUpperCase();
    }

    function renderSystemList(container, groups, libraryType) {
        if (!container) {
            return;
        }
        if (!groups.length) {
            container.innerHTML = '<div class="empty-state">系统数据不可用。</div>';
            return;
        }
        var filtered = getFilteredGroups(libraryType);
        if (!filtered.length) {
            container.innerHTML = '<div class="empty-state">没有匹配章节，请调整搜索关键词。</div>';
            return;
        }
        container.innerHTML = filtered.map(function (group) {
            var selected = state.systemSelection.has(group.id);
            var libraryLabel = libraryType === 'listening' ? '听力库' : '真经词库';
            var groupIdAttr = escapeHtml(group.id);
            return '<article class="system-card' + (selected ? ' selected' : '') + '">' +
                '<label>' +
                '<input type="checkbox" data-group-id="' + groupIdAttr + '"' + (selected ? ' checked' : '') + '>' +
                '<div>' +
                '<strong>' + escapeHtml(group.title) + '</strong>' +
                '<span>' + group.itemCount + ' 个单词音频，导入后作为 1 个播放项。</span>' +
                '<em class="system-chip">' + libraryLabel + '</em>' +
                '</div>' +
                '</label>' +
                '</article>';
        }).join('');
    }

    function renderSystemLibraries() {
        var system = systemElements();
        renderSystemList(system.listeningSystemList, state.systemLibraries.listening, 'listening');
        renderSystemList(system.wordsSystemList, state.systemLibraries.words, 'words');
        if (system.listeningSelectedOnly) {
            system.listeningSelectedOnly.classList.toggle('active', state.systemSelectedOnly.listening);
        }
        if (system.wordsSelectedOnly) {
            system.wordsSelectedOnly.classList.toggle('active', state.systemSelectedOnly.words);
        }
        if (system.listeningSortSelect) {
            system.listeningSortSelect.value = state.systemSorts.listening;
        }
        if (system.wordsSortSelect) {
            system.wordsSortSelect.value = state.systemSorts.words;
        }
        if (system.listeningLibraryMeta) {
            var listeningTotal = state.systemLibraries.listening.length;
            var listeningFiltered = getFilteredGroups('listening').length;
            var listeningSelected = state.systemLibraries.listening.filter(function (group) {
                return state.systemSelection.has(group.id);
            }).length;
            system.listeningLibraryMeta.textContent = listeningFiltered + ' / ' + listeningTotal + ' 个章节，已选 ' + listeningSelected;
        }
        if (system.wordsLibraryMeta) {
            var wordsTotal = state.systemLibraries.words.length;
            var wordsFiltered = getFilteredGroups('words').length;
            var wordsSelected = state.systemLibraries.words.filter(function (group) {
                return state.systemSelection.has(group.id);
            }).length;
            system.wordsLibraryMeta.textContent = wordsFiltered + ' / ' + wordsTotal + ' 个章节，已选 ' + wordsSelected;
        }
        var selectedGroups = Array.from(state.systemSelection).map(getSystemGroupById).filter(Boolean);
        if (system.systemSelectionSummary) {
            var selectedTitles = selectedGroups.map(function (group) { return group.title; });
            var visibleTitles = selectedTitles.slice(0, 6);
            system.systemSelectionSummary.textContent = selectedGroups.length
                ? '已选择 ' + selectedGroups.length + ' 个章节：' + visibleTitles.join('；') + (selectedTitles.length > visibleTitles.length ? '；...' : '')
                : '当前未选择任何章节。';
        }
        if (system.systemSelectionChips) {
            if (!selectedGroups.length) {
                system.systemSelectionChips.innerHTML = '';
            } else {
                system.systemSelectionChips.innerHTML = selectedGroups.map(function (group) {
                    return '<span class="system-selection-chip">'
                        + escapeHtml(group.title)
                        + '<button type="button" data-remove-selected="' + escapeHtml(group.id) + '" aria-label="移除 ' + escapeHtml(group.title) + '">×</button>'
                        + '</span>';
                }).join('');
            }
        }
        if (system.importSelectedBtn) {
            system.importSelectedBtn.disabled = !state.systemSelection.size;
        }
        if (system.clearSystemSelectionBtn) {
            system.clearSystemSelectionBtn.disabled = !state.systemSelection.size;
        }
        if (system.systemDataStatus) {
            var totalGroups = state.systemLibraries.listening.length + state.systemLibraries.words.length;
            system.systemDataStatus.textContent = totalGroups ? '系统音频库已就绪' : '系统音频库不可用';
        }
    }

    function renderFileLibraryEnhanced() {
        if (!state.files.length) {
            elements.fileLibrary.innerHTML = '<div class="empty-state">当前还没有上传音频。</div>';
        } else {
            elements.fileLibrary.innerHTML = state.files.map(function (fileItem) {
                return '<div class="file-pill">' +
                    '<div>' +
                    '<strong>' + escapeHtml(fileItem.name) + '</strong>' +
                    '<span>' + describeFileTiming(fileItem) + '</span>' +
                    '</div>' +
                    '<button class="danger-btn" type="button" data-action="remove-file" data-file-id="' + fileItem.id + '">移除</button>' +
                    '</div>';
            }).join('');
        }
        elements.libraryMeta.textContent = state.files.length + ' 个音频文件';
        elements.newItemSource.innerHTML = '<option value="">选择音频文件</option>' + fileOptionMarkup('');
    }

    function renderPlaylistEnhanced() {
        if (!state.playlist.length) {
            elements.playlistContainer.innerHTML = '<div class="empty-state">播放清单为空。先上传音频，或者从左侧“快速新增条目”手动添加。</div>';
        } else {
            elements.playlistContainer.innerHTML = state.playlist.map(function (item, index) {
                var fileItem = getFileById(item.fileId);
                var rateValue = clampRate(item.rate).toFixed(2);
                var repeatValue = String(clampRepeats(item.repeats));
                var effectiveRate = getEffectiveRate(item).toFixed(2);
                var effectiveRepeats = String(getEffectiveRepeats(item));
                var activeClass = item.id === state.activeItemId ? ' queue-item active' : ' queue-item';
                var repeatSummary = fileItem && !isSequenceItem(fileItem)
                    ? formatDuration((fileItem.duration || 0) * getEffectiveRepeats(item))
                    : (fileItem ? (fileItem.segments.length * getEffectiveRepeats(item)) + ' 段' : '--');
                return '<article class="' + activeClass + '">' +
                    '<div class="item-head">' +
                    '<div style="display:flex; gap:14px; align-items:center; flex:1 1 420px;">' +
                    '<div class="item-index">' + (index + 1) + '</div>' +
                    '<div>' +
                    '<strong>' + escapeHtml(fileItem ? fileItem.name : '未选择音频') + '</strong>' +
                    '<span class="muted">' + (fileItem ? describeFileTiming(fileItem) : '请为这个条目选择一个已上传的音频') + '</span>' +
                    '</div>' +
                    '</div>' +
                    '<div class="item-actions">' +
                    '<button class="ghost-btn" type="button" data-action="move-up" data-item-id="' + item.id + '">上移</button>' +
                    '<button class="ghost-btn" type="button" data-action="move-down" data-item-id="' + item.id + '">下移</button>' +
                    '<button class="secondary-btn" type="button" data-action="duplicate" data-item-id="' + item.id + '">复制</button>' +
                    '<button class="danger-btn" type="button" data-action="remove-item" data-item-id="' + item.id + '">删除</button>' +
                    '</div>' +
                    '</div>' +
                    '<div class="field-grid">' +
                    '<div class="field">' +
                    '<label for="file-' + item.id + '">音频文件</label>' +
                    '<select id="file-' + item.id + '" data-field="fileId" data-item-id="' + item.id + '">' +
                    fileOptionMarkup(item.fileId) +
                    '</select>' +
                    '</div>' +
                    '<div class="field">' +
                    '<label for="rate-' + item.id + '">自定义倍速</label>' +
                    '<input id="rate-' + item.id + '" type="number" min="0.6" max="2" step="0.2" data-field="rate" data-item-id="' + item.id + '" value="' + rateValue + '"' + (item.useGlobalRate ? ' disabled' : '') + '>' +
                    '<label class="checkbox-line"><input type="checkbox" data-field="useGlobalRate" data-item-id="' + item.id + '"' + (item.useGlobalRate ? ' checked' : '') + '>跟随全局倍速（当前 ' + effectiveRate + 'x）</label>' +
                    '</div>' +
                    '<div class="field">' +
                    '<label for="repeat-' + item.id + '">自定义次数</label>' +
                    '<input id="repeat-' + item.id + '" type="number" min="1" max="10" step="1" data-field="repeats" data-item-id="' + item.id + '" value="' + repeatValue + '"' + (item.useGlobalRepeats ? ' disabled' : '') + '>' +
                    '<label class="checkbox-line"><input type="checkbox" data-field="useGlobalRepeats" data-item-id="' + item.id + '"' + (item.useGlobalRepeats ? ' checked' : '') + '>跟随全局次数（当前 ' + effectiveRepeats + ' 遍）</label>' +
                    '</div>' +
                    '<div class="item-meta">' +
                    '<div class="meta-chip"><span>实际倍速</span><strong>' + effectiveRate + 'x</strong></div>' +
                    '<div class="meta-chip"><span>实际次数</span><strong>' + effectiveRepeats + ' 遍</strong></div>' +
                    '<div class="meta-chip"><span>累计播放</span><strong>' + repeatSummary + '</strong></div>' +
                    '<div class="meta-chip"><span>音频来源</span><strong>' + escapeHtml(describeFileSource(fileItem)) + '</strong></div>' +
                    '</div>' +
                    '</div>' +
                    '</article>';
            }).join('');
        }
        elements.playlistMeta.textContent = state.playlist.length + ' 个播放项';
        updateButtonStates();
    }

    function updateButtonStatesEnhanced() {
        var hasFiles = state.files.length > 0;
        var hasPlaylist = state.playlist.length > 0;
        elements.clearFilesBtn.disabled = !hasFiles;
        elements.addItemBtn.disabled = !hasFiles;
        elements.applyRateBtn.disabled = !hasPlaylist;
        elements.applyRepeatsBtn.disabled = !hasPlaylist;
        elements.applyAllBtn.disabled = !hasPlaylist;
        elements.startBtn.disabled = !hasPlaylist;
        elements.stopBtn.disabled = !state.isPlaying && !state.isPaused;
        renderSystemLibraries();
    }

    function revokeFileUrlsEnhanced() {
        state.files.forEach(function (fileItem) {
            if (!isSequenceItem(fileItem) && fileItem.url) {
                URL.revokeObjectURL(fileItem.url);
            }
        });
    }

    function removeFileEnhanced(fileId) {
        var index = state.files.findIndex(function (fileItem) {
            return fileItem.id === fileId;
        });
        if (index === -1) {
            return;
        }
        var removed = state.files.splice(index, 1)[0];
        if (!isSequenceItem(removed) && removed.url) {
            URL.revokeObjectURL(removed.url);
        }
        var removedBeforeCurrent = state.playlist.reduce(function (count, item, playlistIndex) {
            if (item.fileId !== fileId) {
                return count;
            }
            return playlistIndex < state.currentIndex ? count + 1 : count;
        }, 0);
        state.playlist = state.playlist.filter(function (item) {
            return item.fileId !== fileId;
        });
        if (state.currentIndex >= 0 && removedBeforeCurrent > 0) {
            state.currentIndex = Math.max(0, state.currentIndex - removedBeforeCurrent);
        }
        if (state.activeItemId && !state.playlist.some(function (item) { return item.id === state.activeItemId; })) {
            stopPlayback('当前播放项对应的文件已移除，已停止播放。');
            renderFileLibrary();
            renderPlaylist();
        } else {
            renderFileLibrary();
            renderPlaylist();
            updateStatus('已移除音频：' + removed.name);
        }
    }

    function validatePlaylistEnhanced() {
        if (!state.playlist.length) {
            updateStatus('播放清单为空，请先上传音频或新增播放项。', true);
            return false;
        }
        var invalidIndex = state.playlist.findIndex(function (item) {
            return !getFileById(item.fileId);
        });
        if (invalidIndex !== -1) {
            updateStatus('第 ' + (invalidIndex + 1) + ' 个播放项还没有绑定音频文件。', true);
            return false;
        }
        var emptySequenceIndex = state.playlist.findIndex(function (item) {
            var fileItem = getFileById(item.fileId);
            return isSequenceItem(fileItem) && !fileItem.segments.length;
        });
        if (emptySequenceIndex !== -1) {
            updateStatus('第 ' + (emptySequenceIndex + 1) + ' 个组合播放项没有可用音频。', true);
            return false;
        }
        return true;
    }

    function setSequenceProgress(fileItem) {
        if (!state.sequenceRuntime || !fileItem || !fileItem.segments.length) {
            elements.progressFill.style.width = '0%';
            elements.currentTimeLabel.textContent = '00:00';
            elements.durationLabel.textContent = '00:00';
            return;
        }
        var runtime = state.sequenceRuntime;
        var segmentBase = runtime.segmentIndex / fileItem.segments.length;
        var withinSegment = runtime.inGap ? 0 : ((elements.audioPlayer.duration && elements.audioPlayer.currentTime)
            ? (elements.audioPlayer.currentTime / elements.audioPlayer.duration) / fileItem.segments.length
            : 0);
        var progress = Math.min(100, Math.max(0, (segmentBase + withinSegment) * 100));
        elements.progressFill.style.width = progress.toFixed(2) + '%';
        elements.currentTimeLabel.textContent = formatTime(elements.audioPlayer.currentTime || 0);
        elements.durationLabel.textContent = Number.isFinite(elements.audioPlayer.duration) && elements.audioPlayer.duration > 0
            ? formatTime(elements.audioPlayer.duration)
            : '00:00';
    }

    function startSequenceGap(item, fileItem) {
        var runtime = state.sequenceRuntime;
        if (!runtime) {
            return;
        }
        if (runtime.gapTimeoutId) {
            clearTimeout(runtime.gapTimeoutId);
        }
        runtime.inGap = true;
        runtime.gapDeadline = Date.now() + runtime.gapRemainingMs;
        elements.currentTimeLabel.textContent = '00:00';
        elements.durationLabel.textContent = formatCountdown(runtime.gapRemainingMs);
        updateStatus('第 ' + (state.currentIndex + 1) + ' 项：' + fileItem.name + '，单词 ' + runtime.segmentIndex + '/' + fileItem.segments.length + ' 已完成，等待 ' + Math.max(1, Math.round(runtime.gapRemainingMs / 1000)) + ' 秒后继续。');
        runtime.gapTimeoutId = setTimeout(function () {
            runtime.gapTimeoutId = null;
            runtime.inGap = false;
            runtime.gapRemainingMs = fileItem.gapSeconds * 1000;
            playCurrentItem();
        }, runtime.gapRemainingMs);
    }

    async function playSequenceSegment(item, fileItem, options) {
        var restart = !(options && options.restart === false);
        if (!state.sequenceRuntime || state.sequenceRuntime.itemId !== item.id) {
            state.sequenceRuntime = {
                itemId: item.id,
                segmentIndex: 0,
                inGap: false,
                gapRemainingMs: fileItem.gapSeconds * 1000,
                gapDeadline: null,
                gapTimeoutId: null
            };
        }
        var runtime = state.sequenceRuntime;
        if (runtime.inGap) {
            startSequenceGap(item, fileItem);
            return;
        }
        var segment = fileItem.segments[runtime.segmentIndex];
        if (!segment) {
            advanceToNextItem();
            return;
        }
        var rate = getEffectiveRate(item);
        var repeats = getEffectiveRepeats(item);
        elements.audioPlayer.playbackRate = rate;
        if (restart || elements.audioPlayer.src !== segment.url) {
            elements.audioPlayer.src = segment.url;
            elements.audioPlayer.currentTime = 0;
        }
        renderPlaylist();
        setSequenceProgress(fileItem);
        updateStatus('正在播放第 ' + (state.currentIndex + 1) + ' 项：' + fileItem.name + '，单词 ' + (runtime.segmentIndex + 1) + '/' + fileItem.segments.length + '，第 ' + state.currentLoop + ' 遍，' + rate.toFixed(2) + 'x。');
        try {
            await elements.audioPlayer.play();
        } catch (error) {
            updateStatus('播放失败：' + (error && error.message ? error.message : '浏览器阻止了自动播放。请再次点击开始播放。'), true);
            pausePlayback('播放被浏览器拦截，请再次点击开始或继续。');
        }
    }

    async function playCurrentItemEnhanced(options) {
        var restart = !(options && options.restart === false);
        var item = state.playlist[state.currentIndex];
        if (!item) {
            completePlayback();
            return;
        }
        var fileItem = getFileById(item.fileId);
        if (!fileItem) {
            updateStatus('当前播放项没有可用音频，已跳过。', true);
            advanceToNextItem();
            return;
        }
        state.activeItemId = item.id;
        if (isSequenceItem(fileItem)) {
            await playSequenceSegment(item, fileItem, { restart: restart });
            return;
        }
        clearSequenceRuntime();
        var rate = getEffectiveRate(item);
        var repeats = getEffectiveRepeats(item);
        state.currentLoop = Math.max(1, state.currentLoop || 1);
        elements.audioPlayer.playbackRate = rate;
        if (restart || elements.audioPlayer.src !== fileItem.url) {
            elements.audioPlayer.src = fileItem.url;
            elements.audioPlayer.currentTime = 0;
        }
        renderPlaylist();
        updateStatus((restart ? '正在播放' : '继续播放') + '第 ' + (state.currentIndex + 1) + ' 项：' + fileItem.name + '，第 ' + state.currentLoop + ' 遍，' + rate.toFixed(2) + 'x。');
        try {
            await elements.audioPlayer.play();
        } catch (error) {
            updateStatus('播放失败：' + (error && error.message ? error.message : '浏览器阻止了自动播放。请再次点击开始播放。'), true);
            pausePlayback('播放被浏览器拦截，请再次点击开始或继续。');
        }
    }

    function advanceToNextItemEnhanced() {
        clearSequenceRuntime();
        var nextIndex = getNextPlaylistIndex(state.currentIndex);
        if (nextIndex === -1) {
            completePlayback();
            return;
        }
        state.currentIndex = nextIndex;
        state.currentLoop = 1;
        playCurrentItem();
    }

    function resetPlaybackStateEnhanced(keepStatusMessage) {
        state.currentIndex = -1;
        state.currentLoop = 0;
        state.isPlaying = false;
        state.isPaused = false;
        state.activeItemId = null;
        state.autoPauseTriggered = false;
        state.autoPauseRemainingMs = null;
        clearTimerArtifacts();
        clearSequenceRuntime();
        elements.audioPlayer.pause();
        elements.audioPlayer.removeAttribute('src');
        elements.audioPlayer.load();
        elements.progressFill.style.width = '0%';
        updateTimerLabel();
        if (!keepStatusMessage) {
            updateStatus('等待上传音频或开始播放。');
        }
        renderPlaylist();
    }

    function pausePlaybackEnhanced(message) {
        if (!state.isPlaying) {
            return;
        }
        if (state.sequenceRuntime && state.sequenceRuntime.inGap) {
            if (state.sequenceRuntime.gapTimeoutId) {
                clearTimeout(state.sequenceRuntime.gapTimeoutId);
                state.sequenceRuntime.gapTimeoutId = null;
            }
            state.sequenceRuntime.gapRemainingMs = Math.max(0, state.sequenceRuntime.gapDeadline - Date.now());
        } else {
            elements.audioPlayer.pause();
        }
        state.isPlaying = false;
        state.isPaused = true;
        pauseRunTimer();
        updateButtonStates();
        updateStatus(message || '已暂停播放。');
    }

    function resumePlaybackEnhanced() {
        if (!state.isPaused) {
            return;
        }
        state.isPlaying = true;
        state.isPaused = false;
        resumeRunTimer();
        playCurrentItem({ restart: false });
        updateButtonStates();
    }

    function stopPlaybackEnhanced(message) {
        resetPlaybackState(true);
        updateButtonStates();
        updateStatus(message || '已停止播放并重置状态。');
    }

    function completePlaybackEnhanced() {
        var completedItems = state.playlist.length;
        resetPlaybackState(true);
        updateStatus('播放完成，共处理 ' + completedItems + ' 个播放项。');
    }

    function createSequenceFileItem(group) {
        var gapSeconds = getSystemGapSeconds();
        return {
            id: createId('file'),
            kind: 'sequence',
            name: (group.libraryType === 'listening' ? '听力语料库 · ' : '雅思真经单词 · ') + group.title + ' · ' + gapSeconds + 's 间隔',
            libraryLabel: group.libraryType === 'listening' ? '听力语料库' : '雅思真经单词',
            gapSeconds: gapSeconds,
            segments: group.segments.map(function (segment) { return Object.assign({}, segment); }),
            duration: null
        };
    }

    function importSelectedSystemGroups() {
        var groups = Array.from(state.systemSelection).map(getSystemGroupById).filter(Boolean);
        if (!groups.length) {
            updateStatus('请先选择至少一个章节。', true);
            return;
        }
        groups.forEach(function (group) {
            var fileItem = createSequenceFileItem(group);
            state.files.push(fileItem);
            state.playlist.push(makePlaylistItem(fileItem.id));
        });
        state.systemSelection.clear();
        renderFileLibrary();
        renderPlaylist();
        renderSystemLibraries();
        updateStatus('已导入 ' + groups.length + ' 个系统章节到播放清单。');
    }

    function bindSystemEvents() {
        var system = systemElements();
        if (system.importSelectedBtn && !system.importSelectedBtn.dataset.bound) {
            system.importSelectedBtn.dataset.bound = 'true';
            system.importSelectedBtn.addEventListener('click', importSelectedSystemGroups);
        }
        if (system.clearSystemSelectionBtn && !system.clearSystemSelectionBtn.dataset.bound) {
            system.clearSystemSelectionBtn.dataset.bound = 'true';
            system.clearSystemSelectionBtn.addEventListener('click', function () {
                state.systemSelection.clear();
                renderSystemLibraries();
                updateStatus('已清空系统章节选择。');
            });
        }
        if (system.listeningSearchInput && !system.listeningSearchInput.dataset.bound) {
            system.listeningSearchInput.dataset.bound = 'true';
            system.listeningSearchInput.addEventListener('input', function (event) {
                state.systemFilters.listening = event.target.value || '';
                renderSystemLibraries();
            });
        }
        if (system.wordsSearchInput && !system.wordsSearchInput.dataset.bound) {
            system.wordsSearchInput.dataset.bound = 'true';
            system.wordsSearchInput.addEventListener('input', function (event) {
                state.systemFilters.words = event.target.value || '';
                renderSystemLibraries();
            });
        }
        if (system.listeningSelectAllBtn && !system.listeningSelectAllBtn.dataset.bound) {
            system.listeningSelectAllBtn.dataset.bound = 'true';
            system.listeningSelectAllBtn.addEventListener('click', function () {
                getFilteredGroups('listening').forEach(function (group) {
                    state.systemSelection.add(group.id);
                });
                renderSystemLibraries();
            });
        }
        if (system.wordsSelectAllBtn && !system.wordsSelectAllBtn.dataset.bound) {
            system.wordsSelectAllBtn.dataset.bound = 'true';
            system.wordsSelectAllBtn.addEventListener('click', function () {
                getFilteredGroups('words').forEach(function (group) {
                    state.systemSelection.add(group.id);
                });
                renderSystemLibraries();
            });
        }
        if (system.listeningInvertBtn && !system.listeningInvertBtn.dataset.bound) {
            system.listeningInvertBtn.dataset.bound = 'true';
            system.listeningInvertBtn.addEventListener('click', function () {
                toggleVisibleSelection('listening');
            });
        }
        if (system.wordsInvertBtn && !system.wordsInvertBtn.dataset.bound) {
            system.wordsInvertBtn.dataset.bound = 'true';
            system.wordsInvertBtn.addEventListener('click', function () {
                toggleVisibleSelection('words');
            });
        }
        if (system.listeningClearBtn && !system.listeningClearBtn.dataset.bound) {
            system.listeningClearBtn.dataset.bound = 'true';
            system.listeningClearBtn.addEventListener('click', function () {
                state.systemLibraries.listening.forEach(function (group) {
                    state.systemSelection.delete(group.id);
                });
                renderSystemLibraries();
            });
        }
        if (system.wordsClearBtn && !system.wordsClearBtn.dataset.bound) {
            system.wordsClearBtn.dataset.bound = 'true';
            system.wordsClearBtn.addEventListener('click', function () {
                state.systemLibraries.words.forEach(function (group) {
                    state.systemSelection.delete(group.id);
                });
                renderSystemLibraries();
            });
        }
        if (system.listeningSortSelect && !system.listeningSortSelect.dataset.bound) {
            system.listeningSortSelect.dataset.bound = 'true';
            system.listeningSortSelect.addEventListener('change', function (event) {
                state.systemSorts.listening = event.target.value || 'chapter';
                renderSystemLibraries();
            });
        }
        if (system.wordsSortSelect && !system.wordsSortSelect.dataset.bound) {
            system.wordsSortSelect.dataset.bound = 'true';
            system.wordsSortSelect.addEventListener('change', function (event) {
                state.systemSorts.words = event.target.value || 'chapter';
                renderSystemLibraries();
            });
        }
        if (system.listeningSelectedOnly && !system.listeningSelectedOnly.dataset.bound) {
            system.listeningSelectedOnly.dataset.bound = 'true';
            system.listeningSelectedOnly.addEventListener('click', function () {
                state.systemSelectedOnly.listening = !state.systemSelectedOnly.listening;
                renderSystemLibraries();
            });
        }
        if (system.wordsSelectedOnly && !system.wordsSelectedOnly.dataset.bound) {
            system.wordsSelectedOnly.dataset.bound = 'true';
            system.wordsSelectedOnly.addEventListener('click', function () {
                state.systemSelectedOnly.words = !state.systemSelectedOnly.words;
                renderSystemLibraries();
            });
        }
        if (system.listeningPresetChapterBtn && !system.listeningPresetChapterBtn.dataset.bound) {
            system.listeningPresetChapterBtn.dataset.bound = 'true';
            system.listeningPresetChapterBtn.addEventListener('click', function () {
                applyQuickKeyword('listening', 'chapter');
            });
        }
        if (system.listeningPresetTestPaperBtn && !system.listeningPresetTestPaperBtn.dataset.bound) {
            system.listeningPresetTestPaperBtn.dataset.bound = 'true';
            system.listeningPresetTestPaperBtn.addEventListener('click', function () {
                applyQuickKeyword('listening', 'test paper');
            });
        }
        if (system.wordsPresetChapterBtn && !system.wordsPresetChapterBtn.dataset.bound) {
            system.wordsPresetChapterBtn.dataset.bound = 'true';
            system.wordsPresetChapterBtn.addEventListener('click', function () {
                applyQuickKeyword('words', 'chapter');
            });
        }
        if (system.systemSelectionChips && !system.systemSelectionChips.dataset.bound) {
            system.systemSelectionChips.dataset.bound = 'true';
            system.systemSelectionChips.addEventListener('click', function (event) {
                var removeBtn = event.target.closest('button[data-remove-selected]');
                if (!removeBtn) {
                    return;
                }
                state.systemSelection.delete(removeBtn.dataset.removeSelected);
                renderSystemLibraries();
            });
        }
        [system.listeningSystemList, system.wordsSystemList].forEach(function (container) {
            if (!container || container.dataset.bound) {
                return;
            }
            container.dataset.bound = 'true';
            container.addEventListener('change', function (event) {
                var checkbox = event.target.closest('input[data-group-id]');
                if (!checkbox) {
                    return;
                }
                var libraryType = container.id === 'listeningSystemList' ? 'listening' : 'words';
                var lastToggledId = state.systemLastToggled[libraryType];
                if (event.shiftKey && lastToggledId) {
                    applyRangeSelection(libraryType, lastToggledId, checkbox.dataset.groupId, checkbox.checked);
                }
                if (checkbox.checked) {
                    state.systemSelection.add(checkbox.dataset.groupId);
                } else {
                    state.systemSelection.delete(checkbox.dataset.groupId);
                }
                state.systemLastToggled[libraryType] = checkbox.dataset.groupId;
                renderSystemLibraries();
            });
        });
    }

    function bindAudioInterceptors() {
        if (elements.audioPlayer.dataset.systemInterceptorBound) {
            return;
        }
        elements.audioPlayer.dataset.systemInterceptorBound = 'true';
        elements.audioPlayer.addEventListener('ended', function (event) {
            var item = state.playlist[state.currentIndex];
            var fileItem = item ? getFileById(item.fileId) : null;
            if (!state.isPlaying || !isSequenceItem(fileItem)) {
                return;
            }
            event.stopImmediatePropagation();
            var runtime = state.sequenceRuntime;
            if (!runtime) {
                advanceToNextItem();
                return;
            }
            if (runtime.segmentIndex < fileItem.segments.length - 1) {
                runtime.segmentIndex += 1;
                runtime.gapRemainingMs = fileItem.gapSeconds * 1000;
                startSequenceGap(item, fileItem);
                setSequenceProgress(fileItem);
                return;
            }
            var repeats = getEffectiveRepeats(item);
            if (state.currentLoop < repeats) {
                state.currentLoop += 1;
                state.sequenceRuntime = {
                    itemId: item.id,
                    segmentIndex: 0,
                    inGap: false,
                    gapRemainingMs: fileItem.gapSeconds * 1000,
                    gapDeadline: null,
                    gapTimeoutId: null
                };
                playCurrentItem();
                return;
            }
            advanceToNextItem();
        }, true);
        elements.audioPlayer.addEventListener('timeupdate', function (event) {
            var item = state.playlist[state.currentIndex];
            var fileItem = item ? getFileById(item.fileId) : null;
            if (!isSequenceItem(fileItem)) {
                return;
            }
            event.stopImmediatePropagation();
            setSequenceProgress(fileItem);
        }, true);
    }

    function overrideGlobals() {
        renderFileLibrary = renderFileLibraryEnhanced;
        renderPlaylist = renderPlaylistEnhanced;
        updateButtonStates = updateButtonStatesEnhanced;
        revokeFileUrls = revokeFileUrlsEnhanced;
        removeFile = removeFileEnhanced;
        validatePlaylist = validatePlaylistEnhanced;
        playCurrentItem = playCurrentItemEnhanced;
        advanceToNextItem = advanceToNextItemEnhanced;
        resetPlaybackState = resetPlaybackStateEnhanced;
        pausePlayback = pausePlaybackEnhanced;
        resumePlayback = resumePlaybackEnhanced;
        stopPlayback = stopPlaybackEnhanced;
        completePlayback = completePlaybackEnhanced;
    }

    function initialize() {
        ensureStyles();
        insertPanel();
        ensureStateExtensions();
        buildSystemLibraries();
        overrideGlobals();
        bindSystemEvents();
        bindAudioInterceptors();
        renderSystemLibraries();
        renderFileLibrary();
        renderPlaylist();
        updateButtonStates();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
}());
