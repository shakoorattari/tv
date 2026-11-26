# Strand TV
A lightweight TV-friendly video library with a browser-based editor and optional Firebase catalogue.

Serve the dist directory with `python3 -m http.server 8080 --directory dist`, then open http://localhost:8080/. Deploy the contents of dist under /tv/ on a static host. See [the development guide](DEVELOPMENT.md) for Firebase setup, Android TV architecture and deployment options.

Channel selections and the seven videos listed by the Hamza 6 kalmay playlist are in dist/kids-catalog.js. The full-playlist card opens YouTube's playlist player. The bundled update merges into existing device libraries, preserving edits. Firebase administrators with a previously saved shared catalogue can add entries in Studio.
