# CircuitLab Physics — WeChat mini-program (Phase 2 scaffold)

**Status: scaffold only. Nothing here has been published, reviewed or tested
against a real mini-program appid.**

This directory contains the thin `web-view` shell (Route A) described in
[`docs/wechat-mini-program.md`](../../docs/wechat-mini-program.md). It loads the
existing web build, so it reuses the entire physics/reasoning stack without
duplication.

## Files

```
project.config.json          WeChat DevTools project (appid: touristappid)
miniprogram/app.js           lifecycle + update manager
miniprogram/config.js        the single PUBLIC_WEB_URL constant
miniprogram/pages/index/     web-view page + share handler
```

## Before release

1. Replace `touristappid` with the registered mini-program appid.
2. Replace `PUBLIC_WEB_URL` with an owned HTTPS domain and register it as a
   **business domain** in the WeChat public platform.
3. Deploy the web build to that domain (`VITE_BASE_PATH=/`).
4. Remove “ignore domain check” in DevTools; it is for local testing only.
5. Submit for review (some education categories restrict `web-view`).

## Route B (native renderer)

The shared packages are designed for a native port:

- `@circuitlab/circuit-core` — model, topology and hit testing (no DOM)
- `@circuitlab/physics-engine` — MNA solver (no DOM)
- `@circuitlab/reasoning-engine` — verified causal chains (no DOM)
- `@circuitlab/teaching-engine` — experiments and guided content
- `@circuitlab/platform-adapters` — `WeChatStorage`, `WeChatShare`, export and
  navigation implementations behind the same interfaces as the web

A native route would add a canvas renderer implementing the same drawing
primitives as `packages/circuit-renderer/src/drawing.ts`, and a mini-program
page layer. It would not touch the solver.

## Local smoke test

Open this folder in WeChat DevTools, enable “do not verify valid domain names /
HTTPS certificates” under Details → Local settings, and point `config.js` at a
reachable HTTPS deployment. A packaged WeChat build of the web app is not
committed.
