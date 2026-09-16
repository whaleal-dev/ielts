import { createRouter, createWebHashHistory } from 'vue-router'

import { modules } from '@/modules'
import HomeView from '@/views/HomeView.vue'

/**
 * 采用 hash 模式：构建产物可部署到任意静态服务器，
 * 也兼容本地 file:// / 双击 dist/index.html 打开，无需服务端回退配置。
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { title: '今日' },
    },
    {
      path: '/plans',
      name: 'plans',
      component: () => import('@/views/PlansView.vue'),
      meta: { title: '学习路径' },
    },
    {
      path: '/tools',
      name: 'tools',
      component: () => import('@/views/ToolsView.vue'),
      meta: { title: '全部训练' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { title: '全局设置' },
    },
    ...modules.map((m) => ({
      path: `/${m.id}`,
      name: m.id,
      // 每个模块独立 view 文件：重构时直接替换对应视图即可
      component: () => import(`@/views/modules/${m.id}.vue`),
      meta: { title: m.title },
    })),
  ],
})

router.beforeEach((to) => {
  // 未认领的深链接一律回首页，避免空白
  if (!to.matched.length) return { path: '/' }
})

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : ''
  document.title = title && title !== '今日' ? `${title} · IELTS Dev` : 'IELTS Dev · 今日学习工作台'
})

export default router
