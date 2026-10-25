// Dependency-free behavior checks: node --test tests/api.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor() { this.children = []; this.value = ''; this.disabled = false; this.listeners = {}; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  focus() { this.focused = true; }
  querySelectorAll() { return this.children.flatMap(child => child.children).filter(child => child.listeners.click); }
}

function setup() {
  const elements = Object.fromEntries(['load-btn', 'submit-btn', 'note-form', 'title-input', 'body-input', 'status', 'notes-list'].map(id => [id, new Element()]));
  elements['note-form'].reset = () => { elements['title-input'].value = ''; elements['body-input'].value = ''; };
  let reply = async () => ({ ok: true, status: 200, json: async () => [] });
  const calls = [];
  const context = vm.createContext({
    document: { getElementById: id => elements[id], createElement: () => new Element() },
    fetch: async (...args) => { calls.push(args); return reply(...args); }
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '..', 'api.js'), 'utf8'), context);
  return { elements, calls, run: code => vm.runInContext(code, context),
    reply: (data, status = 200) => { reply = async () => ({ ok: status < 400, status, json: async () => data }); },
    fail: () => { reply = async () => { throw new Error('Offline'); }; },
    pending: () => { let finish; reply = () => new Promise(resolve => { finish = resolve; }); return () => finish({ ok: true, status: 200, json: async () => [] }); }
  };
}

test('GET renders ten notes, loading state, disabled buttons, and empty state', async () => {
  const app = setup();
  const finish = app.pending();
  const pending = app.run('loadNotes()');
  assert.equal(app.elements.status.textContent, 'Loading notes...');
  assert.equal(app.elements['load-btn'].disabled, true);
  assert.equal(app.elements['submit-btn'].disabled, true);
  finish(); await pending;
  assert.match(app.elements['notes-list'].children[0].textContent, /No notes/);
  app.reply(Array.from({ length: 10 }, (_, id) => ({ id: id + 1, title: '<script>text only</script>', body: 'Body' })));
  await app.run('loadNotes()');
  assert.equal(app.calls[1][0], 'https://jsonplaceholder.typicode.com/posts?_limit=10');
  assert.equal(app.elements['notes-list'].children.length, 10);
  assert.equal(app.elements['notes-list'].children[0].children[0].textContent, '<script>text only</script>');
  assert.equal(app.elements.status.textContent, 'Loaded 10 notes from the server.');
  assert.equal(app.elements['load-btn'].disabled, false);
});

test('POST validates title, sends JSON, prepends note, and resets form', async () => {
  const app = setup();
  for (const title of ['   ', 'a'.repeat(101)]) {
    app.elements['title-input'].value = title;
    await app.run('createNote({ preventDefault() {} })');
    assert.equal(app.calls.length, 0);
    assert.equal(app.elements.status.className, 'error');
  }
  app.elements['title-input'].value = '  New note  ';
  app.reply({ id: 101 }, 201);
  await app.run('createNote({ preventDefault() {} })');
  assert.equal(app.calls[0][1].method, 'POST');
  assert.deepEqual(JSON.parse(app.calls[0][1].body), { title: 'New note', body: '', userId: 1 });
  assert.equal(app.elements['notes-list'].children[0].children[0].textContent, 'New note');
  assert.match(app.elements.status.textContent, /status 201, id 101/);
  assert.equal(app.elements['title-input'].value, '');
  assert.equal(app.elements['submit-btn'].disabled, false);
});

test('DELETE handles duplicate practice IDs and last-note empty state', async () => {
  const app = setup();
  app.reply({ id: 101 }, 201);
  for (const title of ['First', 'Second']) {
    app.elements['title-input'].value = title;
    await app.run('createNote({ preventDefault() {} })');
  }
  app.reply({}, 200);
  await app.run('deleteNote(notes[0])');
  assert.equal(app.calls[2][0], 'https://jsonplaceholder.typicode.com/posts/101');
  assert.equal(app.calls[2][1].method, 'DELETE');
  assert.equal(app.elements['notes-list'].children.length, 1);
  assert.equal(app.elements['notes-list'].children[0].children[0].textContent, 'First');
  app.reply(null, 204);
  await app.run('deleteNote(notes[0])');
  assert.match(app.elements['notes-list'].children[0].textContent, /No notes/);
});

test('HTTP and network errors preserve notes/drafts and release buttons', async () => {
  const app = setup();
  app.reply([{ id: 1, title: 'Keep', body: '' }]);
  await app.run('loadNotes()');
  app.reply({}, 500);
  await app.run('deleteNote(notes[0])');
  assert.equal(app.elements['notes-list'].children.length, 1);
  assert.equal(app.elements.status.className, 'error');
  app.elements['title-input'].value = 'Keep draft';
  app.fail();
  await app.run('createNote({ preventDefault() {} })');
  assert.equal(app.elements['title-input'].value, 'Keep draft');
  await app.run('loadNotes()');
  assert.equal(app.elements.status.className, 'error');
  assert.equal(app.elements['load-btn'].disabled, false);
  assert.equal(app.elements['submit-btn'].disabled, false);
  assert.equal(app.elements['notes-list'].children[0].children.at(-1).disabled, false);
});
