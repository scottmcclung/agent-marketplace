// One run of text in a single style. `color` is a hex string such as `#89b4fa`.
export type Segment = { text: string; color?: string; italic?: boolean }

// The status rows drawn under the prompt's hint line, top row first.
export type StatusRows = Segment[][]

declare module 'claude-code' {
  interface PluginState {
    statusline: { lines: StatusRows }
  }
}
