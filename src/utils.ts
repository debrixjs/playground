export type Ext = `.${string}`;

export const searchParams = new URLSearchParams(location.search);

export function setSearchParams(): void {
    const url = new URL(location.href);
    url.search = searchParams.toString();
    window.history.pushState({ path: url.pathname.toString() }, '', url.toString());
}

export interface Disposible {
    dispose(): void
}

export function createDisposible(dispose: () => void): Disposible {
    return { dispose }
}

export function disposeAll(disposibles: Disposible[]): void {
    for (const disposible of disposibles)
        disposible.dispose();
}

export interface Revokable {
    revoke(): void
}

export function createRevokable(revoke: () => void): Revokable {
    return { revoke }
}

export function revokeAll(revokables: Revokable[]): void {
    for (const revokable of revokables)
        revokable.revoke();
}

export function randomInt(min = 0, max = 1): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomId(length = 8): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    const chars = alphabet + alphabet.toUpperCase() + '0123456789';
    return Array.from({ length }, () => chars[randomInt(0, chars.length)]).join('');
}

export function createThrottled(fn: () => void, delay: number): () => void {
    let handle: number | undefined;

    return () => {
        if (handle)
            clearTimeout(handle);

        handle = setTimeout(() => fn(), delay);
    };
}

export function extname(filename: string): Ext | undefined {
    return /\.[^/\\.]*$/.exec(filename)?.[0] as Ext | undefined;
}

export function createElement<K extends keyof HTMLElementTagNameMap>(options: {
    tag: K,
    class?: string,
    id?: string,
    children?: (string | Node)[]
    on?: { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void }
    attr?: Record<string, string>
    callback?: (element: HTMLElementTagNameMap[K]) => void
}): HTMLElementTagNameMap[K] {
    const element = document.createElement(options.tag);
    if (options.class)
        element.classList.add(...options.class.split(' '));
    if (options.id)
        element.id = options.id;
    if (options.children?.length)
        element.append(...options.children);
    if (options.on) {
        for (const type in options.on) {
            if (Object.prototype.hasOwnProperty.call(options.on, type)) {
                const listener = (options.on as any)[type];
                element.addEventListener(type, listener);
            }
        }
    }
    if (options.attr) {
        for (const name in options.attr) {
            if (Object.prototype.hasOwnProperty.call(options.attr, name)) {
                element.setAttribute(name, options.attr[name]);
            }
        }
    }
    if (options.callback)
        options.callback(element);
    return element;
}

export function computeClass(...classes: (string | undefined | null | false)[]) {
    return classes.filter(value => value && typeof value === 'string').join(' ');
}

export function createText(text?: string): Text {
    return document.createTextNode(text ?? '');
}
