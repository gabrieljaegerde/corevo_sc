const CONTACTS_KEY = "corevo:contacts";

// ─── Contacts ────────────────────────────────────────────────────

export type Contacts = Record<string, string>; // lowercase address → name

function loadContacts(): Contacts {
  try {
    return JSON.parse(localStorage.getItem(CONTACTS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveContacts(c: Contacts): void {
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(c));
}

export function getContact(address: string): string | undefined {
  return loadContacts()[address.toLowerCase()];
}

export function setContact(address: string, name: string): void {
  const c = loadContacts();
  c[address.toLowerCase()] = name;
  saveContacts(c);
}

export function deleteContact(address: string): void {
  const c = loadContacts();
  delete c[address.toLowerCase()];
  saveContacts(c);
}

export function getAllContacts(): Contacts {
  return loadContacts();
}

/** Import contacts from CSV-style text: "address,name" per line. Returns count imported. */
export function importContacts(text: string): number {
  const c = loadContacts();
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf(",");
    if (sep === -1) continue;
    const addr = trimmed.slice(0, sep).trim();
    const name = trimmed.slice(sep + 1).trim();
    if (/^0x[0-9a-fA-F]{40}$/i.test(addr) && name) {
      c[addr.toLowerCase()] = name;
      count++;
    }
  }
  saveContacts(c);
  return count;
}

/** Export all contacts as CSV text. */
export function exportContacts(): string {
  const c = loadContacts();
  return Object.entries(c)
    .map(([addr, name]) => `${addr},${name}`)
    .join("\n");
}
