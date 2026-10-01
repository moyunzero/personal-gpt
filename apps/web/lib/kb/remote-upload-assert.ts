export type RemoteUploadAssertOptions = {
  url: string;
  maxBytes: number;
  allowedMimeTypes: readonly string[];
  fetchImpl?: typeof fetch;
};

export type RemoteUploadAssertFailure = {
  ok: false;
  code: "file_too_large" | "mime_not_allowed" | "untrusted_url";
  message: string;
};

/**
 * HEAD (or Range GET) the remote Blob URL and enforce size/MIME before DB register.
 */
export async function assertRemoteUploadWithinLimits(
  opts: RemoteUploadAssertOptions,
): Promise<{ ok: true } | RemoteUploadAssertFailure> {
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  let res: Response;
  try {
    res = await fetchFn(opts.url, { method: "HEAD" });
  } catch {
    res = await fetchFn(opts.url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    });
  }

  if (!res.ok && res.status !== 206) {
    return { ok: false, code: "untrusted_url", message: "无法校验远程文件大小或类型" };
  }

  const lengthHeader = res.headers.get("content-length");
  const rangeTotal = res.headers.get("content-range")?.match(/\/(\d+)\s*$/)?.[1];
  const sizeRaw = lengthHeader ?? rangeTotal;
  if (sizeRaw) {
    const size = Number(sizeRaw);
    if (Number.isFinite(size) && size > opts.maxBytes) {
      return {
        ok: false,
        code: "file_too_large",
        message: `文件超过 ${Math.round(opts.maxBytes / 1024 / 1024)}MB 上限`,
      };
    }
  }

  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (
    contentType &&
    contentType !== "application/octet-stream" &&
    !opts.allowedMimeTypes.includes(contentType)
  ) {
    return { ok: false, code: "mime_not_allowed", message: `不支持的文件类型：${contentType}` };
  }

  return { ok: true };
}
