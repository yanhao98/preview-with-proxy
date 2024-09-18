# dev-and-preview

## usage
```ini
# .env.preview
VITE_PREVIEW_PORT=3000
VITE_PREVIEW_PROXY=[['/api','https://your-api-server.com']]
VITE_PREVIEW_BUILD_SCRIPT=build-only
```

```bash
bunx dev-and-preview
```

---
- https://github.com/bahmutov/start-server-and-test
