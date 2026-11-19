import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const machine = vi.hoisted(() => ({ pressureLevel: 1, samplerStarts: 0, profileReads: 0 }))

vi.mock('node:inspector', () => ({
  Session: class {
    connect(): void {}
    disconnect(): void {}
    post(method: string, _params: unknown, callback: (error: null, result: unknown) => void): void {
      if (method === 'HeapProfiler.startSampling') {
        machine.samplerStarts += 1
      }
      if (method === 'HeapProfiler.getSamplingProfile') {
        machine.profileReads += 1
        callback(null, { profile: { head: { callFrame: {}, selfSize: 0, children: [] } } })
        return
      }
      callback(null, {})
    }
  }
}))
vi.mock('@orca/process-host', () => ({
  runProcess: async () => ({
    stdout: `kern.memorystatus_vm_pressure_level: ${machine.pressureLevel}\n`,
    timedOut: false,
    outputTruncated: false
  })
}))
vi.mock('electron', () => ({
  crashReporter: { addExtraParameter: vi.fn(), removeExtraParameter: vi.fn() }
}))
vi.mock('../breadcrumbs/durable-crash-breadcrumb', () => ({
  recordDurableCrashBreadcrumb: vi.fn()
}))
vi.mock('../../worker-threads/worker-thread-entry-path', () => ({
  currentWorkerEntryLayout: () => ({ moduleDir: '/app/out/main' })
}))

const GB = 2 ** 30
const platform = process.platform

// Guards the memory-pressure skip: under swap, a profile read's full GC froze main for 8-43 s.
describe('main heap allocation profile under machine memory pressure', () => {
  beforeEach(() => {
    vi.resetModules()
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    machine.samplerStarts = 0
    machine.profileReads = 0
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: platform })
  })

  async function climbToCageLimit(): Promise<void> {
    const { noteMainCageHeap } = await import('./main-heap-allocation-profile')
    for (const totalGB of [1.2, 1.6, 2.6, 2.6, 3.1]) {
      noteMainCageHeap(totalGB * GB, totalGB * GB)
      await new Promise((resolve) => setImmediate(resolve))
    }
  }

  it('neither starts the sampler nor reads a profile while the machine is under pressure', async () => {
    machine.pressureLevel = 4

    await climbToCageLimit()

    expect(machine.samplerStarts).toBe(0)
    expect(machine.profileReads).toBe(0)
  })

  it('samples and reads the same climb on a healthy machine', async () => {
    machine.pressureLevel = 1

    await climbToCageLimit()

    expect(machine.samplerStarts).toBe(1)
    expect(machine.profileReads).toBe(2)
  })
})
