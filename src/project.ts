import { MonoEventEmitter } from "./eventemitter";
import { client } from "./supabase";
import { Disposible, randomId, Revokable, revokeAll } from "./utils";
import { VirtualFileManager } from "./virtual_file_manager";
import { VirtualFile } from "./virtual_file_system";

export class Project implements Disposible {
    protected _revokables: Revokable[] = [];

    private _id: string | undefined;
    public get id(): string | undefined {
        return this._id;
    }
    public set id(id: string | undefined) {
        this._id = id;
        this.#onIdChange.emit(id);
    }

    private _readonly: boolean;
    public get readonly(): boolean {
        return this._readonly;
    }
    public set readonly(readonly: boolean) {
        this._readonly = readonly;
        this.#onReadonlyChange.emit(readonly);
    }

    constructor(id: string | undefined, readonly files: VirtualFileManager, readonly: boolean) {
        this._id = id;
        this._readonly = readonly;

        this._revokables.push(
            this.files.onFileAdded((file) => this.setDirty(file)),
            this.files.onFileEdit((file) => this.setDirty(file)),
            this.files.onFileRemoved((file) => this.setDirty(file)),
            this.files.onFileRenamed((file) => this.setDirty(file)),
        );
    }

    readonly dirtyFiles: ReadonlySet<VirtualFile> = new Set<VirtualFile>();

    private setDirty(file: VirtualFile) {
        (this.dirtyFiles as Set<VirtualFile>).add(file);
        this.#onDirtyChange.emit(true, file);
    }

    private clearDirty() {
        (this.dirtyFiles as Set<VirtualFile>).clear();
        this.#onDirtyChange.emit(false, undefined);
    }

    isDirty() {
        return this.dirtyFiles.size > 0;
    }

    readonly #onDirtyChange = new MonoEventEmitter<[boolean, VirtualFile | undefined]>();
    onDirtyChange(listener: (isDirty: boolean, file: VirtualFile | undefined) => void) {
        return this.#onDirtyChange.on(listener);
    }

    protected _ensureId(): string {
        return this._id ?? randomId();
    }

    protected _refreshId(): string {
        return randomId();
    }

    protected async _upload(id: string, mode: 'public' | 'private') {
        const response = await client.storage
            .from('projects-' + mode)
            .upload(id, JSON.stringify(this.files.toJSON()), {
                cacheControl: 'no-cache',
                contentType: 'application/json;charset=UTF-8',
                upsert: true
            });


        return response.error;
    }

    async save() {
        if (this.readonly)
            return await this.fork();

        const oldId = this.id;
        const newId = this._ensureId();
        const error = await this._upload(newId, 'private');

        if (error === null) {
            if (newId !== oldId)
                this.id = newId;

            this.clearDirty();
            this.readonly = false;
        }

        this.#onSave.emit({
            error,
            newId,
            oldId
        });
    }

    async fork() {
        const oldId = this.id;
        const newId = this._refreshId();
        const error = await this._upload(newId, 'private');

        if (error === null) {
            this.id = newId;
            this.clearDirty();
            this.readonly = false;
        }

        this.#onFork.emit({
            error,
            newId,
            oldId
        });
    }

    async share() {
        const publicId = this._refreshId();
        const error = await this._upload(publicId, 'public');

        this.#onShare.emit({
            error,
            publicId,
            privateId: this.id
        });
    }

    readonly #onSave = new MonoEventEmitter<[{ error: Error | null, oldId: string | undefined, newId: string }]>();
    onSave(listener: (result: { error: Error } | { error: null, oldId: string | undefined, newId: string }) => void): Revokable {
        return this.#onSave.on(listener);
    }

    readonly #onFork = new MonoEventEmitter<[{ error: Error | null, oldId: string | undefined, newId: string }]>();
    onFork(listener: (result: { error: Error } | { error: null, oldId: string | undefined, newId: string }) => void): Revokable {
        return this.#onFork.on(listener);
    }

    readonly #onShare = new MonoEventEmitter<[{ error: Error | null, privateId: string | undefined, publicId: string }]>();
    onShare(listener: (result: { error: Error } | { error: null, privateId: string | undefined, publicId: string }) => void): Revokable {
        return this.#onShare.on(listener);
    }

    readonly #onIdChange = new MonoEventEmitter<[string | undefined]>();
    onIdChange(listener: (newId: string | undefined) => void): Revokable {
        return this.#onIdChange.on(listener);
    }

    readonly #onReadonlyChange = new MonoEventEmitter<[boolean]>();
    onReadonlyChange(listener: (readonly: boolean) => void): Revokable {
        return this.#onReadonlyChange.on(listener);
    }

    dispose() {
        this.clearDirty();
        this.#onSave.dispose();
        this.#onFork.dispose();
        this.#onShare.dispose();
        this.#onIdChange.dispose();
        this.#onDirtyChange.dispose();
        revokeAll(this._revokables);
    }
}
