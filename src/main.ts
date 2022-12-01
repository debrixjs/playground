import './style.css'
import '@vscode/codicons/dist/codicon.css'

import * as preset from './preset';
import { createEditor } from './editor';
import { createPreview } from './preview';
import { VirtualFileManager } from './virtual_file_manager';
import { VirtualFile } from './virtual_file_system';
import { createElement } from './utils';

const files = new VirtualFileManager(
  Object.entries(preset.files).map((args) => new VirtualFile(...args))
);

files.active = files.find(file => file.name === preset.index);

const container = createElement({ tag: 'main' });
document.body.append(container);

createEditor(container, files);
createPreview(container, files);

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.code === 'KeyS') {
    event.preventDefault();
    alert('Saving/sharing code is currently not possible :(');
  }
});
