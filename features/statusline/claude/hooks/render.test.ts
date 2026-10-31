import { expect, test } from 'claude-code/testing'
import type { Segment } from '../types'

const ROWS: Segment[][] = [
  [{ text: '~/app', color: '#89b4fa' }, { text: ' │ ' }, { text: 'Commits:2' }],
  [{ text: '30D $2.50', color: '#f5c2e7' }, { text: ' │ ' }, { text: 'Resets at 11.50', color: '#a6adc8', italic: true }],
]

for (const surface of ['terminal', 'desktop'] as const) {
  test(`draws the rows under the hint line on ${surface}`, async ($, on) => {
    on('state.get', () => ({ value: { value: ROWS, version: 1 } }) as never)
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['? for shortcuts'] }) as never)

    const mounted = await $.ui.mount({
      plugin: 'statusline',
      surface,
      component: 'PromptHint',
      props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
    })
    const drawn: string = JSON.stringify(await mounted.drawn())
    expect(drawn).toContain('? for shortcuts')
    expect(drawn).toContain('Commits:2')
    expect(drawn).toContain('#f5c2e7')
  })
}

test('still draws the hint line when state holds the old plain-string rows', async ($, on) => {
  on('state.get', () => ({ value: { value: ['old row one', 'old row two'], version: 1 } }) as never)
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['? for shortcuts'] }) as never)

  const mounted = await $.ui.mount({
    plugin: 'statusline',
    surface: 'terminal',
    component: 'PromptHint',
    props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  })
  expect(JSON.stringify(await mounted.drawn())).toContain('? for shortcuts')
})
