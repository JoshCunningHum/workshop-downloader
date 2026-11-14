import type { AdapterDefinition } from '~/types/adapters'
import generic from './generic.json'
import rimworld from './rimworld.json'
import stellaris from './stellaris.json'

// Seeded into the adapters table on start (overwriting earlier built-in versions).
export const builtinAdapters: AdapterDefinition[] = [generic, rimworld, stellaris] as AdapterDefinition[]
