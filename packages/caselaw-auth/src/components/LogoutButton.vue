<script setup lang="ts">
import { useAuth } from '../vue'

withDefaults(defineProps<{
  label?: string
  returnTo?: string
}>(), {
  label: 'Sign out',
  returnTo: '/',
})

const auth = useAuth()
</script>

<template>
  <button class="cl-auth-button cl-auth-button-secondary" type="button" @click="auth.logout(returnTo)">
    <slot>{{ label }}</slot>
  </button>
</template>
