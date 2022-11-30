import { Revokable } from "./utils";

export class MonoEventEmitter<Args extends unknown[] = unknown[]> {
    private _listeners = new Set<(...args: Args) => void>();

    on(listener: (...args: Args) => void): Revokable {
        this._listeners.add(listener);

        return {
            revoke: () =>
                this._listeners.delete(listener),
        }
    }

    emit(...args: Args): void {
        for (const listener of this._listeners)
            listener(...args);
    }

    dispose() {
        this._listeners.clear();
    }
}