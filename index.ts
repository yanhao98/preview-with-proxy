import readline from 'node:readline';
import chalk from 'chalk';
import { spawn } from 'node:child_process';
import { createViteProxy } from 'utils4u';
import { loadEnv, preview, type PreviewServer } from "vite";
import yargs from "yargs";
const DEBUG = false;
type BuildProcess = import("node:child_process").ChildProcessByStdio<null, import("stream").Readable, null>

let previewServer: PreviewServer | null = null
let buildProcess: BuildProcess | null = null

// 构建完成时的输出
const BUILD_DONE_OUTPUT = [
    'Build complete. The dist directory is ready to be deployed.'
]
// // 开始重新构建时的输出
// const REBUILD_START_OUTPUT = 'WAIT  Compiling...'

const log = function (...args: any[]) {
    console.log(`[${new Date().toLocaleTimeString()}] [build-preview: ${argv.port}]`, ...args)
}
const argv = yargs()
    .option('port', {
        describe: '预览服务端口',
        type: 'number',
        default: 3000
    })
    .option('build-command', {
        describe: '构建命令',
        type: 'string',
    })
    .option('build-script', {
        describe: '构建脚本（在 package.json 中的 scripts 字段）',
        type: 'string',
    })
    .option('proxy-env-mode', {
        describe: '加载代理配置的环境模式',
        default: 'development',
        type: 'string'
    })
    .option('proxy-env-key', {
        describe: '环境变量中代理配置的键名',
        default: 'VITE_PROXY',
        type: 'string'
    })
    .check((argv) => {
        // 检查 build-command 和 build-script 至少有一个被提供
        if (!argv['build-command'] && !argv['build-script']) {
            throw new Error('必须提供 "build-command" 或 "build-script" 中的至少一个');
        }
        // 如果没有抛出错误，则返回 true 表示参数通过验证
        return true;
    })
    .parseSync(process.argv)

function build() {
    if (buildProcess) {
        buildProcess.kill()
    }

    const command = (
        !!argv.buildScript
            ? `npm run ${argv.buildScript}`
            : argv.buildCommand
    ) as string
    log(chalk.cyan(`开始构建。构建命令：${chalk.bold(command)}`))

    const [cmd, ...args] = command.split(' ')
    buildProcess = spawn(cmd, args, {
        shell: true,
        stdio: ['inherit', 'pipe', 'inherit'] // stdin 继承，stdout 为管道，stderr 继承
    })
    buildProcess.stdout.on('data', (data) => {
        const output = data.toString()
        // process.stdout.write(data)
        /* if (output.includes(REBUILD_START_OUTPUT)) {
            log(chalk.cyan('监听到重新构建...'))
        } else */ if (BUILD_DONE_OUTPUT.some((item) => output.includes(item))) {
            log(chalk.green(`构建完成。${chalk.bold('按 R 重新构建')}，${chalk.bold('Ctrl+C 退出')}。`))
            startPreview()
        }
    })
    buildProcess.on('exit', (code) => {
        log(chalk.gray(`构建进程退出，退出码：${code}`))
    })
}

function startPreview() {
    // https://vitejs.dev/guide/api-javascript.html#preview
    (async () => {
        if (previewServer) await previewServer.close()
    })();

    (async () => {
        const env = loadEnv(argv['proxy-env-mode'], process.cwd(), [argv['proxy-env-key']])
        const proxy = createViteProxy(env.VITE_PROXY);
        for (const [path, target] of Object.entries(proxy)) {
            log(chalk.green(`代理：${path} -> ${target.target}`))
        }
        try {
            previewServer = await preview({
                preview: {
                    port: argv.port,
                    strictPort: true,
                    host: true,
                    proxy
                }
            })
        } catch (e) {
            console.error(e)
            process.exit(1)
        }

        previewServer.printUrls()
        // previewServer.bindCLIShortcuts({ print: true })
    })();
}

if (argv.buildCommand || argv.buildScript) {
    // 设置 stdin 监听按键事件 // 一些库：// inquirer // keypress // blessed
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.on('keypress', (chunk, key) => {
        if (key && key.name === 'r') {
            // console.log('\x1Bc'); // 清屏
            log(chalk.blue('检测到按键 R，重新开始构建...'));
            build();
        } else if (key && key.ctrl && key.name === 'c') {
            process.exit(); // 监听 Ctrl+C 退出程序
        }
    });
    build()
} else {
    startPreview()
}
