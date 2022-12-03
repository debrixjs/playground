import './editor.css';
import * as monaco from 'monaco-editor';
import { computeClass, createDisposible, createElement, createText, Disposible, hideElement, Revokable, showElement } from './utils';
import { Language, VirtualFile } from './virtual_file_system';
import { Project } from './project';
import { confirm, prompt } from './popup';

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

function createTab(container: HTMLElement, project: Project, file: VirtualFile): Disposible {
    const filename = createText(file.name);
    const dirty = createElement({
        tag: 'i',
        class: 'dirty hidden',
        attr: {
            'aria-hidden': 'true',
            title: 'File is dirty (modified)'
        },
        children: [
            createText('*')
        ]
    });

    const element = createElement({
        tag: 'div',
        class: computeClass('file-tab', project.files.active === file && 'active'),
        on: {
            click: () => project.files.active = file
        },
        children: [
            createElement({
                tag: 'span',
                class: 'filename',
                children: [
                    filename,
                    dirty
                ],
            }),
            createElement({
                tag: 'button',
                class: 'control rename codicon codicon-ellipsis',
                attr: {
                    title: 'Rename file'
                },
                on: {
                    click: async () => {
                        const response = await prompt({
                            header: 'Enter new filename',
                            text: `You are renaming '${file.name}'. Enter the new name for this file.`,
                            input: file.name
                        });

                        if (response.choise === 'primary' && response.input)
                            file.name = response.input;
                    },
                },
            }),
            createElement({
                tag: 'button',
                class: 'control delete codicon codicon-trash',
                attr: {
                    title: 'Delete file'
                },
                on: {
                    click: async () => {
                        const verification = await confirm({
                            header: 'Delete file',
                            text: `Are you sure you want to delete '${file.name}'? You cannot undo this action.`,
                            primary: 'Delete'
                        });

                        if (verification)
                        project.files.removeFile(file, true);
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
        project.files.onActiveFileChanged((activeFile) => {
            if (activeFile === file)
                element.classList.add('active');
            else if (element.classList.contains('active'))
                element.classList.remove('active');
        }),
        project.onDirtyChange((isDirty, dirtyFile) => {
            if (!isDirty)
                hideElement(dirty);
            else if (dirtyFile === file)
                showElement(dirty);
        })
    ];

    return createDisposible(() => {
        for (const revokable of revokables)
            revokable.revoke();

        element.remove();
    });
}

function createTabManager(
    container: HTMLElement,
    project: Project
): Disposible {
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
                            class: 'control codicon codicon-link',
                            attr: {
                                title: 'Share permalink to project (ctrl+shift+s).'
                            },
                            on: {
                                click: () => project.share(),
                            },
                        }),
                        createElement({
                            tag: 'button',
                            class: 'control codicon codicon-gist-fork',
                            attr: {
                                title: 'Fork project (ctrl+alt+s).'
                            },
                            on: {
                                click: () => project.fork(),
                            },
                        }),
                        createElement({
                            tag: 'button',
                            class: 'control codicon codicon-cloud-upload',
                            attr: {
                                title: 'Save project (ctrl+s).'
                            },
                            on: {
                                click: () => project.save(),
                            },
                        }),
                        createElement({
                            tag: 'button',
                            class: 'control codicon codicon-file-add',
                            attr: {
                                title: 'Create new file.'
                            },
                            on: {
                                click: async () => {
                                    const response = await prompt({
                                        header: 'Enter new filename',
                                        input: true
                                    });

                                    if (response.choise === 'primary' && response.input)
                                        project.files.addFile(new VirtualFile(response.input, null));
                                },
                            },
                        }),
                    ],
                }),
            ],
        }),
    );

    const tabs = new Map<VirtualFile, Disposible>(
        Array.from(project.files.all())
            .map(file => [file, createTab(tabsContainer, project, file)])
    );

    const revokables: Revokable[] = [
        project.files.onFileAdded((file) => {
            tabs.set(file, createTab(tabsContainer, project, file));
        }),
        project.files.onFileRemoved((file) => {
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
    project: Project
): Disposible {
    const wrapper = createElement({
        tag: 'div',
        class: 'editor-wrapper'
    });

    container.append(wrapper);

    const models = new Map<VirtualFile, monaco.editor.ITextModel>(
        Array.from(project.files.all()).map(file => [
            file,
            monaco.editor.createModel(
                file.content,
                languageToMonacoLanguage(file.language)
            )
        ])
    );

    function getActiveModel(activeFile = project.files.active): monaco.editor.ITextModel | null {
        return activeFile ? models.get(activeFile)! : null;
    }

    const editor = monaco.editor.create(wrapper, {
        automaticLayout: true,
        model: getActiveModel(),
        theme: 'vs-dark',
        readOnly: project.readonly
    });

    editor.onDidChangeModelContent(() => {
        if (project.files.active) {
            cancelNextEditEvent = true;
            project.files.active.content = editor.getValue();
        }
    });

    let cancelNextEditEvent = false;
    const revokables: Revokable[] = [
        project.files.onActiveFileChanged((activeFile) => {
            editor.setModel(getActiveModel(activeFile));
            editor.focus();
        }),

        project.files.onFileAdded((file) => {
            if (!models.has(file)) {
                const model = monaco.editor.createModel(
                    file.content,
                    languageToMonacoLanguage(file.language)
                );
                models.set(file, model);
            }
        }),

        project.files.onFileRemoved((file, disposed) => {
            if (disposed) {
                const model = models.get(file)!;
                model.dispose();
                models.delete(file);
            }
        }),

        project.files.onFileEdit((file, newContent) => {
            if (cancelNextEditEvent) {
                cancelNextEditEvent = false;
                return;
            }

            const model = models.get(file)!;
            model.setValue(newContent);
        }),

        project.files.onFileLanguageChanged((file) => {
            const oldModel = models.get(file)!;
            oldModel.dispose();
            models.delete(file);

            const newModel = monaco.editor.createModel(
                file.content,
                languageToMonacoLanguage(file.language)
            );
            models.set(file, newModel);
        }),

        project.onReadonlyChange((readOnly) => {
            editor.updateOptions({ readOnly });
        })
    ];

    return createDisposible(() => {
        for (const revokable of revokables)
            revokable.revoke();
    });
}

export function createEditor(
    container: HTMLElement,
    project: Project
): Disposible {
    const editorContainer = createElement({
        tag: 'div',
        class: 'editor-container'
    });
    container.append(editorContainer);

    const disposibles: Disposible[] = [
        createTabManager(editorContainer, project),
        createEditorInner(editorContainer, project),
    ];

    return createDisposible(() => {
        for (const disposible of disposibles)
            disposible.dispose();
    })
}
