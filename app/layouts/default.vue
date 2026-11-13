<template>
  <UMain>
    <UDashboardGroup unit="rem">
      <Sidebar />
      <!-- Pages render their own UDashboardPanel (they use its header/body slots). -->
      <slot />
    </UDashboardGroup>
  </UMain>
</template>
