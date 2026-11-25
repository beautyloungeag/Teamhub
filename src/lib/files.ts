// Dateianhänge (Kommentare zu Meldungen): Art erkennen, Grösse schreiben, iPhone-Originale lesbar machen.

export type FileKind = 'image' | 'video' | 'pdf' | 'file'
export const MAX_ATTACHMENTS = 6
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024

export function fileKind(type: string, name: string): FileKind {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'].includes(ext)) return 'image'
  if (type.startsWith('video/') || ['mp4', 'mov', 'm4v', 'webm'].includes(ext)) return 'video'
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf'
  return 'file'
}

export function fileSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

/** HEIC/HEIF: wo der Browser das Format lesen kann (Safari, iPhone), als JPEG speichern, damit es jedes Gerät anzeigt.
 *  Kann der Browser es nicht lesen, bleibt die Datei unverändert und erscheint als Datei zum Öffnen. */
export async function displayableImage(file: File): Promise<File> {
  if (!/image\/hei[cf]/i.test(file.type) && !/\.hei[cf]$/i.test(file.name)) return file
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 2560 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height); bmp.close()
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.hei[cf]$/i, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified })
  } catch { return file }
}
