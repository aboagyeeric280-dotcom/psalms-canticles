# Deploying

The app lives at **https://aboagyeeric280-dotcom.github.io/psalms-canticles/**
and rebuilds itself. You never zip, extract or flatten anything again.

## Making a change

From this folder, in a terminal:

```bash
git add -A
git commit -m "say what you changed"
git push
```

That is the whole thing. GitHub then installs the dependencies, runs
`npm run build`, and publishes `psalms-app/dist/` to Pages. It takes about a
minute. You can watch it happen under the **Actions** tab of the repository.

## What is committed and what is not

`dist/` is **not** in the repository, on purpose. It is build output: GitHub
makes a fresh one on every push, so there is only ever one version of the
built app and it can never fall out of step with the source. The same goes for
`node_modules/`, the old `psalms-app-dist.zip` and the `test psalm/` folder —
all ignored, all safe to delete from your Downloads whenever you like.

## Why the paths look the way they do

Pages serves the app from a **subfolder** (`/psalms-canticles/`), not from the
root of the domain. So every path in the app has to be written relative —
`./style.css`, never `/style.css` — or the browser looks for it one level too
high and finds nothing.

Three things already take care of this, and none of them should be changed
without knowing why:

- `psalms-app/vite.config.ts` sets `base: './'`, which makes Vite write every
  asset link in the built `index.html` as relative.
- `psalms-app/public/manifest.json` uses `"start_url": "./index.html"`,
  `"scope": "./"` and `"id": "./"`.
- `psalms-app/public/sw.js` precaches relative URLs, and the app registers it
  with `new URL('./sw.js', document.baseURI)`.

If the app ever moves to its own domain, or to a differently-named repository,
all of this keeps working untouched. That is the point of relative paths.

## Checking the service worker after a deploy

Open the site, then in the browser's developer tools look under
Application → Service Workers. You want one worker, **activated**, with a
scope ending in `/psalms-canticles/`. The cache name carries a version hash
that changes on every build, which is how returning users are given the new
version instead of the old cached one.
