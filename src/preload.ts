// preload.scss is imported by index.html

import { createDisposible, createElement, createText } from "./utils";

const text = createText('Loading');

const loader = createElement({
    tag: 'div',
    class: 'loader',
    children: [
        createElement({
            tag: 'img',
            class: 'banner',
            attr: {
                src: 'https://raw.githubusercontent.com/debrixjs/assets/main/images/banner.dark.svg',
            },
        }),
        createElement({
            tag: 'p',
            class: 'text',
            children: [
                text,
            ],
        }),
    ],
});

document.body.append(loader);

function unitToMs(string: string): number {
    const match = /^([0-9]+)([a-z]+)/.exec(string)?.slice(1);
    if (!match)
        throw new Error(`Cannot parse '${string}'.`);

    const [value, unit] = match;
    switch (unit) {
        case 'ms':
            return parseFloat(value);
        case 's':
            return parseFloat(value) * 1000;
        default:
            throw new Error(`Unknown unit '${unit}'.`);
    }
}

const interval = createDisposible((() => {
    const id = setInterval(() => {
        text.textContent += '.';
    }, 1000);

    return () => {
        clearInterval(id);
    };
})());

window.addEventListener('buildfinished', () => {
    loader.classList.add('hidden');
    
    const delay = unitToMs(getComputedStyle(loader).getPropertyValue('--delay').trim());
    setTimeout(() => {
        loader.remove();
        interval.dispose();
    }, delay + 100);
}, {
    once: true
});
