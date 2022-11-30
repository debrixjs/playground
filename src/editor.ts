import './editor.css';
import * as monaco from 'monaco-editor';
import { computeClass, createDisposible, createElement, createText, Disposible, Revokable } from './utils';
import { Language, VirtualFile } from './virtual_file_system';
import { VirtualFileManager } from './virtual_file_manager';

window.MonacoEnvironment = {
    async getWorker(_workerId, label) {
        let Worker: new () => Worker;

        switch (label) {
            case 'css':
            case 'less':
            case 'scss':
                Worker = (await import('monaco-editor/esm/vs/language/css/css.worker?worker')).default;
                break;

            case 'editorWorkerService':
                Worker = (await import('monaco-editor/esm/vs/editor/editor.worker?worker')).default;
                break;

            case 'handlebars':
            case 'html':
            case 'razor':
                Worker = (await import('monaco-editor/esm/vs/language/html/html.worker?worker')).default;
                break;

            case 'json':
                Worker = (await import('monaco-editor/esm/vs/language/json/json.worker?worker')).default;
                break;

            case 'javascript':
            case 'typescript':
                Worker = (await import('monaco-editor/esm/vs/language/typescript/ts.worker?worker')).default;
                break;

            default:
                throw new Error(`Unknown label ${label}`);
        }

        return new Worker;
    }
};

function languageToMonacoLanguage(language: Language | undefined): string | undefined {
    return language;
}

function createTab(container: HTMLElement, files: VirtualFileManager, file: VirtualFile): Disposible {
    const filename = createText(file.name);
    const element = createElement({
        tag: 'div',
        class: computeClass('file-tab', files.active === file && 'active'),
        on: {
            click: () => files.active = file
        },
        children: [
            createElement({
                tag: 'span',
                class: 'filename',
                children: [
                    filename
                ],
            }),
            createElement({
                tag: 'button',
                class: 'control rename codicon codicon-ellipsis',
                attr: {
                    title: 'Rename file'
                },
                on: {
                    click: () => {
                        const newName = prompt('Enter new filename:', file.name);

                        if (newName)
                            file.name = newName;
                    },
                },
            }),
            createElement({
                tag: 'button',
                class: 'control delete codicon codicon-close',
                attr: {
                    title: 'Delete file'
                },
                on: {
                    click: () => {
                        const verification = confirm(`Are you sure you want to delete '${file.name}'?`);

                        if (verification)
                            files.removeFile(file, true);
                    },
                },
            }),
        ],
    });

    container.append(element);

    const revokables: Revokable[] = [
        file.onRenamed((newName) => {
            filename.textContent = newName;
        }),
        files.onActiveFileChanged((activeFile) => {
            if (activeFile === file)
                element.classList.add('active');
            else if (element.classList.contains('active'))
                element.classList.remove('active');
        }),
    ];

    return createDisposible(() => {
        for (const revokable of revokables)
            revokable.revoke();

        element.remove();
    });
}

function createTabManager(container: HTMLElement, files: VirtualFileManager): Disposible {
    const tabsContainer = createElement({
        tag: 'div',
        class: 'file-tabs',
    });

    container.append(
        createElement({
            tag: 'div',
            class: 'file-tabs-container',
            children: [
                tabsContainer,
                createElement({
                    tag: 'div',
                    class: 'controls',
                    children: [
                        createElement({
                            tag: 'button',
                            class: 'control add-file codicon codicon-file-add',
                            on: {
                                click: () => {
                                    const filename = prompt('Enter filename: ');

                                    if (filename)
                                        files.addFile(new VirtualFile(filename, null));
                                },
                            },
                        }),
                    ],
                }),
            ],
        }),
    );

    const tabs = new Map<VirtualFile, Disposible>(
        Array.from(files.all())
            .filter(file => !file.hidden)
            .map(file => [file, createTab(tabsContainer, files, file)])
    );

    const revokables: Revokable[] = [
        files.onFileAdded((file) => {
            if (!file.hidden)
                tabs.set(file, createTab(tabsContainer, files, file));
        }),
        files.onFileRemoved((file) => {
            tabs.get(file)!.dispose();
            tabs.delete(file);
        })
    ];

    return createDisposible(() => {
        for (const revokable of revokables)
            revokable.revoke();
    });
}

function createEditorInner(
    container: HTMLElement,
    files: VirtualFileManager
): Disposible {
    const wrapper = createElement({
        tag: 'div',
        class: 'editor-wrapper'
    });

    container.append(wrapper);

    const models = new Map<VirtualFile, monaco.editor.ITextModel>(
        Array.from(files.all()).map(file => [
            file,
            monaco.editor.createModel(
                file.content,
                languageToMonacoLanguage(file.language)
            )
        ])
    );

    function getActiveModel(activeFile = files.active): monaco.editor.ITextModel | null {
        return activeFile ? models.get(activeFile)! : null;
    }

    const editor = monaco.editor.create(wrapper, {
        automaticLayout: true,
        model: getActiveModel(),
        theme: 'vs-dark'
    });

    editor.onDidChangeModelContent(() => {
        if (files.active) {
            cancelNextEditEvent = true;
            files.active.content = editor.getValue();
        }
    });

    let cancelNextEditEvent = false;
    const revokables: Revokable[] = [
        files.onActiveFileChanged((activeFile) => {
            editor.setModel(getActiveModel(activeFile));
            editor.focus();
        }),

        files.onFileAdded((file) => {
            if (!models.has(file)) {
                const model = monaco.editor.createModel(
                    file.content,
                    languageToMonacoLanguage(file.language)
                );
                models.set(file, model);
            }
        }),

        files.onFileRemoved((file, disposed) => {
            if (disposed) {
                const model = models.get(file)!;
                model.dispose();
                models.delete(file);
            }
        }),

        files.onFileEdit((file, newContent) => {
            if (cancelNextEditEvent) {
                cancelNextEditEvent = false;
                return;
            }

            const model = models.get(file)!;
            model.setValue(newContent);
        }),

        files.onFileLanguageChanged((file) => {
            const oldModel = models.get(file)!;
            oldModel.dispose();
            models.delete(file);

            const newModel = monaco.editor.createModel(
                file.content,
                languageToMonacoLanguage(file.language)
            );
            models.set(file, newModel);
        }),
    ];

    return createDisposible(() => {
        for (const revokable of revokables)
            revokable.revoke();
    });
}

export function createEditor(
    container: HTMLElement,
    files: VirtualFileManager
): Disposible {
    const editorContainer = createElement({
        tag: 'div',
        class: 'editor-container'
    });
    container.append(editorContainer);

    const disposibles: Disposible[] = [
        createTabManager(editorContainer, files),
        createEditorInner(editorContainer, files),
    ];

    return createDisposible(() => {
        for (const disposible of disposibles)
            disposible.dispose();
    })
}
