<template>
  <div class="datetime-display">
    <div class="date">{{ formattedDate }}</div>
    <div class="time">{{ formattedTime }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const formattedDate = ref('');
const formattedTime = ref('');

function updateDateTime() {
  const now = new Date();
  
  formattedDate.value = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  formattedTime.value = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

let intervalId = null;

onMounted(() => {
  updateDateTime();
  intervalId = setInterval(updateDateTime, 1000);
});

onUnmounted(() => {
  if (intervalId) {
    clearInterval(intervalId);
  }
});
</script>

<style scoped>
.datetime-display {
  padding: 5px 5px 0 5px;
  text-align: left;
  margin-bottom: 0;
}

.date {
  font-size: 2rem;
  font-weight: 600;
  color: #ffffff;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  margin-bottom: 2px;
}

.time {
  font-size: 5.81rem;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
}
</style>
