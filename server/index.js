// Vercel entrypoint. `npm run build` compiles src/ to dist/ first; serving the
// compiled app avoids Vercel re-type-checking the TypeScript with other settings.
export { default } from './dist/main.js'
