import { Language } from "./virtual_file_system";
import debrix_inline from '../node_modules/debrix/index.mjs?inline';
import debrix_binders_inline from '../node_modules/debrix/binders/index.mjs?inline';
import _debrix_internal_inline from '../node_modules/@debrix/internal/index.mjs?inline';

export const index = 'index.js';

export const files: {
  readonly [_ in string]: {
    content: string,
    language?: Language,
    hidden?: boolean
  }
} = {
  [index]: {
    content: `import Main from 'main.ix';

new Main().attach(document.body);
`
  },

  'main.ix': {
    content: `using model from 'main.model.js'

<p>Hello {name} 👋</p>
`
  },

  'main.model.js': {
    content: `import { ViewModel } from 'debrix';

export default class MainViewModel extends ViewModel {
  name = 'debrix';
}
`
  },

  'debrix': {
    content: debrix_inline,
    language: 'javascript',
    hidden: true
  },

  'debrix/binders': {
    content: debrix_binders_inline,
    language: 'javascript',
    hidden: true
  },

  '@debrix/internal': {
    content: _debrix_internal_inline,
    language: 'javascript',
    hidden: true
  },
};
