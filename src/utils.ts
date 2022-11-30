export type Ext = `.${string}`;

export interface Disposible {
    dispose(): void
}

export function createDisposible(dispose: () => void): Disposible {
    return { dispose }
}

export interface Revokable {
    revoke(): void
}

export function createRevokable(revoke: () => void): Revokable {
    return { revoke }
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
