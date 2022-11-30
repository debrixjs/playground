import { MonoEventEmitter } from "./eventemitter";
import { VirtualFileSystem, VirtualFile } from "./virtual_file_system";

export class VirtualFileManager extends VirtualFileSystem {
    private _active: VirtualFile | null = null;
    public get active(): VirtualFile | null {
        return this._active;
    }
    public set active(file: VirtualFile | null) {
        this._active = file;
        this.#onActiveFileChanged.emit(file);
    }

    #onActiveFileChanged = new MonoEventEmitter<[VirtualFile | null]>();
    onActiveFileChanged(listener: (activeFile: VirtualFile | null) => void) {
        return this.#onActiveFileChanged.on(listener);
    }
}