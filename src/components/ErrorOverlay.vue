<template>
  <Transition name="error-slide">
    <div v-if="fatalError" class="error-overlay" role="alert">
      <span class="error-message">{{ fatalError }}</span>
    </div>
  </Transition>
</template>

<script setup>
import { fatalError } from '../utils/fatalError.js';
</script>

<style scoped>
.error-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #b91c1c;
  color: #fff;
  font-size: 0.95rem;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.error-overlay > * + * {
  margin-left: 12px;
}

.error-message {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error-dismiss {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  border-radius: 4px;
}

.error-dismiss:hover {
  background: rgba(255, 255, 255, 0.3);
}

.error-slide-enter-active,
.error-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.error-slide-enter-from,
.error-slide-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
