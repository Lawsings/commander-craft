// Fichier: components/FileDrop.jsx
import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

export default function FileDrop({ onFiles }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const openPicker = () => inputRef.current?.click();
  const handleChange = (e) => { const files = Array.from(e.target.files || []); if (files.length) onFiles(files); e.target.value = ""; };
  const onDragOver = (e) => { e.preventDefault(); setDrag(true); };
  const onDragLeave = (e) => { e.preventDefault(); setDrag(false); };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); const files = Array.from(e.dataTransfer?.files || []); if (files.length) onFiles(files); };

  return (
    <div className={`dropzone ${drag ? 'drag' : ''}`} onClick={openPicker} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <div className="flex flex-col items-center gap-2">
        <Upload className="h-6 w-6" />
        <div className="text-sm font-medium">Cliquer pour choisir des fichiers</div>
        <div className="text-xs muted">… ou dépose-les ici (TXT, CSV/TSV, JSON)</div>
        <button type="button" className="mt-3 btn-primary">Importer ma collection</button>
      </div>
      <input ref={inputRef} type="file" accept=".txt,.csv,.tsv,.tab,.json" className="sr-only" multiple onChange={handleChange} />
    </div>
  );
}
