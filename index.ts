import chalk from "chalk";
import { execaCommand, ExecaError } from "execa";
import readline from "node:readline";
import { oraPromise } from "ora";
import { createViteProxy } from "utils4u";
import { loadEnv, preview, type PreviewServer } from "vite";

let previewServer: PreviewServer | null = null;
let buildPromise: ReturnType<typeof execaCommand> | null = null;
let devPromise: ReturnType<typeof execaCommand> | null = null;

// process.once('SIGTERM'
process.on("exit", () => {
  console.log("退出。");
  previewServer?.close();
  buildPromise?.kill();
  devPromise?.kill();
});

// https://github.com/SBoudrias/Inquirer.js
// https://github.com/enquirer/enquirer
import Enquirer from "enquirer";

const form = await (async () => {
  const env = loadEnv("preview", process.cwd());
  const packageName = process.env.npm_package_name;
  const previewProxyStr = env.VITE_PREVIEW_PROXY || env.VITE_PROXY;
  const previewPort = env.VITE_PREVIEW_PORT;
  const buildScript = env.VITE_PREVIEW_BUILD_SCRIPT;

  if (previewProxyStr && previewPort && buildScript) {
    return { previewProxyStr, previewPort, buildScript };
  }

  const result = await Enquirer.prompt({
    type: "form",
    name: "form",
    message: `提供必要信息(${chalk.yellow("按回车键保持默认值")})`,
    choices: [
      { message: "预览端口", name: "previewPort", initial: "3000" }, //
      { message: "构建命令", name: "buildScript", initial: "build" }, //
      {
        message: "预览代理",
        name: "previewProxyStr",
        initial: previewProxyStr,
      }, //
    ] as any,
  });
  const form = (result as any).form as {
    previewPort: string;
    buildScript: string;
    previewProxyStr: string;
  };
  return form;
})();

async function runBuild() {
  buildPromise?.kill();

  buildPromise = execaCommand(`npm run ${form.buildScript}`, {
    stdio: "pipe",
  });
  await oraPromise(buildPromise, {
    text: `正在执行构建命令: ${chalk.cyan(form.buildScript)}`,
    successText: `${chalk.green("预览资产构建完成，开始预览服务")}`,
    failText(error) {
      if (error instanceof ExecaError && error.isTerminated) {
        return `${chalk.red("构建被终止")}`;
      }
      return `${chalk.red("构建失败")}: ${error.message}`;
    },
    prefixText: () => `[${new Date().toLocaleTimeString()}]`,
  }).catch((error: unknown) => {});
}

async function runPreview() {
  const proxy = createViteProxy(form.previewProxyStr);

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
      port: Number(form.previewPort),
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

function runDev() {
  devPromise?.kill();
  devPromise = execaCommand(`npm run dev`, {
    // stdio: 'overlapped',
    stdin: "ignore",
    stdout: "inherit",
    stderr: "pipe",
  });
  devPromise.catch((error: unknown) => {
    if (error instanceof ExecaError) {
      console.error();
      console.error(error.stderr);
    } else {
      console.error();
      console.error("error :>> ", error);
    }
  });
}

function setupKeyBindings() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const onInput = async (input: string) => {
    if (input === "q") {
      process.exit();
    } else {
      console.log(`你输入了: ${input}`);
    }
  };
  rl.on("line", onInput);

  /* readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  process.stdin.on("keypress", (str, key) => {
    if (key.ctrl && key.name === "c") {
      console.log("监听终止。");
      process.exit();
    } else {
      console.log(`你按下了: ${key.name}`);
    }
  }); */
}

runDev();
runBuild().then(runPreview).then(setupKeyBindings);
