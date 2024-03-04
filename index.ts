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
let devProcess: import("node:child_process").ChildProcess | null = null

// 构建完成时的输出
const BUILD_DONE_OUTPUT = [
    'Build complete. The dist directory is ready to be deployed.'
]

const log = function (...args: any[]) {
    console.log(`${chalk.dim(`[${new Date().toLocaleTimeString()}] [build-preview: ${argv.port}]`)}`, ...args)
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
    .option('dev-script', {
        describe: '开发脚本（在 package.json 中的 scripts 字段），如果提供则在启动预览服务时执行',
        type: 'string',
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

function runBuild() {
    if (buildProcess) {
        buildProcess.kill()
    }

    const command = (
        !!argv['build-script']
            ? `npm run ${argv['build-script']}`
            : argv['build-command']
    ) as string
    log(chalk.cyan(`开始构建预览资产。构建命令：${chalk.bold(command)}`))

    const [cmd, ...args] = command.split(' ')
    buildProcess = spawn(cmd, args, {
        shell: true,
        stdio: ['inherit', 'pipe', 'inherit'] // stdin 继承，stdout 为管道，stderr 继承
    })
    buildProcess.stdout.on('data', (data) => {
        const output = data.toString()
        // process.stdout.write(data)
        if (BUILD_DONE_OUTPUT.some((item) => output.includes(item))) {
            log(chalk.green(`预览服务已启动，${chalk.bold('按 R 重新构建预览资产')}，${chalk.bold('按 D 重新运行开发脚本')}，${chalk.bold('Ctrl+C 退出')}。`))
            runPreview()
        }
    })
    buildProcess.on('exit', (code) => {
        log(chalk.gray(`构建进程退出，退出码：${code}`))
    })
}

function runPreview() {
    // https://vitejs.dev/guide/api-javascript.html#preview
    (async () => {
        if (previewServer) await previewServer.close()
    })();

    (async () => {
        const env = loadEnv(argv['proxy-env-mode'], process.cwd(), [argv['proxy-env-key']])
        const proxy = createViteProxy(env.VITE_PROXY);

        if (Object.keys(proxy).length === 0) {
            log(chalk.yellow('未提供代理配置'))
        } else {
            for (const [path, target] of Object.entries(proxy)) {
                log(chalk.green(`预览服务代理：${path} -> ${target.target}`))
            }
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


function runDev() {
    if (devProcess) {
        devProcess.kill()
    }
    devProcess = spawn(`npm run ${argv['dev-script']}`, {
        shell: true,
        stdio: 'inherit'
    });
    devProcess.on('exit', (code) => {
        log(chalk.gray(`开发进程退出，退出码：${code}`))
    });
}

function setupKeyBindings() {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    process.stdin.on('keypress', (chunk, key) => {
        if (key && key.name === 'r') {
            log(chalk.blue('检测到按键 R，重新运行构建脚本...'));
            runBuild();
        } else if (key && key.name === 'd') {
            log(chalk.blue('检测到按键 D，重新运行开发脚本...'));
            runDev();
        } else if (key && key.ctrl && key.name === 'c') {
            log(chalk.red('检测到按键 Ctrl+C，退出...'));
            (async () => {
                if (previewServer) await previewServer.close()
                // log(chalk.gray('预览服务已关闭'))
                if (buildProcess) buildProcess.kill()
                // log(chalk.gray('构建进程已关闭'))
                if (devProcess) devProcess.kill()
                // log(chalk.gray('开发进程已关闭'))
                process.exit(0);
            })();
        }
    });
}

runBuild()

if (argv['dev-script']) {
    runDev()
}

setupKeyBindings()
