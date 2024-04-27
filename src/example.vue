<template>
  <div>
    <div class="fps">
      {{ fps }}
    </div>
    <div clas="container">
      <div v-for="box in boxes" :key="box.id" ref="boxRefs" class="box"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { snaproll, Subscription, TypeAction } from '.'
import { range } from 'lodash-es'

const loop = snaproll({ fps: 30 })
const boxRefs = ref<HTMLElement[]>([])
const fps = ref('0')

const lambda = 0.5
function lerp(v0: number, v1: number, t: number) {
  return v0 * (1 - t) + v1 * t
}

const boxes = range(100).map((_, index) => {
  const width = 5
  const limit = 100 - width
  const position = Math.random() * limit
  const velocity = Math.random() / 50

  const box = {
    index,
    id: `box${index}`,
    lastPosition: position,
    limit,
    position,
    velocity
  }

  const subscription: Subscription = (action) => {
    const element = boxRefs.value[box.index]

    switch (action.type) {
      case TypeAction.FrameUpdate:
        box.lastPosition = box.position
        box.position += box.velocity * action.timestep
        // Switch directions if we go too far
        if (box.position >= box.limit || box.position <= 0)
          box.velocity = -box.velocity
        break
      case TypeAction.FrameDraw:
        element.style.left = `${lerp(
          box.lastPosition,
          box.position,
          1 - Math.exp(-lambda * action.delta)
        )}vw`

        break
      case TypeAction.FrameEnd:
        if (action.panic) {
          console.log('Panic!')
        }
    }
  }

  loop.subscribe(subscription)

  return box
})

loop.subscribe((action) => {
  if (action.type === TypeAction.FrameEnd) {
    fps.value = loop.fps.toFixed(2)
  }
})

onMounted(() => {
  loop.resume()

  window.snap = loop
})
</script>

<style>
* {
  overflow-x: hidden;
  margin: 0;
  padding: 0;
}

.container {
  width: 100vw;
  height: 100vh;
  scroll-behavior: none;
}

.fps {
  font-kerning: none;
  position: fixed;
  margin-top: 5vw;
  margin-bottom: 5vw;
  margin-right: 5vw;
  margin-left: 5vw;
  top: 2vw;
  right: 2vw;
  text-align: right;
  font-weight: 300;
  font-size: 5vw;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}

.box {
  z-index: -1;
  position: relative;
  background-color: navy;
  height: 4.9vw;
  margin-bottom: 0.05vw;
  margin-top: 0.05vw;
  margin-left: 0.05vw;
  margin-right: 0.05vw;
  width: 4.9vw;
}
</style>
