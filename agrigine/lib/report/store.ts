// Where saved reports live. Today that's this browser's storage. Once accounts exist, a server store with the same
// three methods replaces it, and sharing a report means adding account ids to its sharedWith list.
import type { ReportSpec } from './spec';

export interface ReportStore {
  list(): ReportSpec[];
  save(spec: ReportSpec): void;
  remove(id: string): void;
}

const KEY = 'agrigine.reports.v1';

function read(): ReportSpec[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(list: ReportSpec[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export const browserStore: ReportStore = {
  list: () => read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  save: spec => {
    if (!write([spec, ...read().filter(r => r.id !== spec.id)])) throw new Error('This browser blocked saving. Download the settings file instead.');
  },
  remove: id => { write(read().filter(r => r.id !== id)); },
};
