import type { AdapterDefinition } from '~/types/adapters'
import generic from './generic.json'
import rimworld from './rimworld.json'

// Seeded into the adapters table on start (overwriting earlier built-in versions).
export const builtinAdapters: AdapterDefinition[] = [generic, rimworld] as AdapterDefinition[]
