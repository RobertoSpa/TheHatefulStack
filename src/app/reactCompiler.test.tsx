import { Profiler, type ProfilerOnRenderCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'

const phases: string[] = []

const recordPhase: ProfilerOnRenderCallback = (_id, phase) => {
  phases.push(phase)
}

const Label = ({ text }: { readonly text: string }) => <p>{text}</p>

const Counter = () => {
  const [clicks, setClicks] = useState(0)

  return (
    <>
      <button
        onClick={() => {
          setClicks(clicks + 1)
        }}
        type="button"
      >
        Clicks {clicks}
      </button>
      <Profiler
        id="label"
        onRender={recordPhase}
      >
        <Label text="fixed" />
      </Profiler>
    </>
  )
}

it('skips the render of a child whose props did not change', async () => {
  const host = document.createElement('div')

  document.body.append(host)
  createRoot(host).render(<Counter />)
  await expect.poll(() => host.textContent).toBe('Clicks 0fixed')

  host.querySelector('button')?.click()
  await expect.poll(() => host.textContent).toBe('Clicks 1fixed')

  expect(phases).toStrictEqual(['mount'])
})
