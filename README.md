# build-and-preview

## install
```bash
pnpm add @yanhao98/build-and-preview -D
```

## usage
package.json
``` json
{
  "name": "project-name",
  "scripts": {
    "build": "your-build-script",
    "build-and-preview": "build-and-preview --port 3000 --build-script build",
  }
}
```
