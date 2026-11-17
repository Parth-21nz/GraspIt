import type { UploadAssetDocument } from '../types';
import { getCsrfToken } from './client';

export function uploadImage(file: File, onProgress: (percent: number) => void, signal: AbortSignal, endpoint: '/api/uploads' | '/api/profile/avatar' = '/api/uploads'): Promise<UploadAssetDocument> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    if (signal.aborted) { reject(new Error('Upload cancelled.')); return; }
    xhr.open('POST', endpoint);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-GraspIt-Client', 'web');
    if (getCsrfToken()) xhr.setRequestHeader('X-CSRF-Token', getCsrfToken()!);
    xhr.timeout = 60_000;
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.min(99, Math.round(event.loaded / event.total * 100))); };
    xhr.onload = () => {
      signal.removeEventListener('abort', abort);
      let body: any;
      try { body = JSON.parse(xhr.responseText); } catch { reject(new Error('The upload service returned an invalid response. Please retry.')); return; }
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve(body); }
      else reject(new Error(body.error || 'Image upload failed. Please retry.'));
    };
    xhr.onerror = xhr.ontimeout = () => { signal.removeEventListener('abort', abort); reject(new Error('The upload could not finish. Check your connection and retry.')); };
    xhr.onabort = () => { signal.removeEventListener('abort', abort); reject(new Error('Upload cancelled.')); };
    signal.addEventListener('abort', abort, { once: true });
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
