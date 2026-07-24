<script setup lang="ts">
import { onMounted } from 'vue'
import LoginButton from './LoginButton.vue'
import { useAuth } from '../vue'

withDefaults(defineProps<{
  title?: string
  message?: string
  requiredRoles?: string[]
}>(), {
  title: 'Access required',
  message: 'Sign in with your account to continue.',
  requiredRoles: () => [],
})

const auth = useAuth()

onMounted(() => {
  void auth.init()
})
</script>

<template>
  <slot v-if="auth.state.ready && auth.state.isAuthenticated && auth.hasAnyRole(requiredRoles)" />

  <slot v-else-if="!auth.state.ready" name="loading">
    <div class="cl-auth-panel" role="status">
      <div class="cl-auth-spinner" />
      <p>Checking session...</p>
    </div>
  </slot>

  <slot v-else-if="auth.state.isAuthenticated" name="forbidden">
    <div class="cl-auth-panel">
      <strong>{{ title }}</strong>
      <p>Your account does not have access to this area.</p>
    </div>
  </slot>

  <slot v-else name="anonymous">
    <div class="cl-auth-panel">
      <strong>{{ title }}</strong>
      <p>{{ message }}</p>
      <LoginButton />
    </div>
  </slot>
</template>
