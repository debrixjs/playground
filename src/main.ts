import './style.css'
import '@vscode/codicons/dist/codicon.css'

import * as preset from './preset';
import { createEditor } from './editor';
import { createPreview } from './preview';
import { VirtualFileManager } from './virtual_file_manager';
import { VirtualFile } from './virtual_file_system';
import { createElement, searchParams, setSearchParams } from './utils';
import { client } from './supabase';

async function getFileManager() {
  if (searchParams.has('id')) {
    const projectId = searchParams.get('id')!;
  
    const response = await client.storage
      .from('projects')
      .download(projectId);
  
    if (response.error) {
      alert('Failed to load saved project!');
      searchParams.delete('id');
      setSearchParams();
    } else {
      const content = await response.data.arrayBuffer();
      const decoder = new TextDecoder('utf-8');
  
      const json = JSON.parse(decoder.decode(content)) as unknown;

      if (VirtualFileManager.isValidJSON(json))
        return VirtualFileManager.fromJSON(json);
    }
  }

  return new VirtualFileManager(
    Object.entries(preset.files).map((args) => new VirtualFile(...args))
  );
}

const files = await getFileManager();
files.active = files.find(file => file.name === preset.index);

const container = createElement({ tag: 'main' });
document.body.append(container);

createEditor(container, files);
createPreview(container, files);
