#!/usr/bin/env node
/**
 * scope-legacy-css.mjs —— legacy 单文件 HTML 样式移植工具（词汇模块流程沉淀）。
 *
 * 把旧页面 <style> 块改造成“容器级作用域”的模块样式文件（基于 postcss 解析）：
 *   1. tokens（原 :root 块）→ `.${scope} { … }`
 *   2. body 背景规则 → `.${scope} { … }`（容器内渐变背景）
 *   3. body::before / body::after 光斑 → `.${scope}::before / ::after`
 *   4. 其余所有规则（含 @media 内部）的选择器统一加 `.${scope} ` 前缀；
 *      @keyframes / @font-face 保留（动画名视为全局唯一，模块内命名前缀化可后置处理）
 *   5. 附加容器占位规则（负 margin 抵消 Element Plus main padding）
 *
 * 用法：node scripts/scope-legacy-css.mjs <legacyHtml> <scopeClass> <outFile>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import postcss from 'postcss'

const [, , legacyHtml, scope, outFile] = process.argv
if (!legacyHtml || !scope || !outFile) {
  console.error('usage: scope-legacy-css.mjs <legacyHtml> <scopeClass> <outFile>')
  process.exit(1)
}

function main() {
  const html = readFileSync(legacyHtml, 'utf8')
  const match = html.match(/<style>([\s\S]*?)<\/style>/)
  if (!match) throw new Error('未找到 <style> 块')
  const cssText = match[1]

  const root = postcss.parse(cssText)
  const rootRule = root.first
  const bodyRule = root.nodes.find((node) => node.type === 'rule' && node.selectors?.some((s) => s.trim() === 'body'))

  // 1) :root tokens → .scope
  let tokensCss = ''
  if (rootRule && rootRule.selectors?.some((s) => s.trim() === ':root')) {
    const clone = rootRule.clone()
    clone.selectors = [`.${scope}`]
    tokensCss = clone.toString()
    rootRule.remove()
  }

  // 2) body → .scope（min-height 收短）
  let bodyCss = ''
  if (bodyRule) {
    const clone = bodyRule.clone()
    clone.selectors = [`.${scope}`]
    clone.walkDecls('min-height', (decl) => {
      decl.value = '100%'
    })
    bodyCss = clone.toString()
    bodyRule.remove()
  }

  // 3) 伪元素光斑
  const blob = (node, pseudo) => {
    const clone = node.clone()
    clone.selectors = [`.${scope}::${pseudo}`]
    return clone
  }
  const hasSel = (node, sels) => node.type === 'rule' && sels.every((s) => node.selectors?.some((x) => x.trim() === s))
  const pseudoBefore = root.nodes.find((node) => hasSel(node, ['body::before']))
  const pseudoAfter = root.nodes.find((node) => hasSel(node, ['body::after']))
  const combinedBlob = root.nodes.find((node) => hasSel(node, ['body::before', 'body::after']))

  let beforeCss = ''
  let afterCss = ''
  if (combinedBlob) {
    const clone = combinedBlob.clone()
    clone.selectors = [`.${scope}::before`, `.${scope}::after`]
    beforeCss = clone.toString()
    combinedBlob.remove()
  }
  if (!beforeCss && pseudoBefore) {
    beforeCss = blob(pseudoBefore, 'before').toString()
    pseudoBefore.remove()
  }
  if (!beforeCss?.includes(`::after`) && pseudoAfter) {
    afterCss = blob(pseudoAfter, 'after').toString()
    pseudoAfter.remove()
  }

  // 4) 其余全部规则加前缀（postcss 自动处理 @media 内规则）
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && ['keyframes', '-webkit-keyframes', 'font-face'].includes(rule.parent.name)) return
    if (rule.selectors.some((s) => s.trim().startsWith(`.${scope}`))) return
    rule.selectors = rule.selectors.map((s) => `.${scope} ${s.trim()}`)
  })

  // 移除可能残留的空 at-rule
  root.walkAtRules((atRule) => {
    if (!atRule.nodes?.length) atRule.remove()
  })

  const out = [
    tokensCss,
    bodyCss,
    '',
    root.toString(),
    '',
    beforeCss ? `${beforeCss}\n` : '',
    afterCss ? `${afterCss}\n` : '',
    `/* 角落光斑（原 body::before/::after，容器化） — 若上面已由合并规则生成则忽略 */`,
    `/* 容器占满主区：负 margin 抵消 Element Plus main 的 padding */`,
    `.${scope} {`,
    '  position: relative;',
    '  isolation: isolate;',
    '  margin: -20px;',
    '  padding: 16px 20px 36px;',
    '  overflow: clip;',
    '}',
  ].join('\n')

  writeFileSync(outFile, out)
  console.log(`wrote ${outFile} (${out.length} bytes, ${out.split('\n').length} lines)`)
}

main()
