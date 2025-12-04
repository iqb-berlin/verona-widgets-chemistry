<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

const statusMessage = ref('Please select a file');
const widgetConfigJson = ref('{}');
const widgetState = ref('');
const widgetHtml = ref();
const widgetSrcdoc = ref();
const widgetIframe = ref();

const widgetConfig = computed(() => {
  try {
    return JSON.parse(widgetConfigJson.value);
  } catch (e) {
    return e instanceof Error ? e : new Error(JSON.stringify(e));
  }
});

const createWidgetEnabled = computed(() => {
  return !(widgetConfig.value instanceof Error) && widgetHtml.value;
});

function fileKbSize(bytes) {
  return Math.round(bytes / 100) / 10;
}

function fileSelected(e) {
  const file = e.target.files[0];
  if (!file) {
    statusMessage.value = 'No file selected, please select a file';
    return;
  }

  const fileReader = new FileReader();
  fileReader.addEventListener('progress', (e) => {
    const fraction = e.loaded / e.total;
    const percentage = Math.round(fraction * 1_00_00) / 1_00;
    statusMessage.value = `File selected, loading ... ${ percentage }%`;
  });
  fileReader.addEventListener('loadend', () => {
    const fileContent = String(fileReader.result);
    statusMessage.value = `File loaded (${ fileKbSize(fileContent.length) }KB), ready to create widget`;
    widgetHtml.value = fileContent;
  });
  statusMessage.value = 'File selected, please wait ...';
  widgetHtml.value = undefined;
  fileReader.readAsText(file, 'utf8');
}

async function createWidget() {
  widgetSrcdoc.value = undefined;
  await nextTick();

  const value = widgetHtml.value;
  if (!value) {
    statusMessage.value = 'No widget loaded, please select a file';
  } else {
    statusMessage.value = 'Initializing widget ...';
    widgetSrcdoc.value = value;
    // Widget will send a "vowReadyNotification", see messageListener below
  }
}

function destroyWidget() {
  widgetSrcdoc.value = '';
  statusMessage.value = 'Widget destroyed';
}

onMounted(() => window.addEventListener('message', widgetMessageListener));
onUnmounted(() => window.removeEventListener('message', widgetMessageListener));

function widgetMessageListener(message) {
  if (message.source !== widgetIframe.value.contentWindow) {
    return;
  }

  const event = message.data;
  console.log('Received widget message:', event);
  statusMessage.value = `Received widget message: <code>${ JSON.stringify(event) }</code>`;
  switch (event.type) {
    case 'vowReadyNotification':
      handleReadyNotification(event);
      break;
    case 'vowStateChangedNotification':
      handleStateChangedNotification(event);
      break;
    case 'vowReturnRequested':
      handleReturnRequested(event);
      break;
    default:
      console.warn('Unknown widget event:', event.type);
      break;
  }
}

function handleReadyNotification(event) {
  const initState = widgetState.value;
  const configData = widgetConfig.value;
  if (configData instanceof Error) {
    return;
  }

  const initParameters = Object.entries(configData).map(([key, value]) => ({ key, value: String(value) }));
  sendWidgetMessage({
    type: 'vowStartCommand',
    sessionId: 'dummy-session',
    parameters: initParameters,
    state: initState,
  });
}

function handleStateChangedNotification(event) {
  widgetState.value = event.state;
}

function handleReturnRequested(event) {
  nextTick(() => {
    destroyWidget();
    const { saveState } = event;
    const exitState = widgetState.value;
    statusMessage.value = saveState
      ? `Widget return requested, saved state: <code>${ exitState }</code>`
      : 'Widget return requested, state not saved';
  });
}

function sendWidgetMessage(event) {
  console.log('Sending widget message:', event);
  widgetIframe.value.contentWindow.postMessage(event, '*');
}
</script>

<template>
  <h2>Widget Dummy-Host</h2>
  <div class="widget-status" v-html="statusMessage"></div>
  <div>
    <label>
      Widget HTML File:
      <input type="file" accept="*.html" @change="fileSelected" />
    </label>
  </div>
  <div>
    <button type="button" @click="createWidget" :disabled="!createWidgetEnabled">Create Widget</button>
    <button type="button" @click="destroyWidget" :disabled="!widgetSrcdoc">Destroy Widget</button>
    <input type="text" v-model="widgetConfigJson" style="width: 30rem;" />
    <input type="text" v-model="widgetState" placeholder="Initial state" />
  </div>
  <div v-if="widgetConfig instanceof Error" class="widget-config-error">
    Widget config error: {{ widgetConfig.message }}
  </div>
  <div class="widget-host">
    <iframe ref="widgetIframe" class="widget" width="1096px" height="800px" :srcdoc="widgetSrcdoc"></iframe>
  </div>
</template>

<style scoped>
.widget-status {
  padding: 2px;
  border: 1px solid grey;
  border-radius: 2px;
}

.widget-config-error {
  color: red;
}

.widget-host {
  margin-top: 4px;
}

.widget {
  display: block;
  border: 1px solid grey;
}
</style>
