import { Cloudinary } from '@cloudinary/url-gen';

export const cloudinary = new Cloudinary({
    cloud: { cloudName: 'dbi95qopt' },
});

const CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/dbi95qopt';
const UPLOAD_PRESET = 'english4u_unsigned';

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
