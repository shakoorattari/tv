# Strand TV
A lightweight TV-friendly video library with a browser-based editor and optional Google profiles with Firebase library sync. The Offline page saves compatible direct videos on each device. Library titles automatically keep their cover artwork for offline browsing.

Serve the dist directory with `python3 -m http.server 8080 --directory dist`, then open http://localhost:8080/. Deploy the contents of dist under /tv/ on a static host. See [the development guide](docs/DEVELOPMENT.md) for Firebase setup, Android TV architecture and deployment options.

Channel selections and the seven videos listed by the Hamza 6 kalmay playlist are in dist/kids-catalog.js. The full-playlist card opens YouTube's playlist player. The bundled update merges into existing device libraries, preserving edits. Firebase administrators with a previously saved shared catalogue can add entries in Studio.

## Project documentation

[Project memory and roadmap](docs/PROJECT-MEMORY.md) · [Architecture and Firebase](docs/DEVELOPMENT.md) · [Release, versions and recovery](docs/RELEASE.md) · [Changelog](dist/changelog.json) (also on the app's About page) · [Signed Android TV installer](https://shakoorattari.com/tv/strand-tv.apk)

## YouTube previews in Studio

Paste a watch, short, live, embed or youtu.be video URL. The editor previews the YouTube thumbnail and fills available title and description fields. You can edit the text or select local artwork. Existing titles and descriptions are preserved on opening Edit.

The hosted Worker serves the web app and its same-origin /api/youtube metadata endpoint. Build it with `node worker/build.mjs` and deploy the generated `dist/server/index.js` as a module Worker. On static-only GitHub Pages or a simple file server, set STRAND_YOUTUBE_API_KEY in dist/config.js to a browser key restricted to your domain and YouTube Data API v3 to retrieve descriptions. Without that key or a metadata backend, the static app uses YouTube oEmbed for titles and still previews the thumbnail. Private, removed or unavailable videos can be entered manually.

## GitHub Pages deployment

Push to main to build and publish. Pull requests validate the static client. In Settings → Pages, choose GitHub Actions as the source. The project inherits the account site's custom domain at /tv/.

For channel updates and full YouTube description lookup on Pages, set the GitHub Actions repository secret `STRAND_YOUTUBE_API_KEY`. The production workflow injects it into the published browser configuration, where visitors can see it. Restrict the key to YouTube Data API v3 and the production site’s origin. For localhost testing, use a separate key restricted to your local origin and keep local credentials out of commits.

Changes to main require a pull request approved by @shakoorattari. New commits dismiss stale approvals. Only a push to main can publish.

## License

The Strand TV application code is available under the [MIT License](LICENSE). Linked videos, provider thumbnails, and third-party brands are subject to their respective owners’ terms.
