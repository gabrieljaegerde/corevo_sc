import { useState, useCallback } from "react";
import {
  getAllContacts,
  setContact,
  deleteContact,
  importContacts,
  exportContacts,
  type Contacts as ContactsMap,
} from "../store";

interface Props {
  onUpdate: () => void;
}

export default function Contacts({ onUpdate }: Props) {
  const [contacts, setContacts] = useState<ContactsMap>(getAllContacts);
  const [newAddr, setNewAddr] = useState("");
  const [newName, setNewName] = useState("");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const refresh = useCallback(() => {
    setContacts(getAllContacts());
    onUpdate();
  }, [onUpdate]);

  function handleAdd() {
    const addr = newAddr.trim();
    const name = newName.trim();
    if (!/^0x[0-9a-fA-F]{40}$/i.test(addr)) {
      setError("Invalid address format.");
      return;
    }
    if (!name) {
      setError("Enter a name.");
      return;
    }
    setError("");
    setContact(addr, name);
    setNewAddr("");
    setNewName("");
    refresh();
  }

  function handleDelete(addr: string) {
    deleteContact(addr);
    refresh();
  }

  function handleImport() {
    const count = importContacts(importText);
    setImportText("");
    setShowImport(false);
    setMsg(`Imported ${count} contact${count !== 1 ? "s" : ""}.`);
    setTimeout(() => setMsg(""), 3000);
    refresh();
  }

  function handleExport() {
    const csv = exportContacts();
    navigator.clipboard.writeText(csv).then(() => {
      setMsg("Contacts copied to clipboard.");
      setTimeout(() => setMsg(""), 3000);
    });
  }

  const entries = Object.entries(contacts);

  return (
    <section className="card contacts">
      <h3>Contacts</h3>
      <p className="dim">Private labels stored in your browser only.</p>

      {entries.length > 0 ? (
        <ul className="contact-list">
          {entries.map(([addr, name]) => (
            <li key={addr}>
              <span className="contact-name">{name}</span>
              <span className="mono dim">{addr.slice(0, 8)}...{addr.slice(-4)}</span>
              <button className="small danger" onClick={() => handleDelete(addr)}>x</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dim">No contacts yet.</p>
      )}

      <div className="contact-add">
        <input
          type="text"
          placeholder="0x..."
          value={newAddr}
          onChange={(e) => setNewAddr(e.target.value)}
        />
        <input
          type="text"
          placeholder="Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button onClick={handleAdd}>Add</button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="contact-actions">
        <button className="small" onClick={() => setShowImport(!showImport)}>
          {showImport ? "Cancel" : "Import"}
        </button>
        {entries.length > 0 && (
          <button className="small" onClick={handleExport}>Export</button>
        )}
      </div>

      {showImport && (
        <div className="contact-import">
          <textarea
            rows={5}
            placeholder={"# address,name (one per line)\n0xAbc...,Alice\n0xDef...,Bob"}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <button onClick={handleImport}>Import Contacts</button>
        </div>
      )}

      {msg && <p className="success">{msg}</p>}
    </section>
  );
}
