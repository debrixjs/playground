import { defineConfig, Plugin } from 'vite'
import { createFilter, dataToEsm, FilterPattern } from '@rollup/pluginutils'

interface PluginInlineOptions {
    include?: FilterPattern
    exclude?: FilterPattern
}

function pluginInline(options?: PluginInlineOptions): Plugin {
    const filter = createFilter(
        options?.include ?? ['**/*?inline'],
        options?.exclude
    );

    return {
        name: 'inline',
        transform(code, id) {
            if (filter(id))
                return dataToEsm(code);
        },
    };
}

export default defineConfig({
    plugins: [
        pluginInline()
    ]
});