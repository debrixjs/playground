import { MonoEventEmitter } from "./eventemitter";
import { createRevokable, Disposible, Ext, extname, Revokable, revokeAll } from "./utils";

export type Language = 'javascript' | 'typescript' | 'html' | 'css'

export class VirtualFile implements Disposible {
    static extToLanguage(ext: Ext | undefined): Language | undefined {
        switch (ext) {
            case '.js':
                return 'javascript';

            case '.ts':
                return 'typescript';

            case '.ix':
                return 'html'; // debrix

            case '.css':
                return 'css';

            default:
                return undefined;
        }
    }

    private _name: string;
    public get name(): string {
        return this._name;
    }
    public set name(newName: string) {
        this._name = newName;
        this.#onRename.emit(newName);

        if (this._language !== undefined)
            this.#onLanguageChange.emit(this.language);
    }

    private _content: string;
    public get content(): string {
        return this._content;
    }
    public set content(newContent: string) {
        this._content = newContent;
        this.#onEdit.emit(newContent);
    }

    get ext() {
        return extname(this.name);
    }

    _language: Language | undefined;
    get language() {
        return this._language ?? VirtualFile.extToLanguage(this.ext);
    }

    set language(newLanguage: Language | undefined) {
        this._language = newLanguage;
        this.#onLanguageChange.emit(newLanguage);
    }

    constructor(
        name: string,
        content: string | null,
        language?: Language
    ) {
        this._name = name;
        this._content = content ?? '';
        this._language = language;
    }

    #onRename = new MonoEventEmitter<[string]>();
    onRenamed(listener: (newName: string) => void) {
        return this.#onRename.on(listener);
    }

    #onLanguageChange = new MonoEventEmitter<[Language | undefined]>();
    onLanguageChange(listener: (newLanguage: Language | undefined) => void) {
        return this.#onLanguageChange.on(listener);
    }

    #onEdit = new MonoEventEmitter<[string]>();
    onEdit(listener: (newContent: string) => void) {
        return this.#onEdit.on(listener);
    }

    dispose() {
        this.#onRename.dispose();
        this.#onLanguageChange.dispose();
        this.#onEdit.dispose();
    }
}

export class VirtualFileSystem implements Disposible {
    protected files: Set<VirtualFile>;

    constructor(files?: VirtualFile[]) {
        this.files = new Set(files);
    }

    find(predicate: (file: VirtualFile) => boolean): VirtualFile | null {
        return Array.from(this.files).find(predicate) ?? null;
    }

    all(): ReadonlySet<VirtualFile> {
        return this.files;
    }

    addFile(file: VirtualFile): void
    addFile(...files: VirtualFile[]): void
    addFile(...files: VirtualFile[]): void {
        for (const file of files) {
            this.files.add(file);
            this.#onFileAdded.emit(file);
        }
    }

    removeFile(file: VirtualFile, dispose = false) {
        this.files.delete(file);

        if (dispose)
            file.dispose();

        this.#onFileRemoved.emit(file, dispose);
    }

    #onFileAdded = new MonoEventEmitter<[VirtualFile]>();
    onFileAdded(listener: (file: VirtualFile) => void) {
        return this.#onFileAdded.on(listener);
    }

    #onFileRemoved = new MonoEventEmitter<[VirtualFile, boolean]>();
    onFileRemoved(listener: (file: VirtualFile, disposed: boolean) => void) {
        return this.#onFileRemoved.on(listener);
    }

    protected onEachFile(callback: (file: VirtualFile) => Revokable): Revokable {
        const revokablesMap = new Map<VirtualFile, Revokable>();
        const revokables: Revokable[] = [
            this.onFileAdded((file) => {
                revokablesMap.set(file, callback(file));
            }),

            this.onFileRemoved((file) => {
                revokablesMap.get(file)!.revoke();
            }),
        ];

        for (const file of this.files)
            revokablesMap.set(file, callback(file));

        return createRevokable(() => {
            revokeAll(revokables);
            revokeAll(Array.from(revokablesMap.values()));
            revokablesMap.clear();
        });
    }

    onFileRenamed(listener: (file: VirtualFile, newName: string) => void): Revokable {
        return this.onEachFile((file) => file.onRenamed((newName) => listener(file, newName)));
    }

    onFileLanguageChanged(listener: (file: VirtualFile, newLanguage: Language | undefined) => void): Revokable {
        return this.onEachFile((file) => file.onLanguageChange((newLanguage) => listener(file, newLanguage)));
    }

    onFileEdit(listener: (file: VirtualFile, newContent: string) => void): Revokable {
        return this.onEachFile((file) => file.onEdit((newContent) => listener(file, newContent)));
    }

    dispose() {
        for (const file of this.files)
            file.dispose();

        this.files.clear();
        this.#onFileAdded.dispose();
        this.#onFileRemoved.dispose();
    }
}
