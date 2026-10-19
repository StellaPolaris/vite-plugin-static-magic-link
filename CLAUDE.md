# vite-plugin-static-magic-link

Read `SPEC.md` before any work. It is the decided design for v1.3.1: API, file
format, hook strategy, bootstrap source, repo layout, tests, and the ordered build
plan. Tick off build-plan items in `SPEC.md` as they land.

- ESM only, Node 20+, Vite >= 8 peer. No dependencies beyond devDependencies.
- Do not reintroduce a service worker; the reasons are in SPEC.md section 2.
- Keep the bootstrap dependency-free and under ~2 KB.
