/** IndexedDB mínimo (sin dependencias) para la cola de envíos: guarda fotos como Blob, que localStorage no puede. */
const DB_NAME = 'avocado'
const VERSION = 1
export const OUTBOX = 'outbox'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(OUTBOX)) req.result.createObjectStore(OUTBOX, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        tx.oncomplete = () => resolve(req.result)
        tx.onerror = tx.onabort = () => reject(tx.error)
      }),
  )
}

export const idbAll = <T>(store: string) => run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
export const idbPut = <T>(store: string, value: T) => run(store, 'readwrite', (s) => s.put(value)).then(() => undefined)
export const idbDelete = (store: string, key: string) => run(store, 'readwrite', (s) => s.delete(key)).then(() => undefined)
export const idbClear = (store: string) => run(store, 'readwrite', (s) => s.clear()).then(() => undefined)
