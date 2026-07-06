export function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    return "";
  }
  return filename.slice(lastDotIndex + 1).toLowerCase();
}

export function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    // Images
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    bmp: "image/bmp",
    ico: "image/x-icon",
    // Videos
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    wmv: "video/x-ms-wmv",
    flv: "video/x-flv",
    webm: "video/webm",
    mkv: "video/x-matroska",
    // Audio
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    m4a: "audio/mp4",
    // Documents
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    rtf: "application/rtf",
    odt: "application/vnd.oasis.opendocument.text",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    // Archives
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    "7z": "application/x-7z-compressed",
    tar: "application/x-tar",
    gz: "application/gzip",
    bz2: "application/x-bzip2",
    // Code/Text
    html: "text/html",
    css: "text/css",
    js: "text/javascript",
    json: "application/json",
    xml: "application/xml",
    md: "text/markdown",
    csv: "text/csv",
  };

  return mimeTypes[extension.toLowerCase()] || "";
}

/**
 * Detects MIME type from magic bytes (like the Linux `file` command).
 * Returns empty string if unrecognized.
 */
export function detectTypeFromBytes(bytes: Uint8Array): string {
  const b = bytes;

  // Check for FGETENC encryption header
  const FGETENC_MAGIC = [0x46, 0x47, 0x45, 0x54, 0x45, 0x4e, 0x43]; // "FGETENC"
  if (bytes.length >= FGETENC_MAGIC.length) {
    const isFgetEnc = FGETENC_MAGIC.every((bv, i) => bytes[i] === bv);
    if (isFgetEnc) return "application/x-fget-encrypted";
  }
  if (b.length < 4) return "";

  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "image/png";
  // GIF: 47 49 46 38
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
    return "image/gif";
  // WEBP: 52 49 46 46 ... 57 45 42 50
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b.length >= 12 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "image/webp";
  // BMP: 42 4D
  if (b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  // PDF: 25 50 44 46
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
    return "application/pdf";
  // ZIP: 50 4B 03 04
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04)
    return "application/zip";
  // RAR: 52 61 72 21
  if (b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21)
    return "application/x-rar-compressed";
  // 7Z: 37 7A BC AF
  if (b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf)
    return "application/x-7z-compressed";
  // GZIP: 1F 8B
  if (b[0] === 0x1f && b[1] === 0x8b) return "application/gzip";
  // MP4/MOV: ftyp at offset 4
  if (
    b.length >= 8 &&
    b[4] === 0x66 &&
    b[5] === 0x74 &&
    b[6] === 0x79 &&
    b[7] === 0x70
  )
    return "video/mp4";
  // WEBM/MKV: 1A 45 DF A3
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3)
    return "video/webm";
  // AVI: 52 49 46 46 ... 41 56 49 20
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b.length >= 12 &&
    b[8] === 0x41 &&
    b[9] === 0x56 &&
    b[10] === 0x49
  )
    return "video/x-msvideo";
  // MP3: FF FB or FF F3 or FF F2 or ID3
  if (
    (b[0] === 0xff && (b[1] === 0xfb || b[1] === 0xf3 || b[1] === 0xf2)) ||
    (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33)
  )
    return "audio/mpeg";
  // WAV: 52 49 46 46 ... 57 41 56 45
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b.length >= 12 &&
    b[8] === 0x57 &&
    b[9] === 0x41 &&
    b[10] === 0x56 &&
    b[11] === 0x45
  )
    return "audio/wav";
  // FLAC: 66 4C 61 43
  if (b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43)
    return "audio/flac";
  // OGG: 4F 67 67 53
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53)
    return "audio/ogg";
  // RTF: 7B 5C 72 74
  if (b[0] === 0x7b && b[1] === 0x5c && b[2] === 0x72 && b[3] === 0x74)
    return "application/rtf";

  return "";
}

export function isPreviewable(extension: string): boolean {
  const ext = extension.toLowerCase();
  return (
    isImage(ext) ||
    isVideo(ext) ||
    isAudio(ext) ||
    isDocument(ext) ||
    isText(ext)
  );
}

export function isImage(extension: string): boolean {
  const imageExts = ["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp"];
  return imageExts.includes(extension.toLowerCase());
}

export function isVideo(extension: string): boolean {
  const videoExts = ["mp4", "avi", "mov", "wmv", "flv", "webm", "mkv"];
  return videoExts.includes(extension.toLowerCase());
}

export function isAudio(extension: string): boolean {
  const audioExts = ["mp3", "wav", "ogg", "flac", "aac", "m4a"];
  return audioExts.includes(extension.toLowerCase());
}

export function isDocument(extension: string): boolean {
  const docExts = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"];
  return docExts.includes(extension.toLowerCase());
}

export function isText(extension: string): boolean {
  const textExts = ["txt", "md", "csv", "json", "xml", "html", "css", "js"];
  return textExts.includes(extension.toLowerCase());
}

export function isArchive(extension: string): boolean {
  const archiveExts = ["zip", "rar", "7z", "tar", "gz", "bz2"];
  return archiveExts.includes(extension.toLowerCase());
}

export function isCode(extension: string): boolean {
  const codeExts = [
    "js",
    "ts",
    "jsx",
    "tsx",
    "py",
    "java",
    "c",
    "cpp",
    "cs",
    "go",
    "rs",
    "php",
    "rb",
    "swift",
    "kt",
    "html",
    "css",
    "json",
    "xml",
    "yaml",
    "yml",
    "sh",
    "bash",
  ];
  return codeExts.includes(extension.toLowerCase());
}

/**
 * Gets a human-readable file type label from a filename
 */
export function getFileTypeLabel(filename: string): string {
  const ext = getFileExtension(filename);

  if (!ext) return "N/A";

  const extUpper = ext.toUpperCase();

  // Map common extensions to friendly names
  const typeLabels: Record<string, string> = {
    JPG: "JPEG",
    JPEG: "JPEG",
    PNG: "PNG",
    GIF: "GIF",
    SVG: "SVG",
    WEBP: "WEBP",
    BMP: "BMP",
    MP4: "MP4",
    AVI: "AVI",
    MOV: "MOV",
    WEBM: "WEBM",
    MKV: "MKV",
    MP3: "MP3",
    WAV: "WAV",
    OGG: "OGG",
    FLAC: "FLAC",
    PDF: "PDF",
    DOC: "DOC",
    DOCX: "DOCX",
    TXT: "TXT",
    MD: "Markdown",
    JSON: "JSON",
    XML: "XML",
    HTML: "HTML",
    CSS: "CSS",
    JS: "JavaScript",
    ZIP: "ZIP",
    RAR: "RAR",
    "7Z": "7Z",
    XLS: "Excel",
    XLSX: "Excel",
    PPT: "PowerPoint",
    PPTX: "PowerPoint",
    CSV: "CSV",
  };

  return typeLabels[extUpper] || extUpper;
}

/**
 * Categorizes a file by its extension into a general type category
 */
export type FileCategory =
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "code"
  | "document"
  | "text"
  | "generic";

export function getFileCategory(filename: string): FileCategory {
  const ext = getFileExtension(filename);

  if (isImage(ext)) return "image";
  if (isVideo(ext)) return "video";
  if (isAudio(ext)) return "audio";
  if (isArchive(ext)) return "archive";
  if (isCode(ext)) return "code";
  if (isDocument(ext)) return "document";
  if (isText(ext)) return "text";

  return "generic";
}
