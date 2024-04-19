type CancelAnimationFrame = (handle: number) => void
type RequestAnimationFrame = (callback: (time: number) => void) => number

export enum TypeAction {
  FrameBegin,
  FrameUpdate,
  FrameDraw,
  FrameEnd
}

interface ActionFrameBegin {
  frameDelta: number
  timestamp: number
  type: TypeAction.FrameBegin
}

interface ActionFrameUpdate {
  timestep: number
  type: TypeAction.FrameUpdate
}

interface ActionFrameDraw {
  delta: number
  panic: boolean
  type: TypeAction.FrameDraw
}

interface ActionFrameEnd {
  panic: boolean
  type: TypeAction.FrameEnd
}

export type Action =
  | ActionFrameBegin
  | ActionFrameDraw
  | ActionFrameEnd
  | ActionFrameUpdate

export type Unsubscribe = () => void
export type Subscription = (action: Action) => void

interface Options {
  cancelAnimationFrame: CancelAnimationFrame
  fps: number
  requestAnimationFrame: RequestAnimationFrame
  timestep: number
}

// Four seconds
const calculateMaxUpdateSteps = (timestep: number) =>
  Math.round(4000 / timestep)

const createState = (options: Partial<Pick<Options, 'fps' | 'timestep'>>) => {
  // An exponential moving average of the frames per second.
  const fps = 0

  // The amount of time (in milliseconds) to simulate each time update()
  // runs
  const timestep = options.timestep ?? 1000 / 60

  // The cumulative amount of in-app time that hasn't been simulated yet.
  const frameDelta = 0

  // The timestamp in milliseconds of the last time the main loop was run.
  const lastFrameTime = 0

  // A factor that affects how heavily to weight more recent seconds'
  // performance when calculating the average frames per second. Valid values
  // range from zero to one inclusive. Higher values result in weighting more
  // recent seconds more heavily.
  const fpsAlpha = 0.9

  // The minimum duration between updates to the frames-per-second estimate.
  // Higher values increase accuracy, but result in slower updates.
  const fpsUpdateInterval = 1000

  // The timestamp (in milliseconds) of the last time the `fps` moving
  // average was updated.
  const lastFpsUpdate = 0

  // The number of frames delivered since the last time the `fps` moving
  // average was updated (i.e. since `lastFpsUpdate`).
  const framesSinceLastFpsUpdate = 0

  // The number of times update() is called in a given frame. This is only
  // relevant inside of animate(), but a reference is held externally so that
  // this variable is not marked for garbage collection every time the main
  // loop runs.
  const numberUpdateSteps = 0
  const maxUpdateSteps = calculateMaxUpdateSteps(timestep)

  // The minimum amount of time in milliseconds that must pass since the last
  // frame was executed before another frame can be executed.
  const minDrawDelay = 1000 / (options.fps ?? Infinity)

  const lastDrawTime = 0

  const isActive = false

  // Whether the simulation has fallen too far behind real time.
  // Specifically, `panic` will be set to `true` if too many updates occur in
  // one frame. This is only relevant inside of animate(), but a reference is
  // held externally so that this variable is not marked for garbage
  // collection every time the main loop runs.
  const panic = false

  // The ID of the currently executing frame. Used to cancel frames when
  // stopping the loop.
  const rafHandle = 0

  return {
    fps,
    fpsAlpha,
    fpsUpdateInterval,
    frameDelta,
    framesSinceLastFpsUpdate,
    isActive,
    lastDrawTime,
    lastFpsUpdate,
    lastFrameTime,
    maxUpdateSteps,
    minDrawDelay,
    numUpdateSteps: numberUpdateSteps,
    panic,
    rafHandle,
    timestep
  }
}

export const snaproll = (options: Partial<Options> = {}) => {
  let state = createState(options)

  const subscriptions = new Set<Subscription>()

  const multiplexer = (action: Action) => {
    subscriptions.forEach((value) => value(action))
  }

  const _requestAnimationFrame: RequestAnimationFrame =
    options.requestAnimationFrame ?? requestAnimationFrame

  const _cancelAnimationFrame: CancelAnimationFrame =
    options.cancelAnimationFrame ?? cancelAnimationFrame

  const resume = () => {
    if (!state.isActive) {
      state.isActive = true

      state.rafHandle = _requestAnimationFrame((timestamp) => {
        state.lastFrameTime = timestamp
        state.lastFpsUpdate = timestamp
        state.lastDrawTime = timestamp
        state.framesSinceLastFpsUpdate = 0

        state.rafHandle = _requestAnimationFrame(animate)
      })
    }
  }

  const pause = () => {
    state.isActive = false
    _cancelAnimationFrame(state.rafHandle)
  }

  const animate = (timestamp: number) => {
    state.rafHandle = _requestAnimationFrame(animate)

    // if (state.lastFrameTime > timestamp) {
    //   return
    // }

    state.frameDelta += timestamp - state.lastFrameTime
    state.lastFrameTime = timestamp

    multiplexer({
      frameDelta: state.frameDelta,
      timestamp,
      type: TypeAction.FrameBegin
    })

    state.numUpdateSteps = 0

    while (state.frameDelta >= state.timestep) {
      multiplexer({ timestep: state.timestep, type: TypeAction.FrameUpdate })
      state.frameDelta -= state.timestep

      // 4 seconds
      if (++state.numUpdateSteps >= state.maxUpdateSteps) {
        state.panic = true
        break
      }
    }

    const drawDelta = timestamp - state.lastDrawTime

    if (drawDelta >= state.minDrawDelay) {
      state.lastDrawTime =
        timestamp -
        (state.minDrawDelay === 0 ? 0 : drawDelta % state.minDrawDelay)

      if (timestamp > state.lastFpsUpdate + state.fpsUpdateInterval) {
        state.fps =
          (state.fpsAlpha * state.framesSinceLastFpsUpdate * 1000) /
            (timestamp - state.lastFpsUpdate) +
          (1 - state.fpsAlpha) * state.fps

        state.lastFpsUpdate = timestamp
        state.framesSinceLastFpsUpdate = 0
      }

      state.framesSinceLastFpsUpdate++

      multiplexer({
        delta: state.frameDelta / state.timestep,
        panic: state.panic,
        type: TypeAction.FrameDraw
      })
    }

    // Run any updates that are not dependent on time in the simulation.
    multiplexer({
      panic: state.panic,
      type: TypeAction.FrameEnd
    })

    state.panic = false
  }

  return {
    get fps() {
      return state.fps
    },
    set fps(value: number) {
      if (value <= 0) {
        pause()
      } else {
        // Dividing by Infinity returns zero.
        state.minDrawDelay = 1000 / value
      }
    },
    get isActive() {
      return state.isActive
    },
    pause,
    reset(options: Partial<Pick<Options, 'fps' | 'timestep'>>) {
      pause()

      // preserve the options
      state = createState({
        fps: options.fps ?? 1000 / state.minDrawDelay,
        timestep: options.timestep ?? state.timestep
      })
    },
    resetFrameDelta() {
      const oldFrameDelta = state.frameDelta
      state.frameDelta = 0

      // The cumulative amount of elapsed time in milliseconds that has not yet
      // been simulated, but is being discarded as a result of calling this
      // function.
      return oldFrameDelta
    },
    resume,
    subscribe(value: Subscription): Unsubscribe {
      subscriptions.add(value)

      return () => {
        subscriptions.delete(value)
      }
    },
    // How many milliseconds should be simulated by every update.
    get timestep() {
      return state.timestep
    },
    // How many milliseconds should be simulated by every update.
    set timestep(value: number) {
      state.timestep = value
      state.maxUpdateSteps = calculateMaxUpdateSteps(value)
    },
    unsubscribe(value: Subscription) {
      subscriptions.delete(value)
    }
  }
}
