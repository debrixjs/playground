import * as debrix from '@debrix/compiler/wasm';
import * as esbuild from 'esbuild-wasm';
import wasmURL from 'esbuild-wasm/esbuild.wasm?url';
import { extname } from './utils';
import { Language, VirtualFileSystem } from './virtual_file_system';

let _initialize: Promise<void> | undefined;

export function initialize(): Promise<void> {
    if (_initialize)
        return _initialize;

    return _initialize = Promise.all([
        esbuild.initialize({
            wasmURL,
            worker: true
        }),
        debrix.initialize()
    ]) as Promise<any>;
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

export interface BuildResult {
    bundle: string
    errors: string[]
    warnings: string[]
    timeMs: number
}

export async function build(index: string, files: VirtualFileSystem): Promise<BuildResult> {
    await initialize();

    const startMs = performance.now();

    const result = await esbuild.build({
        entryPoints: [index],
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

    const endMs = performance.now();
    const timeMs = endMs - startMs;

    const [errors, warnings] = await Promise.all([
        esbuild.formatMessages(result.errors, { kind: 'error', color: true }),
        esbuild.formatMessages(result.warnings, { kind: 'error', color: true }),
    ]);

    return {
        bundle: result.outputFiles[0].text,
        warnings,
        errors,
        timeMs
    }
}
