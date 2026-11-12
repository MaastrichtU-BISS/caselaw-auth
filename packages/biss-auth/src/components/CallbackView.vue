<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAuth } from '../vue'

const auth = useAuth()
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    await auth.handleCallback()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
})
</script>

<template>
  <div class="cl-auth-panel" role="status">
    <template v-if="error">
      <strong>Sign in could not be completed</strong>
      <p>{{ error }}</p>
      <button class="cl-auth-button cl-auth-button-primary" type="button" @click="auth.login()">
        Try again
      </button>
    </template>
    <template v-else>
      <div class="cl-auth-spinner" />
      <p>Completing sign in...</p>
    </template>
  </div>
</template>
