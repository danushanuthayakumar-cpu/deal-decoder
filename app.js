import { rank } from './compare.mjs';

const $ = (selector) => document.querySelector(selector);
const search = $('#search');
const form = $('#offer-form');
const editor = $('#editor');
const money = new Intl.NumberFormat('en-CA', {style:'currency', currency:'CAD'});
const key = 'deal-decoder-v1';
let saved = [];
try {
  const value = JSON.parse(localStorage.getItem(key) || '[]');
  if (Array.isArray(value)) saved = value;
} catch {}
let active = null;
let sample = false;
let channel = 'all';
let editing = null;
let live = [];
let request;

const examples = [
  {id:'1', store:'Example Outlet', type:'pickup', price:34, km:19, minutes:26, fees:0, stock:'in'},
  {id:'2', store:'Example Local Shop', type:'pickup', price:39, km:4, minutes:10, fees:0, stock:'in'},
  {id:'3', store:'Example Online Store', type:'online', price:42, shipping:4.99, eta:'2–4 business days', fees:0, stock:'in'},
  {id:'4', store:'Example Discount Shop', type:'online', price:31, shipping:3.99, fees:0, stock:'out'}
];

function element(tag, content, className) {
  const node = document.createElement(tag);
  node.textContent = content;
  if (className) node.className = className;
  return node;
}
function external(label, url) {
  const link = element('a', label);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}
function safeURL(value) {
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol)) return url.href;
  } catch {}
  return '';
}
function routeURL(address, mode = 'dir') {
  const params = mode === 'dir'
    ? {origin:active?.location || '', destination:address}
    : {query:address};
  return `https://www.google.com/maps/${mode}/?` + new URLSearchParams({api:'1', ...params});
}
function setMode() {
  $('#mode').textContent = sample ? 'Example only · Fictional wireless mouse offers in Waterloo, ON'
    : active ? `${active.product} · ${active.location}` : 'Add prices you find or try a worked example.';
  $('#sample').textContent = sample ? 'Exit example' : 'Try example';
}
function render() {
  setMode();
  const offers = sample ? examples : active ? [...saved.filter((item) => item.key === active.key), ...live] : [];
  const mode = $('#sort').value;
  const rate = $('#rate').validity.valid ? Number($('#rate').value) : 0;
  const timeRate = $('#time-rate').validity.valid ? Number($('#time-rate').value) : 0;
  const entries = rank(offers.filter((item) => channel === 'all' || item.type === channel), {mode, rate, timeRate});
  const root = $('#offers');
  root.replaceChildren();
  if (!entries.length) {
    root.append(element('p', offers.length ? 'No offers in this view.' : 'No offers yet. Start with a product and location, or try the example.', 'empty'));
    return;
  }
  for (const [index, {item, total, score, ready, extra}] of entries.entries()) {
    const row = element('article', '', 'card');
    const title = element('div', '');
    if (index === 0 && ready) title.append(element('span', mode === 'trip' ? 'Shortest pickup' : mode === 'value' ? 'Best with travel time' : 'Lowest total', 'best'));
    title.append(element('h3', item.store), element('small', item.title || (item.type === 'pickup' ? 'Nearby pickup' : 'Online delivery')));
    if (item.address) title.append(element('small', item.address));
    const details = element('div', '');
    details.append(element('small', item.stock === 'in' ? 'In stock' : item.stock === 'out' ? 'Out of stock' : 'Stock unverified'));
    if (item.type === 'pickup') {
      details.append(element('small', item.km == null ? 'Distance unknown' : `${item.km} km one way`),
        element('small', item.minutes == null ? 'Travel time unknown' : `${item.minutes} min one way`));
    } else {
      details.append(element('small', item.eta || 'Delivery estimate unknown'));
    }
    const cost = element('div', '');
    cost.append(element('strong', total == null ? 'Total unknown' : money.format(total)),
      element('small', `${money.format(item.price)} item${extra == null ? '' : ' + ' + money.format(extra) + ' extras'}`));
    if (mode === 'value' && ready && item.type === 'pickup') cost.append(element('small', `${money.format(score)} with time`));
    const actions = element('div', '', 'buttons');
    if (safeURL(item.url)) actions.append(external('View listing', item.url));
    if (item.type === 'pickup' && item.address) actions.append(external('Directions', routeURL(item.address)));
    if (!sample) {
      const edit = element('button', item.live ? 'Use offer' : 'Edit');
      edit.addEventListener('click', () => openEditor(item));
      actions.append(edit);
    }
    row.append(title, details, cost, actions);
    root.append(row);
  }
}

search.addEventListener('submit', async (event) => {
  event.preventDefault();
  const product = search.elements.product.value.trim();
  const location = search.elements.location.value.trim();
  if (!product || !location) { $('#search-status').textContent = 'Enter both a product and a starting location.'; return; }
  sample = false;
  active = {product, location, key: JSON.stringify([product.toLowerCase(), location.toLowerCase()])};
  const links = $('#links');
  const nearby = `${product} near ${location}`;
  links.replaceChildren(
    external('Find nearby stock', 'https://www.google.com/search?' + new URLSearchParams({q:`${nearby} in stock pickup`})),
    external('Find nearby stores', routeURL(nearby, 'search')),
    external('Shop online', 'https://www.google.com/search?' + new URLSearchParams({q:`${product} ${location} Canada`, tbm:'shop', gl:'ca'}))
  );
  links.hidden = false;
  request?.abort();
  const current = new AbortController();
  request = current;
  live = [];
  choose('all');
  $('#search-status').textContent = 'Opening a search link lets you verify price and stock, then add the offer here.';
  // The optional companion server provides live leads on the same origin.
  if (document.documentElement.dataset.live !== 'true') return;
  $('#search-status').textContent = 'Searching for live listings…';
  try {
    const response = await fetch('/api/offers?' + new URLSearchParams({product, location}), {signal:current.signal});
    if (!response.ok) throw new Error('Search unavailable');
    const data = await response.json();
    if (current.signal.aborted) return;
    live = data.offers;
    $('#search-status').textContent = live.length
      ? 'Live listing leads. Check the exact variant, availability and fees before ranking.'
      : 'No live listings found. Use the search links to check other stores.';
    render();
  } catch (error) {
    if (error.name !== 'AbortError') $('#search-status').textContent = 'Live listings are unavailable. Use the search links to check stores.';
  }
});

function choose(value) {
  channel = value;
  document.querySelectorAll('[data-type]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.type === value)));
  render();
}
function syncFields() {
  const pickup = form.elements.type.value === 'pickup';
  for (const [id, visible] of [['#pickup-fields', pickup], ['#online-fields', !pickup]]) {
    $(id).hidden = !visible;
    $(id).querySelectorAll('input').forEach((input) => { input.disabled = !visible; });
  }
  const address = form.elements.address.value.trim();
  $('#route').hidden = !address;
  $('#route').href = routeURL(address);
}
function openEditor(item) {
  editing = item && !item.live ? item.id : null;
  form.reset();
  form.elements.store.setCustomValidity('');
  form.elements.url.setCustomValidity('');
  $('#editor-title').textContent = editing ? 'Edit offer' : 'Add offer';
  $('#remove').hidden = !editing;
  if (item) {
    for (const name of ['type','stock','store','price','url','address','km','minutes','shipping','eta','fees']) {
      if (item[name] != null) form.elements[name].value = item[name];
    }
  }
  syncFields();
  editor.showModal();
}
function save(next) {
  try { localStorage.setItem(key, JSON.stringify(next)); }
  catch { alert('This browser could not save the offer.'); return; }
  saved = next;
  editor.close();
  render();
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const fields = new FormData(form);
  const value = (name) => fields.get(name)?.trim() ?? '';
  const number = (name) => value(name) === '' ? null : Number(value(name));
  const store = value('store');
  const url = safeURL(value('url'));
  if (!store) { form.elements.store.setCustomValidity('Enter a retailer name.'); form.elements.store.reportValidity(); return; }
  if (value('url') && !url) { form.elements.url.setCustomValidity('Use an http or https link.'); form.elements.url.reportValidity(); return; }
  const pickup = value('type') === 'pickup';
  const item = {id:editing || crypto.randomUUID(), key:active.key, type:value('type'), stock:value('stock'),
    store, url, price:number('price'), fees:number('fees') ?? 0,
    ...(pickup ? {address:value('address'), km:number('km'), minutes:number('minutes')} :
      {shipping:number('shipping'), eta:value('eta')})};
  save(editing ? saved.map((old) => old.id === editing ? item : old) : [...saved, item]);
});
for (const name of ['store', 'url']) form.elements[name].addEventListener('input', () => form.elements[name].setCustomValidity(''));
form.elements.type.addEventListener('change', syncFields);
form.elements.address.addEventListener('input', syncFields);
$('#close').addEventListener('click', () => editor.close());
$('#remove').addEventListener('click', () => {
  if (confirm('Remove this offer?')) save(saved.filter((offer) => offer.id !== editing));
});
$('#add').addEventListener('click', () => {
  if (!active) {
    $('#search-status').textContent = 'Enter the product and location, then select Find offers.';
    search.elements.product.focus();
    return;
  }
  if (sample) { sample = false; choose('all'); }
  openEditor();
});
$('#sample').addEventListener('click', () => { sample = !sample; choose('all'); });
document.querySelectorAll('[data-type]').forEach((button) => button.addEventListener('click', () => choose(button.dataset.type)));
for (const id of ['#sort','#rate','#time-rate']) $(id).addEventListener('input', render);
window.addEventListener('storage', (event) => {
  if (event.key !== key) return;
  try { saved = JSON.parse(event.newValue || '[]'); render(); } catch {}
});
render();
