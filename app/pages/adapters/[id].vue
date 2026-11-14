<script setup lang="ts">
import { ROUTES } from '~/constants/routes'

// The adapter editor: fields, rules, save/duplicate/delete, a test panel and the raw JSON.
const route = useRoute()
const { isNew, builtin, def, errors, json, save, remove } = await useAdapterEditor(
  String(route.params.id),
  route.query.from as string | undefined
)
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <UAlert
        v-if="builtin"
        color="info"
        variant="subtle"
        description="Built-in adapters are read-only. Duplicate this one to customize it."
      />

      <AdapterForm
        v-model="def"
        :is-new="isNew"
        :builtin="builtin"
      />

      <UAlert
        v-if="errors.length"
        color="warning"
        variant="subtle"
        title="Fix before saving"
      >
        <template #description>
          <ul>
            <li
              v-for="e in errors"
              :key="e"
            >
              {{ e }}
            </li>
          </ul>
        </template>
      </UAlert>

      <div class="flex max-w-4xl flex-wrap gap-2">
        <UButton
          v-if="!builtin"
          icon="i-lucide-save"
          label="Save"
          :disabled="errors.length > 0"
          @click="save"
        />
        <UButton
          v-if="!isNew"
          :to="ROUTES.newAdapter(def.id)"
          icon="i-lucide-copy"
          label="Duplicate"
          color="neutral"
          variant="outline"
        />
        <UButton
          v-if="!isNew && !builtin"
          icon="i-lucide-trash-2"
          label="Delete"
          color="error"
          variant="outline"
          @click="remove"
        />
      </div>

      <AdapterTestCard :def="def" />

      <details class="max-w-4xl">
        <summary class="cursor-pointer text-sm text-muted">
          JSON
        </summary>
        <pre class="mt-2 overflow-auto rounded bg-elevated p-3 text-xs">{{ json }}</pre>
      </details>
    </template>
  </UDashboardPanel>
</template>
