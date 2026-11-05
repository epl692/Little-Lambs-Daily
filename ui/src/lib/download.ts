/** Hand a generated file to the user: a normal download link, so it works offline and in an installed PWA. */
export function saveFile(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Share text with the system share sheet when there is one (phones), else download it. Returns what happened. */
export async function shareText(title: string, text: string, filename: string): Promise<'shared' | 'saved' | 'cancelled'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // any other failure: fall through to a download rather than losing the summary
    }
  }
  saveFile(filename, text, 'text/plain;charset=utf-8');
  return 'saved';
}
