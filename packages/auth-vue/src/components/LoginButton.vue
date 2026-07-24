<script setup lang="ts">
import { useAuth } from '../vue'

withDefaults(defineProps<{
  label?: string
  returnTo?: string
}>(), {
  label: 'Sign in',
  returnTo: undefined,
})

const auth = useAuth()
</script>

<template>
  <button class="cl-auth-button cl-auth-button-primary" type="button" @click="auth.login({ returnTo })">
    <slot>{{ label }}</slot>
  </button>
</template>
