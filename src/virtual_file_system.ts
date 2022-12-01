import { MonoEventEmitter } from "./eventemitter";
import { createRevokable, Disposible, Ext, extname, Revokable, revokeAll } from "./utils";

export type Language = 'javascript' | 'typescript' | 'html' | 'css'
const LANGUAGES: string[] = ['javascript', 'typescript', 'html', 'css'];

export type JSONVersion = 0;
const JSONVersion: JSONVersion = 0;

export interface VirtualFileJSON {
    version: JSONVersion
    name: string
    content: string
    language?: string
}

export interface VirtualFileSystemJSON {
    version: JSONVersion
    files: VirtualFileJSON[]
}

export function isValidLanguage(language: string): language is Language {
    return LANGUAGES.includes(language);
}

export function extToLanguage(ext: Ext | undefined): Language | undefined {
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

export class VirtualFile implements Disposible {
    static isValidJSON(value: unknown): value is VirtualFileSystemJSON {
        return value !== null && typeof value === 'object' && 'version' in value && value.version === JSONVersion;
    }
    
    static fromJSON(json: VirtualFileJSON) {
        return new VirtualFile(
            json.name,
            json.content,
            json.language && isValidLanguage(json.language) ? json.language : undefined
        );
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
        return this._language ?? extToLanguage(this.ext);
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

    toJSON(): VirtualFileJSON {
        return {
            version: JSONVersion,
            name: this.name,
            content: this.content,
            ...this._language && { language: this._language },
        }
    }

    dispose() {
        this.#onRename.dispose();
        this.#onLanguageChange.dispose();
        this.#onEdit.dispose();
    }
}

export class VirtualFileSystem implements Disposible {
    static isValidJSON(value: unknown): value is VirtualFileSystemJSON {
        return value !== null && typeof value === 'object' && 'version' in value && value.version === JSONVersion;
    }

    static fromJSON(json: VirtualFileSystemJSON) {
        return new VirtualFileSystem(
            json.files.map(json => VirtualFile.fromJSON(json))
        );
    }

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

    toJSON(): VirtualFileSystemJSON {
        return {
            version: JSONVersion,
            files: Array.from(this.files).map(file => file.toJSON())
        }
    }

    dispose() {
        for (const file of this.files)
            file.dispose();

        this.files.clear();
        this.#onFileAdded.dispose();
        this.#onFileRemoved.dispose();
    }
}
