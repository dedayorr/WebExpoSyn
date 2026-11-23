import { createApp } from './createApp.js'
import { config } from './config.js'

const app = createApp()

// On Vercel the platform serves the exported app; locally we listen on a port.
if (!process.env.VERCEL) {
  app.listen(config.PORT, () => {
    console.log(`WebExpoSyn API listening on http://localhost:${config.PORT}`)
    console.log(`Allowed origins: ${config.corsOrigins.join(', ')}`)
  })
}

export default app
