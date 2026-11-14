import { ROUTES } from '~/constants/routes'

const SETUP_PAGE = ROUTES.setup

// Keeps the app on /setup until onboarding is done, and out of it afterwards.
export default defineNuxtRouteMiddleware(async (to) => {
  // Without a database app.vue shows the error instead; nothing to guard.
  if (!useDb().ready.value) return

  const done = await useSetup().isInitialized()
  const inSetup = to.path === SETUP_PAGE

  if (inSetup && done) return navigateTo(ROUTES.home)
  if (!inSetup && !done) return navigateTo(SETUP_PAGE)
})
