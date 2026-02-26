<template>
  <div class="app">
    <ErrorOverlay />
    <BackgroundImage />
    <div class="content-overlay">
      <div class="main-content">
        <div class="left-column">
          <DateTimeDisplay />
          <UpcomingEventsList />
          <WeatherWidget />
        </div>
        <div class="right-column">
          <CalendarView />
        </div>
      </div>
      <NewsHeadlinesDisplay />
    </div>
  </div>
</template>

<script setup>
import ErrorOverlay from './components/ErrorOverlay.vue';
import BackgroundImage from './components/BackgroundImage.vue';
import CalendarView from './components/CalendarView.vue';
import DateTimeDisplay from './components/DateTimeDisplay.vue';
import UpcomingEventsList from './components/UpcomingEventsList.vue';
import WeatherWidget from './components/WeatherWidget.vue';
import NewsHeadlinesDisplay from './components/NewsHeadlinesDisplay.vue';
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  overflow: hidden;
}

#app {
  width: 100vw;
  height: 100vh;
  position: relative;
}

.app {
  width: 100%;
  height: 100%;
  position: relative;
}

.content-overlay {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  z-index: 1;
}

.main-content {
  display: flex;
  flex: 1;
  padding: 5px;
  padding-left: 20px;
  overflow: hidden;
}
.main-content > * + * {
  margin-left: 5px;
}

.left-column {
  width: 30%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.left-column > * + * {
  margin-top: 1px;
}

.right-column {
  width: 70%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding-right: 24px;
}
</style>
