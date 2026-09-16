<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const mobileOpen = ref(false)

const isWorkspacePage = computed(() => ['/', '/plans', '/tools', '/settings'].includes(route.path))

function closeNavigation() {
  mobileOpen.value = false
}

function closeMenusOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') closeNavigation()
}

onMounted(() => {
  document.addEventListener('keydown', closeMenusOnEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', closeMenusOnEscape)
})

watch(() => route.path, closeNavigation)
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <div class="header-inner">
        <RouterLink class="brand" to="/" aria-label="返回 IELTS Dev 首页" @click="closeNavigation">
          <span class="brand-mark" aria-hidden="true">ID</span>
          <span class="brand-copy">
            <strong>IELTS DEV</strong>
            <small>LOCAL LEARNING WORKSPACE</small>
          </span>
        </RouterLink>

        <button
          class="nav-toggle"
          type="button"
          :aria-expanded="mobileOpen"
          aria-controls="site-navigation"
          aria-label="切换导航菜单"
          @click="mobileOpen = !mobileOpen"
        >
          <span></span>
          <span></span>
        </button>

        <div id="site-navigation" class="navigation" :class="{ 'is-open': mobileOpen }">
          <nav class="primary-nav" aria-label="主导航">
            <RouterLink to="/" exact-active-class="is-active" @click="closeNavigation">今日</RouterLink>
            <RouterLink to="/plans" active-class="is-active" @click="closeNavigation">学习路径</RouterLink>
            <RouterLink to="/tools" active-class="is-active" @click="closeNavigation">全部训练</RouterLink>
            <RouterLink class="settings-link" to="/settings" active-class="is-active" @click="closeNavigation">全局设置</RouterLink>
          </nav>
        </div>
      </div>
    </header>

    <main class="site-main" :class="{ 'is-workspace': isWorkspacePage }">
      <RouterView />
    </main>

    <footer class="site-footer">
      <div class="footer-inner">
        <span>© 2026 IELTS DEV · LOCAL-FIRST LEARNING SYSTEM</span>
        <nav aria-label="页脚导航">
          <RouterLink to="/">今日</RouterLink>
          <RouterLink to="/tools">全部训练</RouterLink>
          <RouterLink to="/settings">全局设置</RouterLink>
        </nav>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.site-shell {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--color-canvas);
}

.site-header {
  position: sticky;
  z-index: 100;
  top: 0;
  height: 70px;
  border-bottom: 1px solid var(--color-line);
  background: rgba(252, 251, 248, 0.94);
  backdrop-filter: blur(16px);
}

.header-inner {
  width: min(calc(100% - 48px), var(--site-width));
  height: 100%;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex: none;
}

.brand-mark {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: linear-gradient(145deg, #5d68ee, #7a68ea);
  box-shadow: 0 8px 18px rgba(80, 89, 214, 0.2);
  color: #fff;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
}

.brand-copy {
  display: grid;
  gap: 2px;
}

.brand-copy strong {
  color: var(--color-ink);
  font-size: 13px;
  letter-spacing: 0.24em;
}

.brand-copy small {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.16em;
}

.navigation,
.primary-nav {
  display: flex;
  align-items: center;
}

.navigation {
  gap: 34px;
}

.primary-nav {
  gap: 28px;
}

.primary-nav a {
  position: relative;
  padding: 26px 0 24px;
  color: #4e4c49;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.primary-nav a::after {
  position: absolute;
  right: 0;
  bottom: 17px;
  left: 0;
  height: 2px;
  border-radius: 999px;
  background: var(--color-accent);
  content: '';
  opacity: 0;
  transform: scaleX(0.2);
  transition: 180ms ease;
}

.primary-nav a:hover,
.primary-nav a.is-active {
  color: var(--color-ink);
}

.primary-nav a.is-active::after {
  opacity: 1;
  transform: scaleX(1);
}

.primary-nav a.settings-link {
  margin-left: 4px;
  padding: 10px 15px;
  border: 1px solid var(--color-night);
  border-radius: 999px;
  background: var(--color-night);
  color: #fff;
}

.primary-nav a.settings-link::after {
  display: none;
}

.primary-nav a.settings-link.is-active {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: #fff;
}

.nav-toggle {
  display: none;
}

.site-main {
  width: 100%;
  flex: 1;
  padding: 24px;
  background: var(--color-canvas);
}

.site-main.is-workspace {
  padding: 0;
  background: var(--color-canvas);
}

.site-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.09);
  background: var(--color-night);
}

.footer-inner {
  width: min(calc(100% - 48px), var(--site-width));
  min-height: 76px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  color: rgba(255, 255, 255, 0.46);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.11em;
}

.footer-inner nav {
  display: flex;
  gap: 22px;
}

.footer-inner a:hover {
  color: #fff;
}

@media (max-width: 760px) {
  .primary-nav {
    display: none;
  }
}

@media (max-width: 760px) {
  .site-header {
    height: 64px;
  }

  .header-inner,
  .footer-inner {
    width: min(calc(100% - 32px), var(--site-width));
  }

  .brand-mark {
    width: 34px;
    height: 34px;
  }

  .brand-copy small {
    display: none;
  }

  .nav-toggle {
    width: 40px;
    height: 40px;
    display: grid;
    place-content: center;
    gap: 6px;
    border: 1px solid var(--color-line);
    border-radius: 50%;
    background: #fff;
    cursor: pointer;
  }

  .nav-toggle span {
    width: 16px;
    height: 1px;
    display: block;
    background: var(--color-ink);
    transition: transform 180ms ease;
  }

  .nav-toggle[aria-expanded='true'] span:first-child {
    transform: translateY(3.5px) rotate(45deg);
  }

  .nav-toggle[aria-expanded='true'] span:last-child {
    transform: translateY(-3.5px) rotate(-45deg);
  }

  .navigation {
    position: absolute;
    top: 64px;
    right: 0;
    left: 0;
    padding: 16px;
    display: none;
    border-bottom: 1px solid var(--color-line);
    background: var(--color-surface);
    box-shadow: 0 18px 30px rgba(17, 19, 24, 0.08);
  }

  .navigation.is-open {
    display: block;
  }

  .primary-nav {
    margin-bottom: 12px;
    display: grid;
  }

  .primary-nav a {
    padding: 12px;
    border-radius: 10px;
  }

  .primary-nav a::after {
    display: none;
  }

  .primary-nav a.is-active {
    background: var(--color-soft-accent);
  }

  .primary-nav a.settings-link {
    margin-left: 0;
    color: #fff;
  }

  .site-main {
    padding: 12px;
  }

  .footer-inner {
    padding: 24px 0;
    align-items: flex-start;
    flex-direction: column;
  }

  .footer-inner nav {
    flex-wrap: wrap;
  }

  .footer-inner nav a {
    color: rgba(255, 255, 255, 0.72);
  }
}
</style>
