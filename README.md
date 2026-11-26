# Strand TV
A lightweight TV-friendly video library with a browser-based editor and optional Firebase catalogue.

Serve the dist directory with `python3 -m http.server 8080 --directory dist`, then open http://localhost:8080/. Deploy the contents of dist under /tv/ on a static host. See [the development guide](DEVELOPMENT.md) for Firebase setup, Android TV architecture and deployment options.

Channel selections and the seven videos listed by the Hamza 6 kalmay playlist are in dist/kids-catalog.js. The full-playlist card opens YouTube's playlist player. The bundled update merges into existing device libraries, preserving edits. Firebase administrators with a previously saved shared catalogue can add entries in Studio.

## YouTube previews in Studio

Paste a watch, short, live, embed or youtu.be video URL. The editor previews the YouTube thumbnail and fills available title and description fields. You can edit the text or select local artwork. Existing titles and descriptions are preserved on opening Edit.

The hosted Worker serves the web app and its same-origin /api/youtube metadata endpoint. Build it with `node worker/build.mjs` and deploy the generated `dist/server/index.js` as a module Worker. On static-only GitHub Pages or a simple file server, set STRAND_YOUTUBE_API_KEY in dist/config.js to a browser key restricted to your domain and YouTube Data API v3 to retrieve descriptions. Without that key or a metadata backend, the static app uses YouTube oEmbed for titles and still previews the thumbnail. Private, removed or unavailable videos can be entered manually.
