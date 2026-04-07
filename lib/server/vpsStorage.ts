import { mkdir, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * STORAGE POLICY — All user-uploaded files (projects, catalogue, offers, gallery, chat, etc.) are
 * written only to this app’s VPS disk via `getUploadRoot()` and `/api/storage/upload`. Do not add
 * alternate upload backends (third-party CDNs, Firebase Storage, etc.) for new features.
 */

/** Thrown when the target folder already contains a file with the same name (case-insensitive). */
export class DuplicateFileNameError extends Error {
  readonly code = 'DUPLICATE_FILE_NAME' as const;
  constructor(public readonly fileName: string) {
    super('duplicate_file_name');
    this.name = 'DuplicateFileNameError';
  }
}

async function fileNameExistsInDirCaseInsensitive(dir: string, fileName: string): Promise<boolean> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  const lower = fileName.toLowerCase();
  return entries.some((e) => e.toLowerCase() === lower);
}

/**
 * True if the path is a documentation placeholder (e.g. `/absolute/path/to/...`) that must not be used on disk.
 */
export function isPlaceholderUploadDirPath(resolvedAbsolute: string): boolean {
  const n = path.normalize(resolvedAbsolute).replace(/\\/g, '/');
  if (n === '/absolute' || n.startsWith('/absolute/')) return true;
  if (/^[a-zA-Z]:\/absolute(\/|$)/i.test(n)) return true;
  return false;
}

/** Absolute path where uploaded files are stored (must be under `public/` for static serving unless proxied). */
export function getUploadRoot(): string {
  const raw = process.env.VPS_UPLOAD_DIR?.trim();
  if (raw) {
    const resolved = path.resolve(raw);
    if (isPlaceholderUploadDirPath(resolved)) {
      console.warn(
        '[vpsStorage] VPS_UPLOAD_DIR looks like a documentation placeholder (e.g. /absolute/path/...). Using <cwd>/public/uploads instead. Set VPS_UPLOAD_DIR to a real writable directory on your server.'
      );
      return path.join(process.cwd(), 'public', 'uploads');
    }
    return resolved;
  }
  return path.join(process.cwd(), 'public', 'uploads');
}

/** Normalized VPS_PUBLIC_BASE_URL: path (`/uploads/...`) or absolute (`https://host/uploads/...`). */
function normalizedPublicUploadsBase(): string {
  const raw = (process.env.VPS_PUBLIC_BASE_URL || '/uploads').trim();
  return raw.replace(/\/+$/, '') || '/uploads';
}

/** Pathname prefix for files under `getUploadRoot()` (e.g. `/uploads/catalogue`). */
export function getPublicUploadsPathPrefix(): string {
  const base = normalizedPublicUploadsBase();
  if (/^https?:\/\//i.test(base)) {
    try {
      const p = new URL(base).pathname.replace(/\/+$/, '');
      return p || '/uploads';
    } catch {
      return '/uploads';
    }
  }
  return (base.startsWith('/') ? base : `/${base}`).replace(/\/+$/, '') || '/uploads';
}

/** Public URL base for the parent of `getUploadRoot()` (e.g. strip trailing `/catalogue` from base). */
function uploadsParentPublicBase(): string {
  const base = normalizedPublicUploadsBase();
  if (/^https?:\/\//i.test(base)) {
    try {
      const u = new URL(base);
      u.pathname = u.pathname.replace(/\/catalogue\/?$/i, '').replace(/\/+$/, '') || '/uploads';
      return u.href.replace(/\/+$/, '');
    } catch {
      return base.replace(/\/catalogue\/?$/i, '').replace(/\/+$/, '');
    }
  }
  const stripped = base.replace(/\/catalogue\/?$/i, '').replace(/\/+$/, '') || '/uploads';
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

function offerItemsPublicPathPrefix(): string {
  const p = getPublicUploadsPathPrefix();
  return `${p.replace(/\/catalogue$/i, '').replace(/\/+$/, '')}/offer-items`.replace(/\/{2,}/g, '/');
}

/**
 * Map a stored browser URL (path or same-origin absolute) to an on-disk path under VPS upload layout.
 * Used when files live outside `public/` (VPS_UPLOAD_DIR).
 */
export function absolutePathFromPublicFileUrl(fileUrl: string): string | null {
  const trimmed = fileUrl.trim();
  if (!trimmed) return null;

  const root = getUploadRoot();
  const uploadsParent = path.resolve(root, '..');
  const dataPrefix = getPublicUploadsPathPrefix().replace(/\/$/, '');
  const offerPrefix = offerItemsPublicPathPrefix().replace(/\/$/, '');

  const matchUnderRoot = (pathname: string): string | null => {
    const p = pathname.split('?')[0] || pathname;
    if (p === dataPrefix || p.startsWith(dataPrefix + '/')) {
      const rel = p.slice(dataPrefix.length + 1);
      if (!rel) return null;
      return path.join(root, ...rel.split('/').filter(Boolean));
    }
    return null;
  };

  const matchOfferItems = (pathname: string): string | null => {
    const p = pathname.split('?')[0] || pathname;
    if (p === offerPrefix || p.startsWith(offerPrefix + '/')) {
      const rel = p.slice(offerPrefix.length + 1);
      if (!rel) return null;
      return path.join(uploadsParent, 'offer-items', ...rel.split('/').filter(Boolean));
    }
    return null;
  };

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const pathname = (u.pathname.split('?')[0] || '').replace(/\/+$/, '') || '/';
      const underData = pathname === dataPrefix || pathname.startsWith(`${dataPrefix}/`);
      const underOffer = pathname === offerPrefix || pathname.startsWith(`${offerPrefix}/`);
      const admin = process.env.ADMIN_PANEL_URL?.trim();
      if (admin && !underData && !underOffer) {
        try {
          if (u.origin !== new URL(admin).origin) return null;
        } catch {
          /* ignore invalid ADMIN_PANEL_URL */
        }
      }
      return matchUnderRoot(pathname) ?? matchOfferItems(pathname);
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith('/')) {
    const pathname = trimmed.split('?')[0] || '';
    return matchUnderRoot(pathname) ?? matchOfferItems(pathname);
  }

  return null;
}

/** URL path or absolute base for files under upload root (default: /uploads). */
export function getPublicUploadsPrefix(): string {
  return normalizedPublicUploadsBase();
}

/** Turn an on-disk file into a browser URL (path or absolute, matching VPS_PUBLIC_BASE_URL). */
export function publicUrlPathFromAbsolute(absolutePath: string): string {
  const publicDir = path.join(process.cwd(), 'public');
  const rel = path.relative(publicDir, path.resolve(absolutePath));
  if (rel.startsWith('..')) {
    const root = getUploadRoot();
    const absResolved = path.resolve(absolutePath);
    let diskRel = path.relative(root, absResolved);
    if (diskRel.startsWith('..')) {
      const uploadsParentOnDisk = path.resolve(root, '..');
      const relFromParent = path.relative(uploadsParentOnDisk, absResolved);
      if (!relFromParent.startsWith('..') && !path.isAbsolute(relFromParent)) {
        const segments = relFromParent.split(path.sep).filter(Boolean);
        const base = uploadsParentPublicBase();
        if (/^https?:\/\//i.test(base)) {
          return `${base.replace(/\/+$/, '')}/${segments.join('/')}`;
        }
        const pathBase = base.startsWith('/') ? base : `/${base}`;
        return `${pathBase}/${segments.join('/')}`.replace(/\/{2,}/g, '/');
      }
    }
    const segments = diskRel.split(path.sep).filter(Boolean);
    const base = normalizedPublicUploadsBase();
    if (/^https?:\/\//i.test(base)) {
      return `${base.replace(/\/+$/, '')}/${segments.join('/')}`;
    }
    const pathBase = base.startsWith('/') ? base : `/${base}`;
    return `${pathBase}/${segments.join('/')}`.replace(/\/{2,}/g, '/');
  }
  return '/' + rel.split(path.sep).join('/');
}

export function folderPathToDirId(folderPath: string): string {
  return folderPath.split('/').filter(Boolean).join('__');
}

/**
 * public_id shape: projects/{projectId}/{folderPath}/{baseWithoutExt}
 * folderPath may contain slashes, e.g. 03_Reports/Acceptance_Protocols
 */
export function parseProjectPublicId(publicId: string): {
  projectId: string;
  folderPath: string;
  baseWithoutExt: string;
} | null {
  const parts = publicId.split('/').filter(Boolean);
  if (parts.length < 4 || parts[0] !== 'projects') return null;
  const projectId = parts[1]!;
  const baseWithoutExt = parts[parts.length - 1]!;
  const folderPath = parts.slice(2, -1).join('/');
  return { projectId, folderPath, baseWithoutExt };
}

export function projectUploadDir(projectId: string, folderPath: string): string {
  return path.join(getUploadRoot(), 'projects', projectId, folderPathToDirId(folderPath));
}

/** Find the on-disk file for a public_id (basename may have any extension). */
export async function resolveProjectFileAbsolute(
  publicId: string,
  hintFileName?: string
): Promise<string | null> {
  const parsed = parseProjectPublicId(publicId);
  if (!parsed) return null;
  const dir = projectUploadDir(parsed.projectId, parsed.folderPath);
  if (hintFileName && hintFileName.includes('.')) {
    const direct = path.join(dir, path.basename(hintFileName));
    try {
      await stat(direct);
      return direct;
    } catch {
      // fall through
    }
  }
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  const match = entries.find(
    (f) =>
      f === parsed.baseWithoutExt ||
      f.startsWith(parsed.baseWithoutExt + '.') ||
      path.parse(f).name === parsed.baseWithoutExt
  );
  if (!match) return null;
  return path.join(dir, match);
}

export type ProjectUploadResult = {
  public_id: string;
  secure_url: string;
  bytes: number;
  format: string;
  resource_type: string;
  storagePath: string;
  storageProvider: 'vps';
};

/** Any `public_id` like `folder/sub/fileBase` (no extension); file gets ext from originalName. */
export async function saveUploadByPublicId(params: {
  buffer: Buffer;
  publicId: string;
  originalName: string;
}): Promise<ProjectUploadResult> {
  const segments = params.publicId.split('/').filter(Boolean);
  if (segments.length < 1) {
    throw new Error('Invalid public_id');
  }
  const baseKey = segments.pop()!;
  const subDir = segments.join(path.sep);
  const ext = path.extname(params.originalName) || '.bin';
  const fileName = `${baseKey}${ext}`;
  const dir = path.join(getUploadRoot(), subDir);
  await mkdir(dir, { recursive: true });
  const absolutePath = path.join(dir, fileName);
  await writeFile(absolutePath, params.buffer);
  const public_id = [...segments, path.parse(fileName).name].join('/');
  const fmt = ext.replace(/^\./, '') || 'bin';
  return {
    public_id,
    secure_url: publicUrlPathFromAbsolute(absolutePath),
    bytes: params.buffer.length,
    format: fmt,
    resource_type: ext.toLowerCase() === '.pdf' ? 'raw' : 'image',
    storagePath: absolutePath,
    storageProvider: 'vps',
  };
}

export async function saveProjectUpload(params: {
  buffer: Buffer;
  publicId: string;
  originalName: string;
}): Promise<ProjectUploadResult> {
  const parsed = parseProjectPublicId(params.publicId);
  if (!parsed) {
    return saveUploadByPublicId(params);
  }
  const ext = path.extname(params.originalName) || '.bin';
  const safeBase = path.basename(params.originalName, ext).replace(/[^a-zA-Z0-9._-]/g, '-') || 'file';
  const fileName = `${safeBase}${ext}`;
  const dir = projectUploadDir(parsed.projectId, parsed.folderPath);
  await mkdir(dir, { recursive: true });
  const absolutePath = path.join(dir, fileName);
  if (await fileNameExistsInDirCaseInsensitive(dir, fileName)) {
    throw new DuplicateFileNameError(fileName);
  }
  await writeFile(absolutePath, params.buffer);

  const public_id = `projects/${parsed.projectId}/${parsed.folderPath}/${path.parse(fileName).name}`;
  const urlPath = publicUrlPathFromAbsolute(absolutePath);
  const fmt = ext.replace(/^\./, '') || 'bin';

  return {
    public_id,
    secure_url: urlPath,
    bytes: params.buffer.length,
    format: fmt,
    resource_type: ext.toLowerCase() === '.pdf' ? 'raw' : 'image',
    storagePath: absolutePath,
    storageProvider: 'vps',
  };
}

export type ListedResource = {
  public_id: string;
  secure_url: string;
  bytes: number;
  format: string;
  resource_type: string;
  created_at: string;
  original_filename?: string;
};

export async function listProjectResourcesByPrefix(folderPrefix: string): Promise<ListedResource[]> {
  const prefix = folderPrefix.replace(/\/+$/, '');
  const parts = prefix.split('/').filter(Boolean);
  let dir: string;
  if (parts.length >= 2 && parts[0] === 'projects') {
    const projectId = parts[1]!;
    const folderPath = parts.slice(2).join('/');
    dir = projectUploadDir(projectId, folderPath);
  } else if (parts.length > 0) {
    dir = path.join(getUploadRoot(), ...parts);
  } else {
    return [];
  }
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: ListedResource[] = [];
  for (const name of names) {
    const abs = path.join(dir, name);
    const st = await stat(abs);
    if (!st.isFile()) continue;
    const ext = path.extname(name);
    const base = path.parse(name).name;
    const public_id = `${prefix}/${base}`;
    const fmt = ext.replace(/^\./, '') || 'bin';
    out.push({
      public_id,
      secure_url: publicUrlPathFromAbsolute(abs),
      bytes: st.size,
      format: fmt,
      resource_type: ext.toLowerCase() === '.pdf' ? 'raw' : 'image',
      created_at: st.mtime.toISOString(),
      original_filename: name,
    });
  }
  return out;
}

export async function resolveGenericPublicFile(
  publicId: string,
  hintFileName?: string
): Promise<string | null> {
  const segments = publicId.split('/').filter(Boolean);
  if (segments.length < 1) return null;
  const baseKey = segments.pop()!;
  const dir = path.join(getUploadRoot(), ...segments);
  if (hintFileName && hintFileName.includes('.')) {
    const direct = path.join(dir, path.basename(hintFileName));
    try {
      await stat(direct);
      return direct;
    } catch {
      // continue
    }
  }
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  const match = entries.find(
    (f) =>
      f === baseKey ||
      f.startsWith(baseKey + '.') ||
      path.parse(f).name === baseKey
  );
  return match ? path.join(dir, match) : null;
}

export async function deleteProjectFileByPublicId(
  publicId: string,
  hintFileName?: string
): Promise<boolean> {
  let abs = await resolveProjectFileAbsolute(publicId, hintFileName);
  if (!abs) {
    abs = await resolveGenericPublicFile(publicId, hintFileName);
  }
  if (!abs) return false;
  try {
    await unlink(abs);
    return true;
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
    if (code === 'ENOENT') return true;
    throw e;
  }
}

export async function deleteFolderPrefixRecursive(folderPrefix: string): Promise<number> {
  const prefix = folderPrefix.replace(/\/+$/, '');
  const parts = prefix.split('/').filter(Boolean);
  if (parts.length < 1) return 0;
  let dir: string;
  if (parts[0] === 'projects' && parts.length >= 2) {
    const projectId = parts[1]!;
    const folderPath = parts.slice(2).join('/');
    dir = projectUploadDir(projectId, folderPath);
  } else {
    dir = path.join(getUploadRoot(), ...parts);
  }
  try {
    await rm(dir, { recursive: true, force: true });
    return 1;
  } catch {
    return 0;
  }
}

/** Gallery image under uploads/gallery/{categorySlug}/ */
export async function saveGalleryImage(params: {
  buffer: Buffer;
  category: string;
  originalName: string;
}): Promise<{ fileUrl: string; storagePath: string }> {
  const slug = params.category.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'general';
  const safe =
    path.basename(params.originalName).replace(/[^a-zA-Z0-9._-]/g, '-') || `img-${crypto.randomUUID()}`;
  const unique = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`;
  const dir = path.join(getUploadRoot(), 'gallery', slug);
  await mkdir(dir, { recursive: true });
  const absolutePath = path.join(dir, unique);
  await writeFile(absolutePath, params.buffer);
  return {
    fileUrl: publicUrlPathFromAbsolute(absolutePath),
    storagePath: absolutePath,
  };
}

export async function unlinkQuiet(absolutePath: string): Promise<void> {
  try {
    await unlink(absolutePath);
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
    if (code !== 'ENOENT') throw e;
  }
}
