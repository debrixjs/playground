import './style.css'
import '@vscode/codicons/dist/codicon.css'

import * as preset from './preset';
import { createEditor } from './editor';
import { createPreview } from './preview';
import { VirtualFileManager } from './virtual_file_manager';
import { VirtualFile } from './virtual_file_system';
import { createElement, searchParams, setSearchParams } from './utils';
import { client } from './supabase';
import { Project } from './project';
import { alert, prompt } from './popup';

function isProjectType(type: unknown): type is 'public' | 'private' {
  return type === 'public' || type === 'private';
}

async function getFileManager() {
  const id = searchParams.get('id');
  const type = searchParams.get('type');

  if ((id || type) && !isProjectType(type)) {
    await alert({
      severity: 'error',
      header: 'Invalid link',
      text: `Something is not right with the search parameters. The search parameters will be deleted.`,
    });

    searchParams.delete('id');
    searchParams.delete('type');
    setSearchParams();
  }

  if (id && type) {
    const response = await client.storage
      .from('projects-' + type)
      .download(id);

    if (response.error) {
      await alert({
        header: 'Failed to load saved project!',
        negative: false
      });
      searchParams.delete('id');
      searchParams.delete('type');
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

async function main() {
  const files = await getFileManager();
  const readonly = searchParams.get('type') === 'public';
  files.active = files.find(file => file.name === preset.index);

  const project = new Project(searchParams.get('id') ?? undefined, files, readonly);

  project.onSave(async (result) => {
    if (result.error) {
      await alert({
        severity: 'error',
        header: 'Failed to save project!',
        text: result.error.message
      });
    } else {
      if (result.newId !== result.oldId) {
        await alert({
          header: 'Project was successfully created!',
          text: `The project was successfully created and uploaded to the cloud with the id '${result.newId}'.<p><em>Tip! Press <code>ctrl+shift+s</code> to share your project.</em></p>`
        });
      } else {
        await alert({
          header: 'Project was successfully saved!',
          text: `<em>Tip! Press <code>ctrl+shift+s</code> to share your project.</em>`
        });
      }
    }
  });

  project.onFork(async (result) => {
    if (result.error) {
      await alert({
        severity: 'error',
        header: 'Failed to fork project!',
        text: result.error.message
      });
    } else {
      await alert({
        header: 'Project was successfully forked!',
        text: `The project was successfully forked and uploaded to the cloud with the id '${result.newId}'.<p><em>Tip! Press <code>ctrl+shift+s</code> to share your project.</em></p>`
      });
    }
  });

  project.onShare(async (result) => {
    if (result.error) {
      await alert({
        severity: 'error',
        header: 'Failed to share project!',
        text: result.error.message
      });
    } else {
      const url = new URL(location.origin);
      url.searchParams.set('id', result.publicId);
      url.searchParams.set('type', 'public');

      const urlSameOrigin = url.pathname + url.search + url.hash;

      const response = await prompt({
        header: 'Your project is publicly available!',
        text: `Your project has been published and is publicly available at <a href="${url.toString()}" onclick="() => history.pushState(null, '', '${urlSameOrigin}')">${url.toString()}</a>. The project is permanent (not deletable) and read-only.`,
        primary: 'Copy'
      });

      if (response.choise === 'primary')
        await navigator.clipboard.writeText(url.toString());
    }
  });

  project.onIdChange((newId) => {
    if (newId === undefined) {
      searchParams.delete('id');
      searchParams.delete('type');
      setSearchParams();
    } else {
      searchParams.set('id', newId);
      searchParams.set('type', 'private');
      setSearchParams();
    }
  });

  const container = createElement({ tag: 'main' });
  document.body.append(container);

  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.ctrlKey && event.code === 'KeyS') {
      event.preventDefault();

      if (event.altKey && !event.shiftKey)
        project.fork();
      else if (event.shiftKey && !event.altKey)
        project.share();
      else
        project.save();
    }
  });

  if (import.meta.env.PROD) {
    window.addEventListener('beforeunload', (event) => {
      if (!project.isDirty())
        return;

      event.preventDefault();
      return event.returnValue = 'Are you sure you want to exit?';
    });
  }

  createEditor(container, project);
  createPreview(container, files);

  document.body.append(
    createElement({
      tag: 'iframe',
      class: "gh-star",
      attr: {
        src: "https://ghbtns.com/github-btn.html?user=debrixjs&repo=debrix&type=star&count=true",
        frameborder: "0",
        scrolling: "0",
        width: "100",
        height: "20",
        title: "GitHub Stargazers",
      }
    })
  );
}

main();
