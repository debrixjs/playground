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

function contentTypeToLoader(contentType: string | null): esbuild.Loader {
    switch (contentType?.split(';')[0]) {
        case 'application/javascript':
            return 'js';

        default:
            return 'default';
    }
}

function createDocumentString(options: { head?: string | string[], body?: string | string[] }) {
    const head: string = Array.isArray(options.head) ? options.head.join('\n') : options.head ?? '';
    const body: string = Array.isArray(options.body) ? options.body.join('\n') : options.body ?? '';
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />${head}</head><body>${body}</body></html>`;
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
    });

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

        const indexFile = files.find((file) => /^index\.[tj]s$/.test(file.name));

        if (!indexFile) {
            iframe.srcdoc = createDocumentString({
                body: '<pre>Could not find index file. Create a file named "index.js" or "index.ts".</pre>'
            });
        }

        const start = performance.now();

        let bundle: esbuild.BuildResult & {
            outputFiles: esbuild.OutputFile[];
        };

        try {
            bundle = await esbuild.build({
                entryPoints: [indexFile!.name],
                bundle: true,
                write: false,
                logLevel: 'silent',
                plugins: [
                    {
                        name: 'debrix',
                        setup(build) {
                            build.onResolve({ filter: /./ }, (args) => {
                                if (args.importer.startsWith('http://') || args.importer.startsWith('https://') || args.path === '@debrix/internal') {
                                    return {
                                        path: new URL(args.path, 'https://cdn.skypack.dev').toString(),
                                        namespace: 'uri'
                                    }
                                }

                                if (args.path.startsWith('http://') || args.path.startsWith('https://')) {
                                    return {
                                        path: args.path,
                                        namespace: 'uri'
                                    }
                                }

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

                            build.onLoad({ filter: /./, namespace: 'uri' }, async (args) => {
                                const response = await fetch(args.path, {
                                    cache: 'no-cache'
                                });

                                const contents = await response.text();
                                const loader = contentTypeToLoader(response.headers.get('content-type'));

                                return {
                                    contents,
                                    loader
                                }
                            });
                        },
                    }
                ]
            });
        } catch (err) {
            console.clear();
            console.writeln(String(err));
            iframe.srcdoc = createDocumentString({
                body: `<pre>${String(err)}</pre>`
            });
            return;
        }

        const end = performance.now();
        console.clear();

        if (bundle.errors.length === 0 && bundle.warnings.length === 0)
            console.writeln(`Build finished in ${Math.floor(end - start)}ms!`);

        await Promise.all([
            (async () => {
                const lines = await esbuild.formatMessages(bundle.errors, { kind: 'error', color: false });
                if (lines.length)
                    console.writeln(lines.join('\n'));
            })(),
            (async () => {
                const lines = await esbuild.formatMessages(bundle.warnings, { kind: 'warning', color: false });
                if (lines.length)
                    console.writeln(lines.join('\n'));
            })(),
        ])

        const scriptText = bundle.outputFiles[0].text;
        iframe.srcdoc = createDocumentString({
            head: [
                `<script defer type="module">${scriptText}</script>`
            ]
        });
    }

    const updateThrottled = createThrottled(update, 300);

    const revokables: Revokable[] = [
        files.onFileEdit(updateThrottled),
        files.onFileAdded(updateThrottled),
        files.onFileRemoved(updateThrottled),
    ];

    const idleHandle = requestIdleCallback(update);
    iframe.srcdoc = 'Loading...';

    return createDisposible(() => {
        for (const revokable of revokables)
            revokable.revoke();

        cancelIdleCallback(idleHandle);
    });
}