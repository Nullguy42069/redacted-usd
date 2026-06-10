// Simple per-browser address book stored in localStorage.
// Follows the same pattern as vault-store.ts (private by default, no server sync).

const STORAGE_KEY = "redacted-address-book";

export type AddressBookEntry = {
  address: string; // base58
  name: string;
  addedAt: string; // ISO
};

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadAddressBook(): AddressBookEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AddressBookEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveAddressBook(entries: AddressBookEntry[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function addEntry(entry: Omit<AddressBookEntry, "addedAt">): AddressBookEntry[] {
  const list = loadAddressBook();
  const exists = list.some((e) => e.address === entry.address);
  if (exists) {
    // Update name if it already exists
    const updated = list.map((e) =>
      e.address === entry.address ? { ...e, name: entry.name } : e
    );
    saveAddressBook(updated);
    return updated;
  }
  const newEntry: AddressBookEntry = {
    ...entry,
    addedAt: new Date().toISOString(),
  };
  const next = [newEntry, ...list];
  saveAddressBook(next);
  return next;
}

export function removeEntry(address: string): AddressBookEntry[] {
  const list = loadAddressBook().filter((e) => e.address !== address);
  saveAddressBook(list);
  return list;
}

export function updateEntry(address: string, patch: Partial<AddressBookEntry>): AddressBookEntry[] {
  const list = loadAddressBook().map((e) =>
    e.address === address ? { ...e, ...patch } : e
  );
  saveAddressBook(list);
  return list;
}
