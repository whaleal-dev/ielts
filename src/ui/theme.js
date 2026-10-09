import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

const preset = definePreset(Aura, {
  semantic: {
    primary: { 50: '{blue.50}', 100: '{blue.100}', 200: '{blue.200}', 300: '{blue.300}', 400: '#3399ff', 500: '#0071e3', 600: '#005bc1', 700: '{blue.700}', 800: '{blue.800}', 900: '{blue.900}', 950: '{blue.950}' },
    formField: { borderRadius: '12px', paddingX: '.8rem', paddingY: '.65rem' },
    list: { padding: '.4rem', gap: '.2rem', option: { padding: '.65rem .75rem', borderRadius: '8px' }, optionGroup: { padding: '.65rem .75rem', fontWeight: '600' } },
    colorScheme: {
      light: {
        primary: { color: '#0071e3', inverseColor: '#ffffff', hoverColor: '#005bc1', activeColor: '#004a9e' },
        highlight: { background: '#eaf3ff', focusBackground: '#deedff', color: '#005bc1', focusColor: '#004a9e' },
        formField: { background: 'rgba(255, 255, 255, .94)', borderColor: '#dce4ef', hoverBorderColor: '#b1c6e2', focusBorderColor: '#0071e3', color: '#1d2738', placeholderColor: '#66748a', disabledBackground: '#edf2f8', disabledColor: '#66748a' },
      },
    },
  },
  components: {
    select: { dropdown: { width: '2.5rem' }, overlay: { borderRadius: '14px', shadow: '0 12px 36px rgba(30, 54, 91, .14)' } },
    multiselect: { dropdown: { width: '2.5rem' }, overlay: { borderRadius: '14px', shadow: '0 12px 36px rgba(30, 54, 91, .14)' } },
    checkbox: { root: { width: '20px', height: '20px', borderRadius: '6px' } },
  },
});

export const selectionUi = {
  theme: { preset, options: { darkModeSelector: false } },
  pt: { select: { pcFilter: { root: { 'aria-label': '搜索选项' } } }, multiselect: { pcFilter: { root: { 'aria-label': '搜索选项' } } } },
  locale: {
    emptyMessage: '暂无可选项',
    emptyFilterMessage: '没有匹配的选项',
    emptySearchMessage: '没有匹配的选项',
    searchMessage: '找到 {0} 个选项',
    selectionMessage: '已选择 {0} 项',
    emptySelectionMessage: '尚未选择',
    aria: { selectAll: '全选', unselectAll: '取消全选', close: '关闭', clear: '清除选择', filter: '搜索选项', removeLabel: '移除' },
  },
};
