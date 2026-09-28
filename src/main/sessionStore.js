import path from 'node:path';
import { app } from 'electron';
import { createSessionStore } from './persistence.js';
let store;
function current() { return store ||= createSessionStore(path.join(app.getPath('userData'), 'session.json')); }
export const readSession = () => current().read();
export const saveSession = data => current().save(data);
export const clearSession = () => current().clear();
export const flushSession = () => current().flush();
