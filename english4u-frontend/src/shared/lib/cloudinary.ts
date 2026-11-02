import { Cloudinary } from '@cloudinary/url-gen';
import { axiosInstance } from '@/apis/axios.instance';

const CLOUD_NAME = (import.meta as any).env.VITE_CLOUDINARY_CLOUD_NAME || 'dbi95qopt';
const UPLOAD_PRESET = (import.meta as any).env.VITE_CLOUDINARY_UPLOAD_PRESET || 'english4u_unsigned';

export const cloudinary = new Cloudinary({
    cloud: { cloudName: CLOUD_NAME },
});

const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}`;

/**
 * Universal media uploader:
 * 1. Prefers secure authenticated signed upload through backend /api/media/upload
 * 2. Falls back to direct unsigned upload preset if backend is unreachable
 */
export async function uploadToCloudinary(
    file: File,
    resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto',
    folder?: string
): Promise<string> {
    const token = localStorage.getItem('token');

    // 1. Try secure backend signed upload if user is authenticated
    if (token) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            if (folder) formData.append('folder', folder);
            formData.append('resourceType', resourceType);

            const response = await axiosInstance.post<{ url: string; secureUrl?: string }>(
                'media/upload',
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                }
            );

            if (response.data?.secureUrl || response.data?.url) {
                return (response.data.secureUrl || response.data.url) as string;
            }
        } catch (backendError) {
            console.warn('Backend signed upload failed, attempting direct upload fallback:', backendError);
        }
    }

    // 2. Direct Cloudinary unsigned fallback
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
