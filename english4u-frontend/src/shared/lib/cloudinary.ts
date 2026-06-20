import { Cloudinary } from '@cloudinary/url-gen';

const CLOUD_NAME = (import.meta as any).env.VITE_CLOUDINARY_CLOUD_NAME || 'dbi95qopt';
const UPLOAD_PRESET = (import.meta as any).env.VITE_CLOUDINARY_UPLOAD_PRESET || 'english4u_unsigned';

export const cloudinary = new Cloudinary({
    cloud: { cloudName: CLOUD_NAME },
});

const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}`;

export async function uploadToCloudinary(
    file: File,
    resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto',
): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', UPLOAD_PRESET);

    const res = await fetch(`${CLOUDINARY_UPLOAD_URL}/${resourceType}/upload`, {
        method: 'POST',
        body: form,
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Upload failed: ${err}`);
    }

    const data = await res.json();
    return data.secure_url as string;
}
