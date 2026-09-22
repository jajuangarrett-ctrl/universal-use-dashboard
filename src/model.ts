export const CONFIG = '_dashboard.json';
export const BASE = '_dashboard.base';
export const VIEW = 'fjg-universal-dashboard';
export const SECTIONS = ['featured', 'pinned', 'folders', 'overview', 'resources', 'recent'] as const;
export type Section = typeof SECTIONS[number];
export type Layout = 'cards' | 'list' | 'compact' | 'table' | 'portal';
export type Template = 'resource-hub' | 'program-area';
export interface FolderConfig {
  schema: 1; enabled: boolean; inherit: boolean; template: Template;
  title: string; description: string; layout: Layout; descendants: boolean;
  sort: 'title' | 'modified' | 'status'; cardSize: 'small' | 'medium' | 'large';
  sections: Section[]; hidden: Section[]; pinned: string[]; featured: string[];
  filters: Record<string, string>;
}
export const defaults = (): FolderConfig => ({
  schema: 1, enabled: true, inherit: true, template: 'resource-hub', title: '', description: '',
  layout: 'cards', descendants: true, sort: 'title', cardSize: 'medium',
  sections: [...SECTIONS], hidden: ['overview'], pinned: [], featured: [], filters: {},
});
export function parseConfig(text: string): FolderConfig {
  const value = JSON.parse(text);
  if (!value || value.schema !== 1 || typeof value !== 'object') throw new Error('Unsupported dashboard configuration. Expected schema 1.');
  const d = defaults();
  for (const key of ['enabled', 'inherit', 'descendants'] as const) {
    if (key in value && typeof value[key] !== 'boolean') throw new Error(`Invalid ${key} setting.`);
    if (key in value) d[key] = value[key];
  }
  for (const key of ['title', 'description'] as const) if (typeof value[key] === 'string') d[key] = value[key];
  if (['resource-hub', 'program-area'].includes(value.template)) d.template = value.template;
  if (['cards', 'list', 'compact', 'table', 'portal'].includes(value.layout)) d.layout = value.layout;
  if (['small', 'medium', 'large'].includes(value.cardSize)) d.cardSize = value.cardSize;
  if (['title', 'modified', 'status'].includes(value.sort)) d.sort = value.sort;
  for (const key of ['pinned', 'featured'] as const) if (Array.isArray(value[key])) d[key] = [...new Set<string>(value[key].filter((x: unknown) => typeof x === 'string'))];
  if (Array.isArray(value.sections)) d.sections = [...new Set<Section>([...value.sections.filter((x: Section) => SECTIONS.includes(x)), ...SECTIONS])];
  if (Array.isArray(value.hidden)) d.hidden = value.hidden.filter((x: Section) => SECTIONS.includes(x));
  if (value.filters && typeof value.filters === 'object') for (const k of ['type', 'status', 'program', 'tags']) if (typeof value.filters[k] === 'string') d.filters[k] = value.filters[k];
  return d;
}
export function join(folder: string, name: string): string { return folder && folder !== '/' ? `${folder}/${name}` : name; }
export function within(path: string, folder: string, descendants = true): boolean {
  const prefix = folder && folder !== '/' ? folder + '/' : '';
  if (!path.startsWith(prefix)) return false;
  const tail = path.slice(prefix.length);
  return Boolean(tail) && (descendants || !tail.includes('/'));
}
export function ancestors(folder: string): string[] {
  const parts = folder === '/' ? [] : folder.split('/').filter(Boolean);
  return Array.from({length: parts.length + 1}, (_, i) => parts.slice(0, parts.length - i).join('/') || '/');
}
export function inherited(config: FolderConfig): FolderConfig { return {...structuredClone(config), title: '', description: '', pinned: [], featured: []}; }
export function baseDocument(folder: string, descendants: boolean): string {
  // JSON is valid YAML. Quoting the expression separately prevents folder names becoming executable query fragments.
  const root = folder === '/' ? '' : folder;
  const scope = descendants ? (root ? `file.inFolder(${JSON.stringify(root)})` : 'true') : `file.folder == ${JSON.stringify(root)}`;
  return JSON.stringify({filters: {and: [scope, `file.name != "${CONFIG}"`, `file.name != "${BASE}"`]}, views: [{type: VIEW, name: 'Dashboard', folder: root || '/'}]}, null, 2) + '\n';
}
export function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(strings);
  return typeof value === 'string' || typeof value === 'number' ? [String(value)] : [];
}
export interface Resource {
  path: string; title: string; description: string; icon: string; image: string;
  type: string[]; status: string[]; program: string[]; tags: string[];
  mtime: number; featured: boolean; pinned: boolean;
}
export function resource(path: string, basename: string, extension: string, mtime: number, fm: Record<string, unknown> = {}): Resource {
  return {path, title: strings(fm.title)[0] || basename, description: strings(fm.summary ?? fm.description)[0] || '',
    icon: strings(fm.icon)[0] || '', image: strings(fm.banner ?? fm.image)[0] || '',
    type: strings(fm.type).length ? strings(fm.type) : [extension.toUpperCase()], status: strings(fm.status), program: strings(fm.program),
    tags: strings(fm.tags).flatMap(x => x.split(/[,\s]+/)).map(x => x.replace(/^#/, '')).filter(Boolean),
    mtime, featured: fm.featured === true, pinned: fm.pinned === true};
}
export function select(items: Resource[], query: string, filters: Record<string, string>, sort: FolderConfig['sort']): Resource[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.filter(r => words.every(w => [r.title, r.description, r.path, ...r.tags, ...r.type, ...r.status, ...r.program].join(' ').toLocaleLowerCase().includes(w)) &&
    Object.entries(filters).every(([k,v]) => !v || (['type','status','program','tags'].includes(k) && (r[k as 'type'] as string[]).includes(v))))
    .sort((a,b) => sort === 'modified' ? b.mtime-a.mtime || a.path.localeCompare(b.path) : sort === 'status' ? a.status.join().localeCompare(b.status.join()) || a.title.localeCompare(b.title) : a.title.localeCompare(b.title, undefined, {numeric:true}));
}
export function safeName(name: string): string {
  const trimmed = name.trim().replace(/\.md$/i, '');
  if (!trimmed || /[\\/:*?"<>|\x00-\x1f]/.test(trimmed) || trimmed === '.' || trimmed === '..' || trimmed.startsWith('.')) throw new Error('Use a note name without slashes or reserved characters.');
  return trimmed + '.md';
}
