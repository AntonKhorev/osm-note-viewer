import fs from 'fs-extra'

// copy files
await fs.remove('dist')
await fs.copy('src/index.html','dist/index.html')
