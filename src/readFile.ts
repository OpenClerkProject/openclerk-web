// FileReader instead of Blob.text()/arrayBuffer(): functionally equivalent in every real
// browser, but far more consistently implemented across environments (including jsdom, which
// this project's tests run under -- as of jsdom 20, Blob.text()/arrayBuffer() aren't implemented
// at all).

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error(`Failed to read "${file.name}".`));
    reader.readAsText(file);
  });
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error(`Failed to read "${file.name}".`));
    reader.readAsArrayBuffer(file);
  });
}
