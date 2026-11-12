<script setup lang="ts">
import { computed, inject } from 'vue'
import { CaselawAuthKey } from '../vue'
import { legalLinks, type LegalConfig } from '../legal'

// Without a `legal` prop the links come from the `legal` option the auth
// plugin was created with, so a product configures its documents once.
const props = defineProps<{
  legal?: LegalConfig
}>()

const auth = inject(CaselawAuthKey, null)
const links = computed(() => (props.legal ? legalLinks(props.legal) : auth?.legal || []))
</script>

<template>
  <nav v-if="links.length" class="cl-auth-legal" aria-label="Legal">
    <a v-for="link in links" :key="link.href" :href="link.href" target="_blank" rel="noopener noreferrer">
      {{ link.label }}
    </a>
  </nav>
</template>
