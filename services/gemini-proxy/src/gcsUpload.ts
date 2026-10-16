const BUCKET = 'adaptive-macro-card-images';
let cachedToken: { token: string; expiresAt: number } | null = null;

export const getGcsToken = async (): Promise<string | null> => {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  try {
    const res = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return cachedToken.token;
  } catch {
    return null;
  }
};

export const uploadCardToGcs = async (
  filename: string,
  buffer: ArrayBuffer | Uint8Array,
  contentType = 'image/jpeg',
): Promise<string | null> => {
  const token = await getGcsToken();
  if (!token) return null;

  const url = `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(filename)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
    },
    body: Buffer.from(new Uint8Array(buffer)),
  });

  if (!res.ok) return null;
  return `https://storage.googleapis.com/${BUCKET}/${encodeURIComponent(filename)}`;
};
