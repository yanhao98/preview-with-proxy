import chalk from "chalk";
import { execaCommand, ExecaError } from "execa";
import { loadEnv, preview, type PreviewServer ,version} from "vite";
import { name } from "./package.json" with { type: "json" };
import { oraPromise } from "ora";
import { createViteProxy } from "utils4u/vite";

const nameLog = chalk.green(`[${name}]`)

function log(...args: any[]) {
  console.log(nameLog, ...args);
}
log("vite:", version);

let previewServer: PreviewServer | null = null;
let buildPromise: ReturnType<typeof execaCommand> | null = null;

process.once("SIGTERM", () => {
  log("once SIGTERM", `${chalk.red("未处理")}`);
});

process.on("exit", () => {
  log("on exit");
  previewServer?.close();
  buildPromise?.kill();
});

const env = loadEnv("preview", process.cwd(), "VITE_PREVIEW");
const previewProxyStr = env.VITE_PREVIEW_PROXY;
const previewPort = env.VITE_PREVIEW_PORT;
const buildScript = env.VITE_PREVIEW_BUILD_SCRIPT;
for (const key in env) {
  log(key.replaceAll("VITE_PREVIEW_", ""), env[key]);
}


async function runBuild() {
  buildPromise?.kill();
  buildPromise = execaCommand(`npm run ${buildScript}`, {
    stdio: "pipe",
  });
  await oraPromise(buildPromise, {
    text: `正在执行构建命令: ${chalk.cyan(buildScript)}`,
    successText: `${chalk.green("预览资产构建完成，开始预览服务")}`,
    failText(error) {
      if (error instanceof ExecaError && error.isTerminated) {
        return `${chalk.red("构建被终止")}`;
      }
      return `${chalk.red("构建失败")}: ${error.message}`;
    },
    prefixText: () => `[${new Date().toLocaleTimeString()}]`,
  }).catch((error: unknown) => { });
}


async function runPreview() {
  const proxy = createViteProxy(previewProxyStr);

  // https://vitejs.dev/guide/api-javascript.html#preview
  await previewServer?.close();
  if (Object.keys(proxy).length === 0) {
    console.log(chalk.yellow("未提供代理配置"));
  }
  for (const [path, target] of Object.entries(proxy)) {
    console.log(`预览服务代理: ${path} -> ${target.target}`);
  }

  previewServer = await preview({
    // configFile: false,
    preview: {
      port: Number(previewPort),
      strictPort: true,
      host: true,
      proxy,
    },
  });
  // previewServer.bindCLIShortcuts({ print: true });
  // previewServer.resolvedUrls?.local
  console.log(`预览服务地址: ${previewServer.resolvedUrls?.local}`);
  // previewServer.printUrls();
}

runBuild().then(runPreview)