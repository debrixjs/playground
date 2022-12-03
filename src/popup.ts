import './popup.scss'

import { computeClass, createDisposible, createElement, createText, Disposible } from "./utils"

export type PopupChoise = 'primary' | 'secondary' | 'cancel' | 'dismissed';
export type PopupSeverity = 'error' | 'warning' | 'info';

export interface PopupResponse {
    choise: PopupChoise
    input?: string
}

export interface PopupOptions {
    /** @default 'info' */
    severity?: PopupSeverity

    header: string
    text?: string

    /** @default 'Ok' */
    primary?: string | boolean

    /** @default undefined */
    secondary?: string

    /** @default 'Cancel' */
    negative?: string | boolean

    /** @default true */
    dismiss?: boolean

    /** @default false */
    input?: boolean | string
}

const BACKDROP_ID = 'backdrop';
let activeContainersSize = 0;

function hideBackdrop() {
    let container: HTMLElement | null;

    if (!(container = document.getElementById(BACKDROP_ID)))
        return false;

    container.classList.add('hidden');
    container.setAttribute('aria-hidden', 'true');

    return true;
}

function ensureBackdrop(container: HTMLElement): HTMLElement {
    let outer: HTMLElement | null;

    if (outer = document.getElementById(BACKDROP_ID)) {
        if (outer.hasAttribute('aria-hidden') || outer.classList.contains('hidden')) {
            outer.removeAttribute('aria-hidden');
            outer.classList.remove('hidden');
        }

        return outer;
    }

    outer = createElement({
        tag: 'div',
        class: 'popup-backdrop',
        id: BACKDROP_ID
    });

    container.append(outer);

    return outer;
}

export function createPopup(container: HTMLElement, options: PopupOptions, resolve: (choise: PopupResponse) => void): Disposible {
    let input = '';

    const innerContainer = createElement({
        tag: 'div',
        class: 'popup-container',
        children: [
            createElement({
                tag: 'div',
                class: 'popup',
                children: [
                    createElement({
                        tag: 'div',
                        class: 'titlebar',
                        children: [
                            createElement({
                                tag: 'div',
                                class: 'title',
                                children: [
                                    createText(options.severity ?? 'info'),
                                ],
                            }),

                            createElement({
                                tag: 'div',
                                class: 'controls',
                                children: [
                                    createElement({
                                        tag: 'button',
                                        class: 'control action codicon codicon-close',
                                        on: {
                                            click: () => resolve({ choise: 'dismissed' })
                                        }
                                    }),
                                ],
                            }),
                        ]
                    }),
                    createElement({
                        tag: 'div',
                        class: 'main',
                        children: [
                            ...options.severity !== undefined ? [
                                createElement({
                                    tag: 'i',
                                    class: computeClass('icon codicon codicon-' + options.severity, options.severity),
                                }),
                            ] : [],

                            createElement({
                                tag: 'div',
                                class: 'content',
                                children: [
                                    createElement({
                                        tag: 'h1',
                                        class: 'header',
                                        callback(element) {
                                            element.innerHTML = options.header!;
                                        },
                                    }),

                                    ...options.text !== undefined ? [
                                        createElement({
                                            tag: 'p',
                                            class: 'text',
                                            callback(element) {
                                                element.innerHTML = options.text!;
                                            },
                                        })
                                    ] : [],
                                ]
                            }),
                        ]
                    }),
                    createElement({
                        tag: 'div',
                        class: 'user-input',
                        children: [
                            ...options.input === true || typeof options.input === 'string' ? [
                                createElement({
                                    tag: 'input',
                                    class: 'text-input',
                                    attr: {
                                        type: 'text'
                                    },
                                    on: {
                                        input: (event) => input = (event.target as HTMLInputElement).value,
                                    },
                                    callback(element) {
                                        if (typeof options.input === 'string')
                                            element.value = options.input;
                                    },
                                }),
                            ] : [],

                            ...options.primary !== false ? [
                                createElement({
                                    tag: 'button',
                                    class: 'primary',
                                    on: {
                                        click: () => resolve({ choise: 'primary', input })
                                    },
                                    children: [
                                        createText((options.primary === true ? undefined : options.primary) ?? 'Ok'),
                                    ],
                                }),
                            ] : [],

                            ...options.secondary ? [
                                createElement({
                                    tag: 'button',
                                    class: 'secondary',
                                    on: {
                                        click: () => resolve({ choise: 'secondary', input })
                                    },
                                    children: [
                                        createText(options.secondary),
                                    ],
                                })
                            ] : [],

                            ...options.negative !== false ? [
                                createElement({
                                    tag: 'button',
                                    class: 'secondary',
                                    on: {
                                        click: () => resolve({ choise: 'cancel' })
                                    },
                                    children: [
                                        createText((options.negative === true ? undefined : options.negative) ?? 'Cancel'),
                                    ],
                                }),
                            ] : [],
                        ],
                    }),
                ],
            }),
        ]
    });

    ensureBackdrop(container);
    container.append(innerContainer);
    ++activeContainersSize;

    return createDisposible(() => {
        innerContainer.remove();
        --activeContainersSize;

        if (activeContainersSize === 0)
            hideBackdrop();
    })
}

export function prompt(options: PopupOptions): Promise<PopupResponse> {
    return new Promise<PopupResponse>((resolve) => {
        const { dispose } = createPopup(document.body, options, (choise) => {
            dispose();
            resolve(choise);
        });
    });
}

export async function alert(options: PopupOptions): Promise<PopupResponse> {
    return await prompt({
        negative: false,
        ...options
    });
}

export async function confirm(options: PopupOptions) {
    const response = await prompt({
        ...options
    });

    return response.choise === 'primary';
}
