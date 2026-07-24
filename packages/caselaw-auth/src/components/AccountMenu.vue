<script setup lang="ts">
import { computed } from 'vue'
import LogoutButton from './LogoutButton.vue'
import { useAuth } from '../vue'

const auth = useAuth()
const displayName = computed(() => {
  const user = auth.state.user
  return user?.name || user?.email || user?.preferredUsername || 'Account'
})
</script>

<template>
  <div v-if="auth.state.user" class="cl-auth-account">
    <div class="cl-auth-avatar" aria-hidden="true">
      {{ displayName.slice(0, 1).toUpperCase() }}
    </div>
    <div class="cl-auth-account-copy">
      <strong>{{ displayName }}</strong>
      <span v-if="auth.state.user.email">{{ auth.state.user.email }}</span>
    </div>
    <LogoutButton />
  </div>
</template>
