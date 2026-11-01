# WeChat mini-program integration (Phase 2)

Phase 1 ships the web application. This document defines how the same product
can be delivered as a WeChat mini-program **without rewriting the physics**.
No mini-program has been published and no WeChat credentials are required for
Phase 1.

## Two viable routes

### Route A — `web-view` shell (recommended first step)

A minimal mini-program page hosts the existing web build in a `<web-view>`.

- Reuse: the entire React application, renderer, solver and reasoning engine.
- Work: business-domain registration, HTTPS, review, and a thin shell.
- Limits: `web-view` only loads pages whose domain is configured as a business
  domain; it cannot be used for every category without qualification; some
  APIs (camera, payments) are unavailable inside the web-view.

### Route B — native mini-program UI + shared core

Replace the renderer and platform layer, keep the engines:

```
circuit-core  +  physics-engine  +  reasoning-engine  +  teaching-engine
                              │
              canvas 2D renderer (wx.createCanvasContext / Skyline)
              platform-adapters → WeChatStorage / WeChatShare / WeChatExport
```

- Reuse: the shared `CircuitDocument`, MNA solver, reasoning rules, experiments,
  guided content.
- Work: a canvas renderer and a mini-program UI layer. The existing package
  boundaries make this a port, not a rewrite.
- This is why `physics-engine` is DOM-free and `circuit-core` is framework-free.

## Domain and qualification requirements

- The mini-program `web-view` requires an **HTTPS** URL on a domain registered in
  the mini-program’s **business domain** list.
- `github.io` **must not** be assumed to work: it is a third-party host, cannot be
  verified as your business domain for a production mini-program, and is not
  normally accepted during review. Plan for an owned domain such as
  `https://lab.example.com/`.
- In mainland China, a domain used as a business domain generally needs ICP
  filing (备案) and the mini-program needs a verified subject (企业/个体工商户).
  Personal-account mini-programs have additional restrictions, and some
  categories cannot use `web-view` at all.
- The mini-program must be registered in the WeChat public platform and the
  developer must be added as a member before uploading.

## Configuration, not hard-coding

The web build already separates the public path from the code:

```bash
# GitHub Pages
VITE_BASE_PATH=/circuitlab-alevel/ pnpm build

# custom domain (recommended for WeChat)
VITE_BASE_PATH=/ pnpm build
```

API, asset and public base URLs are build-time configuration. No core package
contains a `github.io` URL. `apps/wechat/miniprogram/config.js` holds the shell’s
single URL constant for the `web-view` route.

## Platform adapters

`packages/platform-adapters` exposes five interfaces with real web
implementations and WeChat implementations guarded by capability detection:

| Interface | Web | WeChat |
| --- | --- | --- |
| `StorageAdapter` | IndexedDB, localStorage fallback | `wx.getStorageSync` / `wx.setStorageSync` |
| `ShareAdapter` | Web Share API / clipboard | `wx.shareAppMessage` (page `onShareAppMessage`) |
| `ExportAdapter` | Blob download | `wx.getFileSystemManager().writeFileSync` + `wx.openDocument` |
| `NavigationAdapter` | `window.open`, file input | `wx.navigateTo` |
| `PlatformInfoAdapter` | `navigator`, safe area 0 | `wx.getWindowInfo().safeArea` |

`detectPlatform()` checks for a global `wx` object; `getAdapters()` returns the
matching set. The React app only ever talks to these interfaces.

## The scaffold in `apps/wechat`

```
apps/wechat/
  project.config.json          WeChat DevTools project (appid placeholder)
  miniprogram/
    app.js / app.json / app.wxss
    config.js                  PUBLIC_WEB_URL (set to your HTTPS domain)
    pages/index/index.*        web-view shell
```

The shell is intentionally small and marked **not published**. It is untested
against a real appid; it exists to make the integration path concrete.

### Testing in WeChat DevTools

1. Open WeChat DevTools → Import project → `apps/wechat`.
2. Enter a test appid (or use “test account”).
3. In Details → Local settings, enable “Do not verify valid domain names,
   HTTPS certificates…”. This is required for `web-view` in the simulator only.
4. Set `PUBLIC_WEB_URL` in `config.js` to a reachable HTTPS deployment.
5. Verify touch wiring, pinch zoom, safe-area insets and storage.

Production review requires the real business domain and will reject the
“ignore domain check” setting.

## Touch behaviour already implemented for Phase 2

- Tap a terminal, then another terminal, to create a wire (no precision drag).
- One finger on empty canvas pans; two fingers pinch-zoom around the midpoint.
- Tapping a component on a phone opens the properties sheet.
- Bottom sheets respect `env(safe-area-inset-bottom)`.
- Layout switches at 900 px; a single WebGL canvas is mounted (no hidden
  duplicate contexts).

## Release steps (not executed in Phase 1)

1. Register the mini-program; add developer members.
2. Register the business domain (owned HTTPS + ICP if applicable).
3. Deploy the web build to that domain with `VITE_BASE_PATH=/`.
4. Optionally ship the `web-view` shell, or start the native renderer port.
5. Upload via WeChat DevTools, submit for review, release.
6. For Native route B: add a WeChat canvas renderer consuming
   `@circuitlab/circuit-renderer` draw primitives and the same solver.

## Risks

- `web-view` category restrictions may block Route A for an education app;
  Route B remains possible because the engines are platform-free.
- `github.io` is not a viable production business domain.
- WeChat storage is small (≈10 MB per program); the current documents are a few
  kilobytes each.
- Native canvas text metrics differ from PixiJS; labels need re-measuring.
