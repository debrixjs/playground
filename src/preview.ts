import './preview.css';
import 'xterm/css/xterm.css';

import { createDisposible, createElement, createThrottled, Disposible, Revokable } from './utils';
import { VirtualFileManager } from './virtual_file_manager';
import type { BuildResult } from './build';
import { Console } from './console';

function createDocumentString(options: { head?: string | string[], body?: string | string[] }) {
    const head: string = Array.isArray(options.head) ? options.head.join('\n') : options.head ?? '';
    const body: string = Array.isArray(options.body) ? options.body.join('\n') : options.body ?? '';
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />${head}</head><body>${body}</body></html>`;
}

async function createConsole(container: HTMLElement) {
    const { createConsole } = await import('./console');
    return createConsole(container);
}

async function createPreviewInner(
    container: HTMLElement,
    files: VirtualFileManager,
    _console: Promise<Console> | Console
) {
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

    container.append(wrapper);

    async function update() {
        if (files.active === null)
            return;

        const indexFile = files.find((file) => /^index\.[tj]s$/.test(file.name));
        if (!indexFile) {
            iframe.srcdoc = createDocumentString({
                body: '<pre>Could not find index file. Create a file named "index.js" or "index.ts".</pre>'
            });
        }

        const [console, { build }] = await Promise.all([
            _console,
            await import('./build')
        ]);

        let result: BuildResult;

        try {
            result = await build(indexFile!.name, files);
        } catch (err) {
            console.clear();
            console.writeln(String(err));
            iframe.srcdoc = createDocumentString({
                body: `<pre>${String(err)}</pre>`
            });
            return;
        } finally {
            window.dispatchEvent(new Event('buildfinished'));
        }

        console.clear();

        if (result.errors.length === 0 && result.warnings.length === 0)
            console.writeln(`Build finished in ${Math.floor(result.timeMs)}ms!`);

        iframe.srcdoc = createDocumentString({
            head: [
                `<script defer type="module">${result.bundle}</script>`
            ]
        });
    }

    const updateThrottled = createThrottled(update, 300);

    const revokables: Revokable[] = [
        files.onFileEdit(updateThrottled),
        files.onFileAdded(updateThrottled),
        files.onFileRemoved(updateThrottled),
    ];

    iframe.srcdoc = 'Loading...';
    update();

    return createDisposible(() => {
        for (const revokable of revokables)
            revokable.revoke();
    });
}

export async function createPreview(
    container: HTMLElement,
    files: VirtualFileManager
): Promise<Disposible> {
    const previewContainer = createElement({
        tag: 'div',
        class: 'preview-container'
    });

    container.append(previewContainer);

    const _console = createConsole(previewContainer);
    const _inner = createPreviewInner(previewContainer, files, _console);

    return createDisposible(async () => {
        (await _console).dispose();
        (await _inner).dispose();
    });
}