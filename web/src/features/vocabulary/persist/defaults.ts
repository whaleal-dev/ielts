/**
 * DEFAULT_STATE —— 对应 legacy 2725–2766。
 */
import type { VocabState } from '../types'

export function createDefaultState(): VocabState {
  return {
    selectedGroupId: '',
    selectedLibraryChapter: '',
    wordNotes: {},
    searchQuery: '',
    searchAssistQuery: '',
    searchChapterFilter: 'all',
    difficultyQuery: '',
    difficultyVisibleCount: 24,
    difficultySortMode: 'default',
    activeTab: 'study',
    selectedDifficultKeys: [],
    progressByGroup: {},
    wordStats: {},
    studyLog: [],
    difficultWords: {},
    backup: { lastBackupAt: '', lastImportAt: '' },
    settings: {
      playbackRate: 1,
      intervalSeconds: 1,
      repeatCount: 1,
      showSynonym: true,
      showListeningCorpus: true,
      enabledSynonymSources: null,
      muted: false,
    },
    practice: {
      mode: 'standard',
      showWord: true,
      showMeaning: true,
      autoRunning: false,
      quiz: { options: [], selectedMeaning: '', answered: false, correct: false },
    },
  }
}
