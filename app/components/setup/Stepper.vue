<script setup lang="ts">
import { SETUP_STEPS } from '~/constants/setup'

const { status } = useSetup()
</script>

<template>
  <div class="flex w-full max-w-2xl flex-col items-center gap-6">
    <h1 class="text-xl font-semibold">
      Setting up Workshop Downloader
    </h1>
    <UStepper
      :model-value="status"
      :items="SETUP_STEPS"
      class="w-full"
      disabled
    />
  </div>
</template>
