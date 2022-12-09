export const index = 'index.js';

const DEBRIX_VERSION = '0.1.0-alpha.7';

export const files: { readonly [_ in string]: string } = {
  // - index.js -
  [index]: `import Main from 'main.ix';

new Main().insert(document.body);
`,

  // - main.ix -
  'main.ix': `using model from 'main.model.js'

<p>Hello {name} 👋</p>
`,

  // - main.model.js -
  'main.model.js': `import { ViewModel } from 'https://cdn.skypack.dev/debrix@${DEBRIX_VERSION}';

export default class MainViewModel extends ViewModel {
  name = 'debrix';
}
`,
};
