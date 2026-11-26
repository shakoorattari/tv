# Strand TV project memory

**Release snapshot · 26 November 2026.** The web library and signed Android TV installer are live. The Android app loads the same production library as the browser. GitHub Actions built, linted, signed and published the package. The downloaded APK matched the release certificate. Installation, remote navigation and playback on a physical TV still need a device test.

| Start here | Location |
|---|---|
| Production web app and editor | [Strand TV](https://shakoorattari.com/tv/) · [Studio](https://shakoorattari.com/tv/#studio) |
| Android TV installer | [Signed APK](https://shakoorattari.com/tv/strand-tv.apk), also in the website footer |
| Source and ownership | [shakoorattari/tv](https://github.com/shakoorattari/tv), public, MIT-licensed application code. Media and provider thumbnails retain their owners’ terms. |
| Last verified production revision | [a697247](https://github.com/shakoorattari/tv/commit/a697247), [successful build and deployment](https://github.com/shakoorattari/tv/actions/runs/45861769712) |
| Engineering references | [Development guide](DEVELOPMENT.md) · [Release and recovery](RELEASE.md) · [Android build and installation](../android/README.md) |

## Product and editorial decisions

The original goal was a lightweight, attractive library for the living room, with a practical way for an administrator to enter links on a computer. The first release uses HTML, CSS and JavaScript with no frontend build dependency. Video stays at its original host. The web editor and TV launcher share a catalogue format. GitHub Pages hosts the primary app under the same domain as the IELTS project.

- **Discover and Library** offer a featured title, category filters, visible focus, directional navigation and a player. Direct MP4 and WebM files use browser controls. YouTube videos and playlists use the provider player and request autoplay on selection. Browser and provider settings determine whether a second click is needed. Drive uses file preview for supported links. OneDrive and generic HTTPS links open at the provider.
- **Studio** supports adding, editing and removing videos and categories. Category renames update assigned videos. Paste a YouTube URL to preview its thumbnail and import available metadata. Editors can change the title, description or artwork. The private Sites preview introduced a Worker lookup endpoint. Production Pages is static and can use a referrer-restricted YouTube Data API browser key for descriptions. Without it, oEmbed supplies available titles, and the editor supports manual descriptions.
- **Catalogue and people.** Browser storage is the default. Existing device libraries receive the kids collection through the seed migration. An existing shared Firestore catalogue is separately administered. Viewer profiles can be created, renamed, switched and removed on the device. Optional Firebase email/password sign-in and a Firestore admin allowlist control shared edits. Cross-device user management in Studio remains future work.
- **Collections.** The initial sample library contained Spring, Big Buck Bunny and A moment in bloom. Six selections came from three requested channels, two from each. The Hamza 6 kalmay import captured all seven entries then listed, in source order, plus a full-playlist player card. Individual entries are a snapshot; opening the playlist uses YouTube’s current list. [Kids Madani Channel](https://www.youtube.com/channel/UCsNSt0fxMniSH9XHaNneZfw) · [Hamza Cartoon World](https://www.youtube.com/@HamzaCartoon-World) · [Happy Planet](https://www.youtube.com/@HappyPlanetOfficial) · [Hamza 6 kalmay](https://www.youtube.com/playlist?list=PLPZvgDQ8_pLw)

## How the release evolved

| Milestone | Decision and outcome |
|---|---|
| Web pilot | A private Sites preview and a portable static ZIP allowed early testing. A second click on the YouTube thumbnail led to autoplay support. Requests for usable cover art led to URL-first metadata import and editable previews. |
| Source and hosting | Source moved into GitHub. The account plan required a public repository for Pages. The owner chose public source, protected main, owner approval, MIT licensing and a main-only Pages environment. The IELTS setup was the reference. [PR 1](https://github.com/shakoorattari/tv/pull/1) |
| TV distribution | A landscape Android launcher opens the production URL using System WebView. It supports a D-pad, fullscreen, Back and external-provider handoff. The website distributes the signed APK directly. CI produces a separate debug preview package for PRs. [PR 2](https://github.com/shakoorattari/tv/pull/2) |
| Dependency failure | Shared runners received HTTP 429 from Maven Central while resolving Android Gradle plugin dependencies. Google’s Maven Central mirror was added for plugin and application resolution. The next main build compiled and linted successfully. [PR 3](https://github.com/shakoorattari/tv/pull/3) |
| Signing and first verified download | Deployment stopped at apksigner because the release keystore and password were absent. The owner authorized a long-lived signing identity, an ignored local backup and main-only GitHub environment secrets. Rerunning the failed deploy job published the APK. The footer link, archive integrity and certificate fingerprint were verified against the live download. |

## Next work to assign

| Owner | Next deliverable | Acceptance test |
|---|---|---|
| TV / QA | Physical-device smoke test | Install from the footer download. Launch from the TV home screen. Browse using only the remote, play a direct file and a YouTube video, enter/exit fullscreen, press Back, test a failed connection and update over a previously installed release. Record Android and WebView versions. |
| Catalogue / identity | Decide whether to enable the shared catalogue and authenticated user administration | Verify a published edit on a second device and denied reads/writes where ownership rules require them. Privileged account creation and removal belong in a trusted backend. |
| Playback / editorial | Exercise Drive and OneDrive permissions and broken-link handling | Test signed-in and signed-out viewers, unavailable media and return to the original title. Check metadata lookup on the production domain with the intended key configuration. |
| Personal library | Local playlists first, then opt-in history and resume | Ordered playlists survive restart. Retired video IDs have a useful display. Resume direct media from a saved position and allow history deletion. For a provider handoff, distinguish opening a title from verified viewing. |
| Cloud integrations | Google sign-in, private Drive selection and optional sync | Request Drive consent separately, limit access to the selected files, support disconnect and keep each user's private selections isolated. |
| Native playback | Evaluate Compose for TV and Media3 after real-device testing | Identify a measured WebView limitation and verify native playback and focus restoration on a representative TV before replacing the current route. |

For future changes, start with current main, keep each change reviewable, and obtain the owner’s PR approval. Update this memory when a feature ships, an operational decision changes, or a device test closes an open item.
