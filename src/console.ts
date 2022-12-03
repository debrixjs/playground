import './console.scss';

import { Terminal as XTerm } from 'xterm';
import { WebglAddon as XTermWebglAddon } from 'xterm-addon-webgl'
import { FitAddon as XTermFitAddon } from 'xterm-addon-fit'
import { createDisposible, createElement, Disposible } from './utils';

export interface Console extends Disposible {
    write(data: string | Uint8Array): void
    writeln(data: string | Uint8Array): void
    clear(): void
}

export function createConsole(container: HTMLElement): Console {
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
