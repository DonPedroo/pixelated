# GitHub Pages Deployment Fixes

This document details the changes made to ensure the project correctly builds and deploys to GitHub Pages.

## 1. Vite Configuration (`vite.config.js`)
Added a `base` property to the Vite configuration. Without this, assets (JS, CSS, images) would attempt to load from the root domain (e.g., `donpedroo.github.io/`) instead of the project subfolder (`donpedroo.github.io/pixelated/`).

```javascript
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/pixelated/',
})
```

## 2. GitHub Actions Workflow (`.github/workflows/deploy.yml`)
Implemented an automated deployment pipeline. This workflow triggers on every push to the `main` branch, handles the build process, and uploads the `dist` directory to GitHub Pages.

**Key highlights:**
- Uses Node.js 20.
- Runs `npm ci` for clean dependency installation.
- Runs `npm run build` to generate the production-ready assets.
- Automatically handles the `pages` deployment permissions.

## 3. Production Stability & Minification Fixes
Several "silent" errors that only appeared in the production/minified build were addressed:

- **Optional Chaining**: Added `?.` to calls like `this.gradientEffect?.updateTexture()`. This prevents the application from crashing if a theme or effect is still initializing during a render loop or GUI update.
- **Uniform Initialization**: Ensured uniforms were correctly defaulted and checked for `undefined` before assignment to avoid `TypeError: Cannot read properties of undefined (reading 'value')`.
- **Static IDs**: Added `static id` to effect classes (e.g., `static id = 'TestGradient'`) to maintain consistency across builds where class names might be mangled by minifiers.

## 4. Repository Cleanup
- Removed temporary `gh-pages` package scripts from `package.json` in favor of the cleaner GitHub Actions approach.
- Verified all asset paths in `src/index.js` and `src/ref/` are compatible with the production build structure.
