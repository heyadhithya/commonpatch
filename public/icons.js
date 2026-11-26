const shapes = {
  plus:'<path d="M12 5v14M5 12h14"/>',
  map:'<path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2zM9 3v15M15 6v15"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.1 5.6-5.5 2 2.1-5.5z"/>',
  bookmark:'<path d="M6 3.5h12v17l-6-4-6 4z"/>',book:'<path d="M3 5c3-1 6-.7 9 1.4 3-2.1 6-2.4 9-1.4v14c-3-.9-6-.5-9 1.5-3-2-6-2.4-9-1.5zM12 6.4v14.1"/>',
  external:'<path d="M14 4h6v6M20 4l-9 9M10 6H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/>',
  search:'<circle cx="10" cy="10" r="6.3"/><path d="m15 15 5.5 5.5"/>',filter:'<path d="M3 6h9m4 0h5M3 12h3m4 0h11M3 18h12m4 0h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  leaf:'<path d="M4 20c3-6 6-9 12-12M5 15C3 8 9 3 21 3c0 10-4 17-12 15"/>',
  accessibility:'<circle cx="12" cy="4.4" r="1.8"/><path d="m3 8 9 2 9-2m-9 2v4m0 0-5 7m5-7 5 7"/>',
  civic:'<path d="m3 8 9-5 9 5zM5 10v7m5-7v7m4-7v7m5-7v7M3 21h18M4 18h16"/>',
  branch:'<circle cx="6.5" cy="5" r="2"/><circle cx="6.5" cy="19" r="2"/><circle cx="17.5" cy="7" r="2"/><path d="M6.5 7v10m0-3C13 14 17.5 13 17.5 9"/>',
  signal:'<path d="M2 13h4l3-8 5 14 3-8 2 2h3"/>',clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',comment:'<path d="M20 15a2 2 0 0 1-2 2h-8l-6 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
  refresh:'<path d="M20 4v6h-6M4 20v-6h6"/><path d="M19 9a7.6 7.6 0 0 0-13-4M5 15a7.6 7.6 0 0 0 13 4"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.5 6.7-4m-6.7 7 6.7 4"/>',
  check:'<path d="m4 12 5 5L20 6"/>',pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  issue:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>',
  layers:'<path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>', code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-2-15-4 18"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 4 2.2c-.9.5-1.5 1-1.5 2.4m0 2.5v.2"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.2M3 12h.2M3 18h.2"/>',sort:'<path d="M3 6h17M3 12h12M3 18h7"/>'
};
export const categories = {
  Mapping:{icon:'map',tone:'mint'}, Climate:{icon:'leaf',tone:'lime'}, Accessibility:{icon:'accessibility',tone:'purple'}, 'Open knowledge':{icon:'book',tone:'blue'}, 'Civic tech':{icon:'civic',tone:'orange'}
};
export function icon(key,size=20){return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(shapes[key]||'')+'</svg>';}
export function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
