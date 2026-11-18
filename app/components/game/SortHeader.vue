<script setup lang="ts">
// A column header that sorts its table column: ascending, then descending. Only the two
// methods of the table's column it uses are typed.
interface SortableColumn {
  getIsSorted: () => false | 'asc' | 'desc'
  toggleSorting: (desc?: boolean) => void
}
const props = defineProps<{ column: SortableColumn, label: string }>()

const sorted = computed(() => props.column.getIsSorted())
const icon = computed(() => sorted.value === 'asc'
  ? 'i-lucide-arrow-up-narrow-wide'
  : sorted.value === 'desc' ? 'i-lucide-arrow-down-wide-narrow' : 'i-lucide-arrow-up-down')
</script>

<template>
  <UButton
    color="neutral"
    variant="ghost"
    size="xs"
    class="-mx-2"
    :label="label"
    :trailing-icon="icon"
    :class="sorted ? 'text-highlighted' : ''"
    @click="column.toggleSorting(sorted === 'asc')"
  />
</template>
