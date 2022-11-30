import './preview.css';
import 'xterm/css/xterm.css';

import { createDisposible, createElement, createThrottled, Disposible, extname, Revokable } from './utils';
import { VirtualFileManager } from './virtual_file_manager';
import { Language } from './virtual_file_system';

import * as debrix from '@debrix/compiler/wasm';
import * as esbuild from 'esbuild-wasm';
import wasmURL from 'esbuild-wasm/esbuild.wasm?url';

import { Terminal as XTerm } from 'xterm';
import { WebglAddon as XTermWebglAddon } from 'xterm-addon-webgl'
import { FitAddon as XTermFitAddon } from 'xterm-addon-fit'
import chalk from 'chalk';

interface PreviewConsole extends Disposible {
    write(data: string | Uint8Array): void
    writeln(data: string | Uint8Array): void
    clear(): void
}

function createConsole(container: HTMLElement): PreviewConsole {
    const wrapper = createElement({
        tag: 'div',
        class: 'console-wrapper'
    });

    container.append(createElement({
        tag: 'div',
        class: 'console',
        children: [
            wrapper
        ]
    }));

    const style = getComputedStyle(wrapper);

    const terminal = new XTerm({
        allowProposedApi: true,
        theme: {
            background: style.getPropertyValue('--background')
        }
    });

    const webglAddon = new XTermWebglAddon();
    const fitAddon = new XTermFitAddon();
    terminal.open(wrapper);
    terminal.loadAddon(webglAddon);
    terminal.loadAddon(fitAddon);
    fitAddon.fit();

    const disposibles: Disposible[] = [
        (() => {
            const listener = () => fitAddon.fit();
            window.addEventListener('resize', listener);
            return createDisposible(() => {
                window.removeEventListener('resize', listener);
            });
        })(),
    ];

    // Hide cursor
    terminal.write('\x1b[?25l');

    return {
        write(data: string | Uint8Array) {
            terminal.write(data);
        },
        writeln(data) {
            terminal.writeln(data);
        },
        clear() {
            terminal.clear();
        },
        dispose() {
            for (const disposible of disposibles)
                disposible.dispose();

            terminal.dispose();
        },
    }
}

function languageToLoader(language: Language | undefined): esbuild.Loader {
    switch (language) {
        case 'javascript':
            return 'js';

        case 'typescript':
            return 'ts';

        case 'html':
            return 'text';

        case 'css':
            return 'css';

        default:
            return 'default';
    }
}

export function createPreview(
    container: HTMLElement,
    files: VirtualFileManager
): Disposible {
    const iframe = createElement({
        tag: 'iframe'
    });

    const wrapper = createElement({
        tag: 'div',
        class: 'preview-wrapper',
        children: [
            iframe
        ]
    });

    const previewContainer = createElement({
        tag: 'div',
        class: 'preview-container',
        children: [
            wrapper
        ]
    })

    container.append(previewContainer);

    const console = createConsole(previewContainer);

    const initialized = esbuild.initialize({
        wasmURL,
        worker: true
    });

    async function update() {
        if (files.active === null)
            return;

        await initialized;

        const start = performance.now();

        let bundle: esbuild.BuildResult & {
            outputFiles: esbuild.OutputFile[];
        };

        try {
            bundle = await esbuild.build({
                entryPoints: [files.active.name],
                bundle: true,
                write: false,
                logLevel: 'silent',
                plugins: [
                    {
                        name: 'debrix',
                        setup(build) {
                            build.onResolve({ filter: /./ }, (args) => {
                                return {
                                    path: args.path,
                                    namespace: 'virtual'
                                }
                            });

                            build.onLoad({ filter: /./, namespace: 'virtual' }, async (args) => {
                                const file = files.find(file => file.name === args.path);

                                if (file === null)
                                    return null;

                                const ext = extname(file.name);

                                let loader = languageToLoader(file.language);
                                let contents = file.content;

                                if (ext === '.ix') {
                                    try {
                                        const build = await debrix.build(contents);
                                        contents = build.source;
                                        loader = 'js';
                                    } catch (_err) {
                                        const err = _err as debrix.ParserError | debrix.CompilerError;
                                        return {
                                            errors: [{
                                                pluginName: 'debrix',
                                                text: err.message,
                                                detail: err
                                            }]
                                        }
                                    }
                                }

                                return {
                                    contents,
                                    loader
                                };
                            });
                        },
                    }
                ]
            });
        } catch (err) {
            console.clear();
            console.writeln(String(err));
            iframe.srcdoc = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /></head><body><pre>${String(err)}</pre></body></html>`;
            return;
        }

        const end = performance.now();
        console.clear();

        if (bundle.errors.length === 0 && bundle.warnings.length === 0)
            console.writeln(chalk.greenBright(`Build finished in ${Math.floor(end - start)}ms!`));

        await Promise.all([
            (async () => {
                const lines = await esbuild.formatMessages(bundle.errors, { kind: 'error', color: false });
                if (lines.length)
                    console.writeln(chalk.red(lines.join('\n')));
            })(),
            (async () => {
                const lines = await esbuild.formatMessages(bundle.warnings, { kind: 'warning', color: false });
                if (lines.length)
                    console.writeln(chalk.yellow(lines.join('\n')));
            })(),
        ])

        const scriptText = bundle.outputFiles[0].text;
        iframe.srcdoc = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><script defer type="module">${scriptText}</script></head><body></body></html>`;

        (iframe.contentWindow as any).console.error =
            (iframe.contentWindow as any).console.warn =
            (iframe.contentWindow as any).console.log = (...data: unknown[]) => {
                for (let index = 0; index < data.length; index++) {
                    console.write(String(data[index]));

                    if (index < data.length - 1)
                        console.write(', ');
                }

                console.write('\n');
            };
    }

    const updateThrottled = createThrottled(update, 300);

    const revokables: Revokable[] = [
        files.onFileEdit(updateThrottled)
    ];

    const idleHandle = requestIdleCallback(update);
    iframe.srcdoc = 'Loading...';

    return createDisposible(() => {
        for (const revokable of revokables)
            revokable.revoke();

        cancelIdleCallback(idleHandle);
    });
}