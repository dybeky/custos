// Vite turns an imported asset into its URL.
declare module '*.wav' {
  const url: string
  export default url
}
declare module '*.mp3' {
  const url: string
  export default url
}
